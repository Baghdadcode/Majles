import { describe, expect, it } from "vitest";
import { anonymizeFor, shuffle, stripSeatIdentifiers } from "../src/core/anonymize";
import { GAME_DEV_COUNCIL } from "../src/seats/councils";

const seats = GAME_DEV_COUNCIL.seats;
const answers = seats.map((s) => ({ answerId: `ans-${s.id}`, seatId: s.id, text: `text of ${s.id}` }));
const names = seats.map((s) => s.name);

describe("anonymizeFor", () => {
  it("never shows a reviewer its own answer (no self-ranking)", () => {
    for (const reviewer of seats) {
      const a = anonymizeFor(reviewer, answers, names);
      expect(a.presented).toHaveLength(seats.length - 1);
      expect(a.presented.map((p) => p.answerId)).not.toContain(`ans-${reviewer.id}`);
    }
  });

  it("labels answers A.. in order and maps labels back to answers", () => {
    const a = anonymizeFor(seats[0]!, answers, names);
    expect(a.presented.map((p) => p.label)).toEqual(["A", "B", "C", "D"]);
    for (const p of a.presented) expect(a.labelToAnswerId.get(p.label)).toBe(p.answerId);
  });

  it("uses a fresh random order for each reviewer", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 40; i++) {
      orders.add(anonymizeFor(seats[0]!, answers, names).presented.map((p) => p.answerId).join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("is deterministic for a seeded rng", () => {
    const rng = () => 0.3;
    const a = anonymizeFor(seats[0]!, answers, names, rng).presented.map((p) => p.answerId);
    const b = anonymizeFor(seats[0]!, answers, names, rng).presented.map((p) => p.answerId);
    expect(a).toEqual(b);
  });

  it("shuffle keeps all elements", () => {
    expect(shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("stripSeatIdentifiers", () => {
  it("removes identifying headings and 'As the X' phrasing", () => {
    const text = "## Skeptic\n\nAs the Skeptic, I doubt it.\n\n## Verdict\nNo.";
    const out = stripSeatIdentifiers(text, names);
    expect(out).not.toMatch(/skeptic/i);
    expect(out).toContain("## Verdict");
  });

  it("leaves unrelated uses of ordinary words alone", () => {
    expect(stripSeatIdentifiers("Players are skeptical of this.", names)).toBe("Players are skeptical of this.");
  });
});
