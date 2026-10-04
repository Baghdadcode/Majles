import type {
  AnswerRequest,
  CallResult,
  CouncilProvider,
  RankRequest,
  RankingOutput,
  SynthesizeRequest,
  UsageRecord,
} from "../core/types";

const usage = (stage: UsageRecord["stage"], advisorId: string | null): UsageRecord[] => [
  {
    stage,
    advisorId,
    model: "claude-opus-5-5",
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: (1000 * 4 + 500 * 20) / 1_000_000,
    stopReason: "end_turn",
    fellBack: false,
  },
];

export interface FakeProviderOptions {
  failAnswerFor?: string[];
  failRankFor?: string[];
  /** Seat id -> preference order of seat ids (best first) that its reviewer will rank. */
  preferences?: Record<string, string[]>;
  /** Milliseconds between streamed chunks, to exercise live UIs. 0 (default) streams instantly. */
  chunkDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Deterministic provider for tests; never touches the network. */
export class FakeProvider implements CouncilProvider {
  readonly calls = { answer: 0, rank: 0, synthesize: 0 };
  readonly seen: { rank: RankRequest[]; synthesize: SynthesizeRequest[]; answer: AnswerRequest[] } = {
    rank: [],
    synthesize: [],
    answer: [],
  };
  constructor(private readonly opts: FakeProviderOptions = {}) {}

  async answer(req: AnswerRequest): Promise<CallResult<string>> {
    this.calls.answer++;
    this.seen.answer.push(req);
    if (this.opts.failAnswerFor?.includes(req.seat.id)) throw new Error(`fake failure: ${req.seat.id}`);
    const text = `## Verdict\nAnswer from ${req.seat.id}.\n## Reasoning\nSeat ${req.seat.id} reasons here.\n## Risks\nNone.\n## Confidence\n70`;
    await this.stream(text, req.onText);
    return { value: text, usage: usage("answer", req.seat.id) };
  }

  private async stream(text: string, onText?: (delta: string) => void): Promise<void> {
    const delay = this.opts.chunkDelayMs ?? 0;
    if (!onText) return;
    if (delay === 0) return onText(text);
    for (const word of text.split(/(?<=\s)/)) {
      onText(word);
      await sleep(delay);
    }
  }

  async rank(req: RankRequest): Promise<CallResult<RankingOutput>> {
    this.calls.rank++;
    this.seen.rank.push(req);
    if (this.opts.failRankFor?.includes(req.reviewer.id)) throw new Error(`fake rank failure: ${req.reviewer.id}`);
    const pref = this.opts.preferences?.[req.reviewer.id];
    const scoreOf = (text: string) => {
      const seat = /Answer from ([\w-]+)\./.exec(text)?.[1] ?? "";
      const idx = pref ? pref.indexOf(seat) : 0;
      return idx === -1 ? 999 : idx;
    };
    const ordered = [...req.answers].sort((a, b) => scoreOf(a.text) - scoreOf(b.text) || a.label.localeCompare(b.label));
    return {
      value: {
        items: ordered.map((a, i) => ({
          label: a.label,
          rank: i + 1,
          correctness: 4,
          reasoningQuality: 4,
          usefulness: 4,
          risksCovered: 4,
          reasoning: `Ranked ${i + 1}.`,
        })),
      },
      usage: usage("rank", req.reviewer.id),
    };
  }

  async synthesize(req: SynthesizeRequest): Promise<CallResult<string>> {
    this.calls.synthesize++;
    this.seen.synthesize.push(req);
    const text = `## Verdict\nFinal (${req.mode}).\n\n## Why\nThe fake council agreed.\n\n## Minority report\nAnswer B disagreed.`;
    await this.stream(text, req.onText);
    return { value: text, usage: usage("synthesize", req.chairman.id) };
  }
}
