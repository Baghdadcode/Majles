import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import { saveSession, seatWins, seedDefaults, upsertBrief } from "../src/db/store";
import { runSession } from "../src/core/orchestrator";
import { FakeProvider } from "../src/providers/fake";
import { GAME_DEV_COUNCIL } from "../src/seats/councils";
import * as t from "../src/db/schema";
import { getSessionDetail, listBriefs, listSessions, saveBrief, seedBriefs } from "../src/db/queries";

describe("persistence", () => {
  it("stores a whole session and counts seat wins", async () => {
    const db = await openDb(":memory:");
    await seedDefaults(db);
    await seedDefaults(db); // idempotent
    const brief = await upsertBrief(db, { id: "stronghold-td", name: "Stronghold TD", content: "Core loop..." });
    const order = ["skeptic", "pragmatist", "empiricist", "systems-thinker", "player-experience"];
    const preferences = Object.fromEntries(GAME_DEV_COUNCIL.seats.map((s) => [s.id, order]));
    const result = await runSession(
      { question: "Q", brief: brief.content, seats: GAME_DEV_COUNCIL.seats, mode: "full" },
      new FakeProvider({ preferences }),
    );
    await saveSession(db, { question: "Q", council: GAME_DEV_COUNCIL, brief, result, createdAt: new Date() });

    expect(await db.select().from(t.answers).all()).toHaveLength(5);
    expect(await db.select().from(t.rankings).all()).toHaveLength(20);
    expect(await db.select().from(t.verdicts).all()).toHaveLength(1);
    expect(await db.select().from(t.usage).all()).toHaveLength(11);
    const [session] = await db.select().from(t.sessions).all();
    expect(session!.briefUpdatedAt).toBeInstanceOf(Date);
    expect(await seatWins(db)).toEqual({ skeptic: 1 });
  });

  it("only bumps a brief's edited date when its content changes", async () => {
    const db = await openDb(":memory:");
    const a = await upsertBrief(db, { id: "b", name: "B", content: "one" });
    const same = await upsertBrief(db, { id: "b", name: "B", content: "one" });
    expect(same.updatedAt.getTime()).toBe(a.updatedAt.getTime());
  });

  it("reads a stored session back as a detail view with labels, rankings and tally", async () => {
    const db = await openDb(":memory:");
    await seedDefaults(db);
    const brief = await upsertBrief(db, { id: "stronghold-td", name: "Stronghold TD", content: "Core loop..." });
    const order = ["skeptic", "pragmatist", "empiricist", "systems-thinker", "player-experience"];
    const preferences = Object.fromEntries(GAME_DEV_COUNCIL.seats.map((s) => [s.id, order]));
    const result = await runSession(
      { question: "Q?", brief: brief.content, seats: GAME_DEV_COUNCIL.seats, mode: "full" },
      new FakeProvider({ preferences }),
    );
    const id = await saveSession(db, { id: "fixed-id", question: "Q?", council: GAME_DEV_COUNCIL, brief, result, createdAt: new Date() });
    expect(id).toBe("fixed-id");

    const d = (await getSessionDetail(db, id))!;
    expect(d.councilName).toBe("Game Dev");
    expect(d.brief).toMatchObject({ name: "Stronghold TD" });
    expect(d.answers.map((a) => a.label)).toEqual(["A", "B", "C", "D", "E"]);
    expect(d.rankings).toHaveLength(5);
    expect(d.rankings.map((r) => r.reviewerLabel).sort()).toEqual(["Reviewer 1", "Reviewer 2", "Reviewer 3", "Reviewer 4", "Reviewer 5"]);
    expect(d.tally?.winnerSeatId).toBe("skeptic");
    expect(d.winnerSeatId).toBe("skeptic");
    expect(d.verdict).toContain("Minority report");
    expect(d.usage.calls).toBe(11);

    const list = await listSessions(db);
    expect(list[0]).toMatchObject({ id, winnerSeatId: "skeptic", councilName: "Game Dev" });
    expect(await getSessionDetail(db, "missing")).toBeNull();
  });

  it("seeds the Stronghold TD brief once and saves edits", async () => {
    const db = await openDb(":memory:");
    await seedBriefs(db);
    await seedBriefs(db);
    const briefs = await listBriefs(db);
    expect(briefs.map((b) => b.name)).toEqual(["Stronghold TD"]);
    const created = await saveBrief(db, { name: "Other Game", content: "x" });
    const edited = await saveBrief(db, { id: created.id, name: "Other Game", content: "y" });
    expect(edited.content).toBe("y");
    expect(await listBriefs(db)).toHaveLength(2);
  });
});
