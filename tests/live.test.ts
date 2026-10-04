import { describe, expect, it } from "vitest";
import { ClaudeProvider, checkApiKey } from "../src/providers/claude";
import { runSession } from "../src/core/orchestrator";
import { GAME_DEV_COUNCIL } from "../src/seats/councils";
import { loadEnv } from "../src/config/env";

loadEnv();
// Opt-in: `npm run test:live` sets LIVE=1. Skipped by default so tests never spend money.
describe.skipIf(!process.env.LIVE)("live smoke test (real API)", () => {
  it("accepts the API key", async () => {
    await expect(checkApiKey()).resolves.toBeUndefined();
  });

  it("runs a full session with a brief and sees prompt-cache reads", async () => {
    const provider = new ClaudeProvider();
    const brief = `Stronghold TD is a tower defense game.\n${"Towers, enemies, economy and progression notes. ".repeat(900)}`;
    const result = await runSession(
      { question: "Should slow towers stack? Answer briefly.", brief, seats: GAME_DEV_COUNCIL.seats, mode: "full" },
      provider,
    );
    expect(result.state).toBe("done");
    expect(result.tally).toBeDefined();
    expect(result.verdict?.length).toBeGreaterThan(50);
    const cacheReads = result.usage.reduce((s, u) => s + u.cacheReadTokens, 0);
    console.log(`cost $${result.totalCostUsd.toFixed(4)}, cache read tokens: ${cacheReads}`);
    expect(cacheReads).toBeGreaterThan(0);
  }, 600_000);
});
