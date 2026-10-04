import { describe, expect, it } from "vitest";
import { runSession, type SessionEvent } from "../src/core/orchestrator";
import { FakeProvider } from "../src/providers/fake";
import { GAME_DEV_COUNCIL, GENERAL_COUNCIL, validateCouncil } from "../src/seats/councils";

const seats = GAME_DEV_COUNCIL.seats;
const base = { question: "Should I cap slow stacking?", seats, mode: "full" as const };

describe("runSession (fake provider)", () => {
  it("runs answering -> ranking -> counting -> synthesizing -> done", async () => {
    const states: string[] = [];
    const p = new FakeProvider();
    const r = await runSession({ ...base, onEvent: (e: SessionEvent) => e.type === "state" && states.push(e.state) }, p);
    expect(states).toEqual(["answering", "ranking", "counting", "synthesizing", "done"]);
    expect(r.state).toBe("done");
    expect(p.calls).toEqual({ answer: 5, rank: 5, synthesize: 1 });
    expect(r.tally).toBeDefined();
    expect(r.verdict).toContain("Final (full)");
    expect(r.totalCostUsd).toBeGreaterThan(0);
  });

  it("gives every reviewer a different answer set that excludes its own answer", async () => {
    const p = new FakeProvider();
    await runSession(base, p);
    for (const req of p.seen.rank) {
      expect(req.answers).toHaveLength(4);
      expect(req.answers.some((a) => a.text.includes(`from ${req.reviewer.id}.`))).toBe(false);
    }
  });

  it("never lets a seat see another seat's answer while answering", async () => {
    const p = new FakeProvider();
    await runSession({ ...base, brief: "BRIEF" }, p);
    for (const req of p.seen.answer) {
      expect(Object.keys(req).sort()).toEqual(["brief", "onText", "question", "seat"]);
      expect(req.brief).toBe("BRIEF");
    }
  });

  it("picks the seat most reviewers prefer, and reports margin", async () => {
    const order = ["skeptic", "pragmatist", "empiricist", "systems-thinker", "player-experience"];
    const preferences = Object.fromEntries(seats.map((s) => [s.id, order]));
    const r = await runSession(base, new FakeProvider({ preferences }));
    expect(r.winnerSeatId).toBe("skeptic");
    expect(r.tally!.closeRace).toBe(false);
  });

  it("hands the chairman neutral labels only (no seat names) and the tally", async () => {
    const p = new FakeProvider();
    await runSession(base, p);
    const req = p.seen.synthesize[0]!;
    expect(req.answers.map((a) => a.label)).toEqual(["A", "B", "C", "D", "E"]);
    expect(req.reviews).toHaveLength(5);
    expect(req.reviews[0]!.reviewer).toBe("Reviewer 1");
    expect(req.tally?.scores).toHaveLength(5);
  });

  it("continues without a failed seat while at least 4 answers remain", async () => {
    const p = new FakeProvider({ failAnswerFor: ["pragmatist"] });
    const r = await runSession(base, p);
    expect(r.state).toBe("done");
    expect(r.answers).toHaveLength(4);
    expect(r.failedSeats).toEqual([expect.objectContaining({ seatId: "pragmatist", stage: "answer" })]);
    expect(p.calls.rank).toBe(4);
  });

  it("fails when fewer than 4 answers remain", async () => {
    const r = await runSession(base, new FakeProvider({ failAnswerFor: ["pragmatist", "skeptic"] }));
    expect(r.state).toBe("failed");
    expect(r.error).toMatch(/at least 4/);
  });

  it("survives a failed reviewer", async () => {
    const r = await runSession(base, new FakeProvider({ failRankFor: ["empiricist"] }));
    expect(r.state).toBe("done");
    expect(r.rankings).toHaveLength(4);
  });

  it("falls back to chairman-decides when no ranking survives", async () => {
    const r = await runSession(base, new FakeProvider({ failRankFor: seats.map((s) => s.id) }));
    expect(r.state).toBe("done");
    expect(r.effectiveMode).toBe("chairman");
  });

  it("chairman mode skips ranking and counting", async () => {
    const states: string[] = [];
    const p = new FakeProvider();
    const r = await runSession({ ...base, mode: "chairman", onEvent: (e) => e.type === "state" && states.push(e.state) }, p);
    expect(states).toEqual(["answering", "synthesizing", "done"]);
    expect(p.calls.rank).toBe(0);
    expect(r.tally).toBeUndefined();
  });
});

describe("councils", () => {
  it("ships Game Dev (default) and General with 5 seats", () => {
    expect(GAME_DEV_COUNCIL.isDefault).toBe(true);
    expect(GAME_DEV_COUNCIL.seats.map((s) => s.id)).toEqual(["player-experience", "empiricist", "skeptic", "systems-thinker", "pragmatist"]);
    expect(GENERAL_COUNCIL.seats.map((s) => s.id)).toEqual(["first-principles", "empiricist", "skeptic", "systems-thinker", "pragmatist"]);
  });
  it("enforces 5 to 7 seats", () => {
    expect(() => validateCouncil(seats.slice(0, 4))).toThrow();
    expect(() => validateCouncil(seats)).not.toThrow();
  });
  it("uses high effort for the skeptic and chairman, medium for the rest", () => {
    const efforts = Object.fromEntries(seats.map((s) => [s.id, s.effort]));
    expect(efforts).toMatchObject({ skeptic: "high", empiricist: "medium", pragmatist: "medium" });
  });
});
