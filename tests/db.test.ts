import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import { saveSession, seatWins, seedDefaults, upsertBrief } from "../src/db/store";
import { runSession } from "../src/core/orchestrator";
import { FakeProvider } from "../src/providers/fake";
import { GAME_DEV_COUNCIL } from "../src/seats/councils";
import * as t from "../src/db/schema";

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
});
