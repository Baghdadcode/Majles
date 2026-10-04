import { describe, expect, it } from "vitest";
import { splitVerdict } from "../src/core/view";
import { estimateSessionCost } from "../src/core/estimate";
import { initialModel, reduce } from "../src/components/model";
import { GAME_DEV_COUNCIL } from "../src/seats/councils";
import { CHAIRMAN } from "../src/seats/definitions";

describe("splitVerdict", () => {
  it("separates the minority report", () => {
    expect(splitVerdict("## Verdict\nDo X.\n\n## Minority report\nB disagreed.")).toEqual({ main: "## Verdict\nDo X.", minority: "B disagreed." });
  });
  it("returns no minority report when there is none", () => {
    expect(splitVerdict("## Verdict\nDo X.")).toEqual({ main: "## Verdict\nDo X.", minority: null });
  });
});

describe("estimateSessionCost", () => {
  const base = { seats: GAME_DEV_COUNCIL.seats, chairman: CHAIRMAN };
  it("lands near the measured cost of a real full session (~$0.59)", () => {
    const usd = estimateSessionCost({ ...base, mode: "full", briefChars: 3200, questionChars: 400 });
    expect(usd).toBeGreaterThan(0.45);
    expect(usd).toBeLessThan(0.75);
  });
  it("is cheaper in chairman mode and with Sonnet seats", () => {
    const full = estimateSessionCost({ ...base, mode: "full" });
    expect(estimateSessionCost({ ...base, mode: "chairman" })).toBeLessThan(full);
    const sonnet = GAME_DEV_COUNCIL.seats.map((s) => ({ ...s, model: "claude-sonnet-5-5" as const }));
    expect(estimateSessionCost({ seats: sonnet, chairman: CHAIRMAN, mode: "full" })).toBeLessThan(full);
  });
});

describe("live session reducer", () => {
  const seats = GAME_DEV_COUNCIL.seats.map((s) => ({ id: s.id, name: s.name, model: s.model, effort: s.effort }));
  it("accumulates streamed answer text and marks seats done or failed", () => {
    let m = initialModel(seats, "full");
    m = reduce(m, { type: "answer_delta", seatId: "skeptic", text: "## Ver" });
    m = reduce(m, { type: "answer_delta", seatId: "skeptic", text: "dict" });
    expect(m.answers.skeptic).toEqual({ text: "## Verdict", status: "streaming" });
    m = reduce(m, { type: "answer_done", seatId: "skeptic" });
    m = reduce(m, { type: "answer_failed", seatId: "pragmatist", error: "boom" });
    expect(m.answers.skeptic!.status).toBe("done");
    expect(m.answers.pragmatist).toMatchObject({ status: "failed", error: "boom" });
  });
  it("tracks stage, rankings, tally, cost and verdict", () => {
    let m = initialModel(seats, "full");
    m = reduce(m, { type: "state", state: "ranking" });
    m = reduce(m, { type: "ranking_done", reviewerId: "skeptic", reviewerLabel: "Reviewer 1", items: [{ answerSeatId: "empiricist", rank: 1, reasoning: "r" }] });
    m = reduce(m, { type: "tally", tally: { entries: [], winnerSeatId: "empiricist", marginFraction: 0.2, closeRace: false, tie: false } });
    m = reduce(m, { type: "cost", totalUsd: 0.42 });
    m = reduce(m, { type: "verdict_delta", text: "## Verdict" });
    expect(m).toMatchObject({ stage: "ranking", costUsd: 0.42, verdict: "## Verdict", effectiveMode: "full" });
    expect(m.rankings).toHaveLength(1);
    expect(m.tally?.winnerSeatId).toBe("empiricist");
  });
  it("marks a full-vote session as chairman-decided when the verdict starts without a tally", () => {
    const m = reduce(initialModel(seats, "full"), { type: "verdict_delta", text: "x" });
    expect(m.effectiveMode).toBe("chairman");
  });
});
