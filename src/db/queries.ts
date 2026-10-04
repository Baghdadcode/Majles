import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { asc, desc, eq } from "drizzle-orm";
import type { CouncilDb } from "./client";
import * as t from "./schema";
import { bordaCount } from "../core/borda";
import { COUNCILS } from "../seats/councils";
import { ALL_SEATS, CHAIRMAN } from "../seats/definitions";
import type { BriefView, CouncilView, SessionDetailView, SessionSummaryView } from "../core/view";
import type { VotingMode } from "../core/types";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function listCouncils(): CouncilView[] {
  return COUNCILS.map((c) => ({
    id: c.id,
    name: c.name,
    isDefault: c.isDefault,
    seats: c.seats.map((s) => ({ id: s.id, name: s.name, model: s.model, effort: s.effort })),
  }));
}

const STRONGHOLD_TEMPLATE = `# Stronghold TD

## Core loop

## Towers and enemies

## Economy

## Current problems
`;

/** Creates the first brief (Stronghold TD) when none exist, from ./stronghold-td.md if it is there. */
export async function seedBriefs(db: CouncilDb): Promise<void> {
  const existing = await db.select({ id: t.briefs.id }).from(t.briefs).limit(1).all();
  if (existing.length > 0) return;
  const content = existsSync("stronghold-td.md") ? readFileSync("stronghold-td.md", "utf8") : STRONGHOLD_TEMPLATE;
  await db.insert(t.briefs).values({ id: "stronghold-td", name: "Stronghold TD", content, updatedAt: new Date() }).run();
}

const toBriefView = (b: typeof t.briefs.$inferSelect): BriefView => ({
  id: b.id,
  name: b.name,
  content: b.content,
  updatedAt: b.updatedAt.toISOString(),
});

export async function listBriefs(db: CouncilDb): Promise<BriefView[]> {
  return (await db.select().from(t.briefs).orderBy(asc(t.briefs.name)).all()).map(toBriefView);
}

export async function getBrief(db: CouncilDb, id: string): Promise<BriefView | null> {
  const b = await db.select().from(t.briefs).where(eq(t.briefs.id, id)).get();
  return b ? toBriefView(b) : null;
}

export async function saveBrief(
  db: CouncilDb,
  input: { id?: string; name: string; content: string },
): Promise<BriefView> {
  const id = input.id ?? `${slug(input.name) || "brief"}-${randomUUID().slice(0, 6)}`;
  const existing = input.id ? await db.select().from(t.briefs).where(eq(t.briefs.id, input.id)).get() : undefined;
  // Only an actual change counts as an edit, so a session's "brief last edited" date stays meaningful.
  if (existing && existing.name === input.name && existing.content === input.content) return toBriefView(existing);
  const updatedAt = new Date();
  await db
    .insert(t.briefs)
    .values({ id, name: input.name, content: input.content, updatedAt })
    .onConflictDoUpdate({ target: t.briefs.id, set: { name: input.name, content: input.content, updatedAt } })
    .run();
  return { id, name: input.name, content: input.content, updatedAt: updatedAt.toISOString() };
}

