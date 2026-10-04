import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { CouncilDb } from "./client";
import * as t from "./schema";
import { COUNCILS } from "../seats/councils";
import { ALL_SEATS, CHAIRMAN } from "../seats/definitions";
import type { SessionResult } from "../core/orchestrator";
import type { CouncilDef, SeatDef, SessionBrief } from "../core/types";

/** Inserts seat versions and the built-in councils if they are not stored yet. */
export async function seedDefaults(db: CouncilDb): Promise<void> {
  for (const seat of [...ALL_SEATS, CHAIRMAN]) await saveSeat(db, seat);
  for (const council of COUNCILS) {
    await db
      .insert(t.councils)
      .values({ id: council.id, name: council.name, isDefault: council.isDefault })
      .onConflictDoNothing()
      .run();
    for (const [position, seat] of council.seats.entries()) {
      await db
        .insert(t.councilSeats)
        .values({ councilId: council.id, advisorId: seat.id, advisorVersion: seat.version, position })
        .onConflictDoNothing()
        .run();
    }
  }
}

export async function saveSeat(db: CouncilDb, seat: SeatDef): Promise<void> {
  await db
    .insert(t.advisors)
    .values({
      id: seat.id,
      version: seat.version,
      name: seat.name,
      method: seat.method,
      alwaysAsks: seat.alwaysAsks,
      mayIgnore: seat.mayIgnore,
      sections: seat.sections,
      model: seat.model,
      effort: seat.effort,
    })
    .onConflictDoNothing()
    .run();
}

export async function upsertBrief(
  db: CouncilDb,
  brief: { id: string; name: string; content: string },
): Promise<SessionBrief> {
  const updatedAt = new Date();
  const existing = await db.select().from(t.briefs).where(eq(t.briefs.id, brief.id)).get();
  if (existing && existing.content === brief.content) {
    return { id: existing.id, name: existing.name, content: existing.content, updatedAt: existing.updatedAt };
  }
  await db
    .insert(t.briefs)
    .values({ ...brief, updatedAt })
    .onConflictDoUpdate({ target: t.briefs.id, set: { name: brief.name, content: brief.content, updatedAt } })
    .run();
  return { ...brief, updatedAt };
}

export async function saveSession(
  db: CouncilDb,
  args: { question: string; council: CouncilDef; brief?: SessionBrief; result: SessionResult; createdAt: Date },
): Promise<string> {
  const { question, council, brief, result } = args;
  const sessionId = randomUUID();
  const answerRowId = new Map<string, string>(result.answers.map((a) => [a.answerId, `${sessionId}:${a.answerId}`]));

  await db.transaction(async (tx) => {
    await tx.insert(t.sessions)
      .values({
        id: sessionId,
        question,
        councilId: council.id,
        briefId: brief?.id ?? null,
        briefContent: brief?.content ?? null,
        briefUpdatedAt: brief?.updatedAt ?? null,
        mode: result.mode,
        effectiveMode: result.effectiveMode,
        state: result.state,
        error: result.error ?? null,
        winnerAnswerId: result.tally?.winnerId ? answerRowId.get(result.tally.winnerId) ?? null : null,
        marginFraction: result.tally?.marginFraction ?? null,
        closeRace: result.tally?.closeRace ?? null,
        totalCostUsd: result.totalCostUsd,
        createdAt: args.createdAt,
        finishedAt: new Date(),
      })
      .run();

    for (const a of result.answers) {
      const seat = council.seats.find((s) => s.id === a.seatId)!;
      const id = answerRowId.get(a.answerId)!;
      await tx.insert(t.answers)
        .values({ id, sessionId, advisorId: seat.id, advisorVersion: seat.version, text: a.text, status: "ok" })
        .run();
    }
    for (const f of result.failedSeats.filter((x) => x.stage === "answer")) {
      const seat = council.seats.find((s) => s.id === f.seatId)!;
      await tx.insert(t.answers)
        .values({
          id: `${sessionId}:failed-${f.seatId}`,
          sessionId,
          advisorId: seat.id,
          advisorVersion: seat.version,
          status: "failed",
          error: f.error,
        })
        .run();
    }
    for (const r of result.rankings) {
      const n = r.items.length;
      for (const i of r.items) {
        await tx.insert(t.rankings)
          .values({
            sessionId,
            reviewerAdvisorId: r.reviewerId,
            answerId: answerRowId.get(i.answerId)!,
            label: i.label,
            rank: i.rank,
            points: n - i.rank,
            correctness: i.correctness,
            reasoningQuality: i.reasoningQuality,
            usefulness: i.usefulness,
            risksCovered: i.risksCovered,
            reasoning: i.reasoning,
          })
          .run();
      }
    }
    if (result.verdict) {
      await tx.insert(t.verdicts)
        .values({ sessionId, text: result.verdict, chairmanAdvisorId: CHAIRMAN.id, mode: result.effectiveMode })
        .run();
    }
    for (const u of result.usage) await tx.insert(t.usage).values({ sessionId, ...u }).run();
  });
  return sessionId;
}

/** Wins per seat across all stored sessions (feeds the Phase 4 track record). */
export async function seatWins(db: CouncilDb): Promise<Record<string, number>> {
  const rows = await db
    .select({ id: t.sessions.winnerAnswerId })
    .from(t.sessions)
    .where(and(eq(t.sessions.state, "done")))
    .all();
  const wins: Record<string, number> = {};
  for (const r of rows) {
    if (!r.id) continue;
    const seat = r.id.split(":ans-")[1];
    if (seat) wins[seat] = (wins[seat] ?? 0) + 1;
  }
  return wins;
}
