// Server-side singletons for the Next.js app: database, provider, API-key status and live session runs.
// Imported only by route handlers, server components and instrumentation; the API key never leaves this process.
import { randomUUID } from "node:crypto";
import { openDb, type CouncilDb } from "../db/client";
import { saveSession, seedDefaults } from "../db/store";
import { getBrief, seedBriefs } from "../db/queries";
import { runSession, type SessionEvent } from "../core/orchestrator";
import { ClaudeProvider, checkApiKey } from "../providers/claude";
import { FakeProvider } from "../providers/fake";
import { getCouncil } from "../seats/councils";
import { loadEnv, MissingApiKeyError } from "../config/env";
import type { CouncilProvider, SessionBrief, VotingMode } from "../core/types";

export type StreamEvent =
  | SessionEvent
  | {
      type: "started";
      sessionId: string;
      question: string;
      councilId: string;
      mode: VotingMode;
      seatIds: string[];
      brief: { name: string; updatedAt: string } | null;
    }
  | { type: "saved"; sessionId: string }
  | { type: "error"; message: string };

interface LiveRun {
  events: StreamEvent[];
  listeners: Set<(e: StreamEvent) => void>;
  finished: boolean;
}

interface Globals {
  db?: Promise<CouncilDb>;
  provider?: CouncilProvider;
  keyStatus?: Promise<KeyStatus>;
  runs?: Map<string, LiveRun>;
}

// Survives Next.js dev hot reloads, which re-evaluate modules.
const g = globalThis as typeof globalThis & { __council?: Globals };
const state: Globals = (g.__council ??= {});

export const isFake = () => {
  loadEnv();
  return process.env.COUNCIL_FAKE === "1";
};

export function getDb(): Promise<CouncilDb> {
  state.db ??= (async () => {
    // Fake runs get their own file so canned sessions never mix with real ones.
    const db = await openDb(isFake() && !process.env.COUNCIL_DB_PATH ? "./data/council-fake.db" : undefined);
    await seedDefaults(db);
    await seedBriefs(db);
    return db;
  })();
  return state.db;
}

export function getProvider(): CouncilProvider {
  state.provider ??= isFake() ? new FakeProvider({ chunkDelayMs: 20 }) : new ClaudeProvider();
  return state.provider;
}

export type KeyStatus = { ok: true; fake: boolean } | { ok: false; error: string };

/** Startup check: one cheap Models API call. Cached; pass recheck to try again after fixing .env.local. */
export function getKeyStatus(recheck = false): Promise<KeyStatus> {
  if (recheck || !state.keyStatus) {
    state.keyStatus = (async (): Promise<KeyStatus> => {
      if (isFake()) return { ok: true, fake: true };
      try {
        await checkApiKey();
        return { ok: true, fake: false };
      } catch (err) {
        const missing = err instanceof MissingApiKeyError;
        return {
          ok: false,
          error: missing
            ? err.message
            : `${err instanceof Error ? err.message : String(err)} Council needs a Console API key (console.anthropic.com) in .env.local; a Claude.ai subscription will not work.`,
        };
      }
    })();
  }
  return state.keyStatus;
}

const runs = (): Map<string, LiveRun> => (state.runs ??= new Map());

export interface StartInput {
  question: string;
  councilId: string;
  briefId?: string | null;
  mode: VotingMode;
}

/** Starts a council session in the background and returns its id; progress is delivered via subscribe(). */
export async function startSession(input: StartInput): Promise<string> {
  const council = getCouncil(input.councilId);
  const db = await getDb();
  const briefView = input.briefId ? await getBrief(db, input.briefId) : null;
  if (input.briefId && !briefView) throw new Error(`Unknown brief "${input.briefId}"`);
  const brief: SessionBrief | undefined = briefView
    ? { id: briefView.id, name: briefView.name, content: briefView.content, updatedAt: new Date(briefView.updatedAt) }
    : undefined;

  const id = randomUUID();
  const run: LiveRun = { events: [], listeners: new Set(), finished: false };
  runs().set(id, run);
  const push = (e: StreamEvent) => {
    run.events.push(e);
    for (const l of run.listeners) l(e);
  };
  push({
    type: "started",
    sessionId: id,
    question: input.question,
    councilId: council.id,
    mode: input.mode,
    seatIds: council.seats.map((s) => s.id),
    brief: briefView ? { name: briefView.name, updatedAt: briefView.updatedAt } : null,
  });

  const createdAt = new Date();
  void (async () => {
    try {
      const result = await runSession(
        { question: input.question, brief: brief?.content, seats: council.seats, mode: input.mode, onEvent: push },
        getProvider(),
      );
      await saveSession(db, { id, question: input.question, council, brief, result, createdAt });
      push({ type: "saved", sessionId: id });
    } catch (err) {
      push({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      run.finished = true;
      // Keep the buffer briefly so a reconnecting browser can replay it, then drop it.
      setTimeout(() => runs().delete(id), 10 * 60_000).unref?.();
    }
  })();
  return id;
}

export function getLiveRun(id: string): { events: StreamEvent[]; finished: boolean } | null {
  const r = runs().get(id);
  return r ? { events: r.events, finished: r.finished } : null;
}

/** Replays buffered events, then forwards new ones. Returns an unsubscribe function. */
export function subscribe(id: string, listener: (e: StreamEvent) => void): (() => void) | null {
  const r = runs().get(id);
  if (!r) return null;
  for (const e of r.events) listener(e);
  if (r.finished) return () => undefined;
  r.listeners.add(listener);
  return () => r.listeners.delete(listener);
}
