import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeProvider, RefusalError, Semaphore } from "../src/providers/claude";
import { PLAYER_EXPERIENCE, SKEPTIC } from "../src/seats/definitions";

type Params = Record<string, unknown>;

function message(over: Record<string, unknown> = {}) {
  return {
    model: "claude-opus-5-5",
    stop_reason: "end_turn",
    stop_details: null,
    content: [{ type: "text", text: "## Verdict\nok" }],
    usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 },
    ...over,
  };
}

/** Minimal stand-in for the SDK client: records request params, replays scripted outcomes. */
function fakeClient(script: (() => unknown)[]) {
  const requests: Params[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Params) => {
          requests.push(params);
          const next = script.shift() ?? (() => message());
          return { on: () => undefined, finalMessage: async () => next() };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const rateLimit = () => new Anthropic.RateLimitError(429, { type: "error" }, "slow down", new Headers());

describe("ClaudeProvider request shape", () => {
  it("uses adaptive thinking, explicit effort, a cached brief first, and never sends temperature or tool_choice", async () => {
    const { client, requests } = fakeClient([]);
    const p = new ClaudeProvider({ client, backoffBaseMs: 0 });
    await p.answer({ seat: SKEPTIC, question: "Q", brief: "THE BRIEF" });
    const r = requests[0]!;
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.thinking).toEqual({ type: "adaptive" });
    expect((r.output_config as { effort: string }).effort).toBe("high");
    expect(r).not.toHaveProperty("temperature");
    expect(r).not.toHaveProperty("tool_choice");
    expect(r.fallbacks).toBe("default");
    expect(r.betas).toContain("server-side-fallback-2026-07-01");
    const system = r.system as { text: string; cache_control?: unknown }[];
    expect(system[0]!.text).toContain("THE BRIEF");
    expect(system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(system[1]!.text).toContain("## Your method");
    expect(system[1]).not.toHaveProperty("cache_control");
  });

  it("uses medium effort for other seats and omits the brief block when there is none", async () => {
    const { client, requests } = fakeClient([]);
    await new ClaudeProvider({ client }).answer({ seat: PLAYER_EXPERIENCE, question: "Q" });
    expect((requests[0]!.output_config as { effort: string }).effort).toBe("medium");
    expect(requests[0]!.system as unknown[]).toHaveLength(1);
  });

  it("requests structured JSON output for rankings and validates it", async () => {
    const ranking = { ranking: [
      { label: "A", rank: 1, correctness: 4, reasoning_quality: 4, usefulness: 4, risks_covered: 4, reasoning: "x" },
      { label: "B", rank: 2, correctness: 3, reasoning_quality: 3, usefulness: 3, risks_covered: 3, reasoning: "y" },
    ] };
    const { client, requests } = fakeClient([() => message({ content: [{ type: "text", text: JSON.stringify(ranking) }] })]);
    const out = await new ClaudeProvider({ client }).rank({
      reviewer: SKEPTIC, question: "Q", answers: [{ label: "A", text: "a" }, { label: "B", text: "b" }],
    });
    expect(out.value.items.map((i) => i.label)).toEqual(["A", "B"]);
    const cfg = requests[0]!.output_config as { format: { type: string } };
    expect(cfg.format.type).toBe("json_schema");
  });

  it("records usage, cache reads and cost", async () => {
    const { client } = fakeClient([]);
    const r = await new ClaudeProvider({ client }).answer({ seat: SKEPTIC, question: "Q" });
    const u = r.usage[0]!;
    expect(u).toMatchObject({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, stage: "answer", advisorId: "skeptic" });
    expect(u.costUsd).toBeCloseTo((1000 * 4 + 500 * 20 + 2000 * 0.2) / 1e6);
  });

  it("bills each attempt from usage.iterations when a fallback ran", async () => {
    const usage = {
      input_tokens: 10, output_tokens: 10,
      iterations: [
        { type: "message", model: "claude-opus-5-5", input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        { type: "fallback_message", model: "claude-opus-5-5", input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      ],
    };
    const { client } = fakeClient([() => message({ usage })]);
    const r = await new ClaudeProvider({ client }).answer({ seat: SKEPTIC, question: "Q" });
    expect(r.usage).toHaveLength(2);
    expect(r.usage[1]!.fellBack).toBe(true);
  });
});

describe("ClaudeProvider error handling", () => {
  it("throws RefusalError on stop_reason refusal and does not read content", async () => {
    const { client } = fakeClient([() => message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, content: [] })]);
    await expect(new ClaudeProvider({ client }).answer({ seat: SKEPTIC, question: "Q" })).rejects.toBeInstanceOf(RefusalError);
  });

  it("retries 429s with backoff and then succeeds", async () => {
    const { client, requests } = fakeClient([() => { throw rateLimit(); }, () => { throw rateLimit(); }, () => message()]);
    const r = await new ClaudeProvider({ client, backoffBaseMs: 0 }).answer({ seat: SKEPTIC, question: "Q" });
    expect(requests).toHaveLength(3);
    expect(r.value).toContain("Verdict");
  });

  it("gives up after 5 attempts", async () => {
    const { client, requests } = fakeClient(Array.from({ length: 10 }, () => () => { throw rateLimit(); }));
    await expect(new ClaudeProvider({ client, backoffBaseMs: 0 }).answer({ seat: SKEPTIC, question: "Q" })).rejects.toBeInstanceOf(Anthropic.RateLimitError);
    expect(requests).toHaveLength(5);
  });

  it("does not retry client errors", async () => {
    const bad = () => new Anthropic.BadRequestError(400, { type: "error" }, "bad", new Headers());
    const { client, requests } = fakeClient([() => { throw bad(); }]);
    await expect(new ClaudeProvider({ client, backoffBaseMs: 0 }).answer({ seat: SKEPTIC, question: "Q" })).rejects.toBeInstanceOf(Anthropic.BadRequestError);
    expect(requests).toHaveLength(1);
  });

  it("raises max_tokens and retries when a response is cut off", async () => {
    const { client, requests } = fakeClient([() => message({ stop_reason: "max_tokens" }), () => message()]);
    const r = await new ClaudeProvider({ client }).answer({ seat: SKEPTIC, question: "Q" });
    expect(requests.map((x) => x.max_tokens)).toEqual([16_000, 32_000]);
    expect(r.usage).toHaveLength(2); // the truncated attempt was still billed
  });
});

describe("Semaphore", () => {
  it("never runs more than the limit at once", async () => {
    const gate = new Semaphore(5);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        gate.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );
    expect(peak).toBe(5);
  });
});
