import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const SKILL = join(__dirname, "..", ".claude", "skills", "majles");
const SCRIPT = join(SKILL, "scripts", "council.mjs");

interface Role {
  id: string;
  name: string;
  group: string;
  scope: string;
  method: string;
  alwaysAsks: string[];
  mayIgnore: string;
}
interface Council {
  id: string;
  name: string;
  roles: string[];
}

const roles = (parse(readFileSync(join(SKILL, "roles.yaml"), "utf8")) as { roles: Role[] }).roles;
const councils = (parse(readFileSync(join(SKILL, "councils.yaml"), "utf8")) as { councils: Council[] }).councils;

function run(args: string[], input?: unknown): unknown {
  const out = execFileSync("node", [SCRIPT, ...args], {
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: "utf8",
  });
  return JSON.parse(out);
}

describe("majles roles.yaml", () => {
  it("has 14 complete roles with unique ids", () => {
    expect(roles).toHaveLength(14);
    expect(new Set(roles.map((r) => r.id)).size).toBe(roles.length);
    for (const r of roles) {
      expect(r.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(["think", "test", "build", "people"]).toContain(r.group);
      expect(["any", "games", "non-games"]).toContain(r.scope);
      expect(r.name && r.method && r.mayIgnore).toBeTruthy();
      expect(r.alwaysAsks.length).toBeGreaterThan(0);
    }
  });
});

describe("majles councils.yaml", () => {
  const byId = new Map(roles.map((r) => [r.id, r]));

  it.each(councils.map((c) => [c.id, c] as const))("%s follows the selection rules", (_id, c) => {
    expect(c.roles).toHaveLength(5);
    expect(new Set(c.roles).size).toBe(5);
    const picked = c.roles.map((id) => {
      const role = byId.get(id);
      expect(role, `unknown role ${id}`).toBeDefined();
      return role!;
    });
    expect(picked.some((r) => r.group === "test")).toBe(true);
    for (const g of ["think", "test", "build", "people"]) {
      expect(picked.filter((r) => r.group === g).length).toBeLessThanOrEqual(2);
    }
    const ids = new Set(c.roles);
    expect(ids.has("player-experience") && ids.has("user-advocate")).toBe(false);
    // Quick mode uses the first three: they must still include a test role.
    expect(picked.slice(0, 3).some((r) => r.group === "test")).toBe(true);
  });
});

describe("council.mjs assign", () => {
  it("labels every role once and never shows a role its own answer", () => {
    const ids = ["skeptic", "pragmatist", "architect", "tester", "designer"];
    const { labels, reviewOrders } = run(["assign", ...ids]) as {
      labels: Record<string, string>;
      reviewOrders: Record<string, string[]>;
    };
    expect(Object.keys(labels).sort()).toEqual(["A", "B", "C", "D", "E"]);
    expect(Object.values(labels).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const order = reviewOrders[id]!;
      expect(order).toHaveLength(4);
      expect(order.map((l) => labels[l])).not.toContain(id);
    }
  });

  it("rejects duplicates", () => {
    expect(() => run(["assign", "skeptic", "skeptic"])).toThrow();
  });
});

describe("council.mjs tally", () => {
  const labels = { A: "skeptic", B: "pragmatist", C: "architect" };

  it("counts Borda points and drops each reviewer's own answer", () => {
    const result = run(["tally"], {
      labels,
      reviews: [
        // Panel style: the skeptic lens ranks all three, including its own answer A.
        { reviewer: "skeptic", ranking: ["A", "B", "C"] },
        { reviewer: "pragmatist", ranking: ["C", "A"] },
        { reviewer: "architect", ranking: ["B", "A"] },
      ],
    }) as { entries: { label: string; points: number; maxPossible: number }[]; winner: string; counted: number };
    const byLabel = Object.fromEntries(result.entries.map((e) => [e.label, e]));
    // skeptic -> B:1 C:0 ; pragmatist -> C:1 A:0 ; architect -> B:1 A:0
    expect(byLabel.B).toMatchObject({ points: 2, maxPossible: 2 });
    expect(byLabel.C).toMatchObject({ points: 1, maxPossible: 2 });
    expect(byLabel.A).toMatchObject({ points: 0, maxPossible: 2 });
    expect(result.winner).toBe("B");
    expect(result.counted).toBe(3);
  });

  it("flags a tie and skips invalid reviews instead of guessing", () => {
    const result = run(["tally"], {
      labels,
      reviews: [
        // A round robin: every answer gets 1 of 2 possible points.
        { reviewer: "skeptic", ranking: ["B", "C"] },
        { reviewer: "pragmatist", ranking: ["C", "A"] },
        { reviewer: "architect", ranking: ["A", "B"] },
        { reviewer: "nobody", ranking: ["Z", "A", "B"] },
        { reviewer: "skeptic", ranking: ["B", "B"] },
      ],
    }) as { tie: boolean; closeRace: boolean; winner: string | null; skipped: unknown[] };
    expect(result.skipped).toHaveLength(2);
    expect(result.tie).toBe(true);
    expect(result.closeRace).toBe(true);
    expect(result.winner).toBeNull();
  });

  it("falls back to the chairman when no review is valid", () => {
    const result = run(["tally"], { labels, reviews: [] }) as { counted: number; note: string };
    expect(result.counted).toBe(0);
    expect(result.note).toMatch(/chairman/);
  });
});