export async function deleteBrief(db: CouncilDb, id: string): Promise<void> {
  await db.delete(t.briefs).where(eq(t.briefs.id, id)).run();
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

const seatIdOfAnswer = (answerId: string) => answerId.split(":ans-")[1] ?? answerId;

export async function listSessions(db: CouncilDb, limit = 100): Promise<SessionSummaryView[]> {
  const rows = await db.select().from(t.sessions).orderBy(desc(t.sessions.createdAt)).limit(limit).all();
  const names = new Map(COUNCILS.map((c) => [c.id, c.name]));
  return rows.map((r) => ({
    id: r.id,
    question: r.question,
    councilName: names.get(r.councilId) ?? r.councilId,
    mode: r.mode as VotingMode,
    state: r.state,
    winnerSeatId: r.winnerAnswerId ? seatIdOfAnswer(r.winnerAnswerId) : null,
    closeRace: r.closeRace,
    totalCostUsd: r.totalCostUsd,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getSessionDetail(db: CouncilDb, id: string): Promise<SessionDetailView | null> {
  const s = await db.select().from(t.sessions).where(eq(t.sessions.id, id)).get();
  if (!s) return null;
  const briefRow = s.briefId ? await db.select({ name: t.briefs.name }).from(t.briefs).where(eq(t.briefs.id, s.briefId)).get() : undefined;
  const [answerRows, rankingRows, verdict, usageRows] = await Promise.all([
    db.select().from(t.answers).where(eq(t.answers.sessionId, id)).all(),
    db.select().from(t.rankings).where(eq(t.rankings.sessionId, id)).orderBy(asc(t.rankings.id)).all(),
    db.select().from(t.verdicts).where(eq(t.verdicts.sessionId, id)).get(),
    db.select().from(t.usage).where(eq(t.usage.sessionId, id)).all(),
  ]);

  const council = COUNCILS.find((c) => c.id === s.councilId);
  const seatDefs = new Map([...ALL_SEATS, CHAIRMAN].map((x) => [x.id, x]));
  const seatIds = council ? council.seats.map((x) => x.id) : [...new Set(answerRows.map((a) => a.advisorId))];
  const seats = seatIds.map((sid) => {
    const d = seatDefs.get(sid);
    return { id: sid, name: d?.name ?? sid, model: d?.model ?? "", effort: d?.effort ?? "" };
  });

  const answerSeat = new Map(answerRows.map((a) => [a.id, a.advisorId]));
  const rankings = new Map<string, SessionDetailView["rankings"][number]>();
  for (const r of rankingRows) {
    const entry = rankings.get(r.reviewerAdvisorId) ?? {
      reviewerSeatId: r.reviewerAdvisorId,
      reviewerLabel: r.reviewerLabel,
      items: [],
    };
    entry.items.push({ answerSeatId: answerSeat.get(r.answerId) ?? r.answerId, rank: r.rank, reasoning: r.reasoning });
    rankings.set(r.reviewerAdvisorId, entry);
  }
  const rankingList = [...rankings.values()].map((r) => ({ ...r, items: r.items.sort((a, b) => a.rank - b.rank) }));

  let tally: SessionDetailView["tally"] = null;
  const okAnswers = answerRows.filter((a) => a.status === "ok");
  if (rankingList.length > 0 && okAnswers.length > 1) {
    const t2 = bordaCount(
      okAnswers.map((a) => a.advisorId),
      rankingList.map((r) => ({ reviewer: r.reviewerSeatId, items: r.items.map((i) => ({ answerId: i.answerSeatId, rank: i.rank })) })),
    );
    tally = {
      entries: t2.entries.map((e) => ({ seatId: e.answerId, points: e.points, maxPossible: e.maxPossible, fraction: e.fraction })),
      winnerSeatId: t2.winnerId,
      marginFraction: t2.marginFraction,
      closeRace: t2.closeRace,
      tie: t2.tie,
    };
  }

  const order = new Map(seatIds.map((sid, i) => [sid, i]));
  return {
    id: s.id,
    question: s.question,
    councilId: s.councilId,
    councilName: council?.name ?? s.councilId,
    mode: s.mode as VotingMode,
    effectiveMode: s.effectiveMode as VotingMode,
    state: s.state,
    error: s.error,
    winnerSeatId: s.winnerAnswerId ? seatIdOfAnswer(s.winnerAnswerId) : null,
    closeRace: s.closeRace,
    totalCostUsd: s.totalCostUsd,
    createdAt: s.createdAt.toISOString(),
    finishedAt: iso(s.finishedAt),
    brief: s.briefId && s.briefUpdatedAt ? { id: s.briefId, name: briefRow?.name ?? s.briefId, updatedAt: s.briefUpdatedAt.toISOString() } : null,
    seats,
    answers: answerRows
      .map((a) => ({ seatId: a.advisorId, label: a.label, text: a.text, status: a.status, error: a.error }))
      .sort((a, b) => (order.get(a.seatId) ?? 99) - (order.get(b.seatId) ?? 99)),
    rankings: rankingList,
    tally,
    verdict: verdict?.text ?? null,
    usage: {
      calls: usageRows.length,
      inputTokens: usageRows.reduce((n, u) => n + u.inputTokens, 0),
      outputTokens: usageRows.reduce((n, u) => n + u.outputTokens, 0),
      cacheReadTokens: usageRows.reduce((n, u) => n + u.cacheReadTokens, 0),
      cacheWriteTokens: usageRows.reduce((n, u) => n + u.cacheWriteTokens, 0),
    },
  };
}
