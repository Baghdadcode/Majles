import { PRICING, type ModelId } from "../config/models";
import type { SeatDef, VotingMode } from "./types";

/**
 * Typical token counts per call, taken from a real Game Dev council run (Opus 5.5, medium/high effort).
 * Output includes thinking. Estimates are rough by design; the real cost is recorded per call.
 */
const TYPICAL = {
  answer: { input: 550, output: 2_200 },
  rank: { input: 6_000, output: 900 },
  chairman: { input: 10_000, output: 3_000 },
  baseline: { input: 550, output: 1_800 },
} as const;

export interface EstimateInput {
  seats: Pick<SeatDef, "model">[];
  chairman: Pick<SeatDef, "model">;
  mode: VotingMode;
  briefChars?: number;
  questionChars?: number;
  includeBaseline?: boolean;
}

const tokensFromChars = (chars: number) => Math.ceil(chars / 4);

/** Brief: a cache write on the first wave (answers), a cache read on later calls. */
export function estimateSessionCost(input: EstimateInput): number {
  const briefTok = tokensFromChars(input.briefChars ?? 0);
  const questionTok = tokensFromChars(input.questionChars ?? 0);
  const price = (model: string) => PRICING[model as ModelId] ?? PRICING["claude-opus-5-5"];
  const call = (model: string, inTok: number, outTok: number, briefWrite: boolean) => {
    const p = price(model);
    const brief = briefTok * (briefWrite ? p.cacheWritePerMTok : p.cacheReadPerMTok);
    return (inTok * p.inputPerMTok + outTok * p.outputPerMTok + brief) / 1e6;
  };
  const n = input.seats.length;
  let usd = 0;
  for (const s of input.seats) usd += call(s.model, TYPICAL.answer.input + questionTok, TYPICAL.answer.output, true);
  if (input.mode === "full") {
    for (const s of input.seats) {
      // each reviewer reads the other n-1 answers
      const scaled = (TYPICAL.rank.input * (n - 1)) / 4;
      usd += call(s.model, scaled + questionTok, TYPICAL.rank.output, false);
    }
  }
  const chairIn = input.mode === "full" ? TYPICAL.chairman.input : TYPICAL.chairman.input * 0.7;
  usd += call(input.chairman.model, (chairIn * n) / 5 + questionTok, TYPICAL.chairman.output, false);
  if (input.includeBaseline) {
    usd += call(input.chairman.model, TYPICAL.baseline.input + questionTok, TYPICAL.baseline.output, true);
  }
  return usd;
}
