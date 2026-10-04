import type { Effort, ModelId } from "../config/models";

export type SeatSection = "Verdict" | "Reasoning" | "Risks" | "Confidence";
export const SEAT_SECTIONS: SeatSection[] = ["Verdict", "Reasoning", "Risks", "Confidence"];

/** A versioned advisor definition: defined by how it thinks, not who it is. */
export interface SeatDef {
  id: string;
  version: number;
  name: string;
  method: string;
  alwaysAsks: string[];
  mayIgnore: string;
  sections: SeatSection[];
  model: ModelId;
  effort: Effort;
}

export interface CouncilDef {
  id: string;
  name: string;
  isDefault: boolean;
  seats: SeatDef[];
}

export type Stage = "answer" | "rank" | "synthesize" | "baseline";

export interface UsageRecord {
  stage: Stage;
  advisorId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  stopReason: string | null;
  fellBack: boolean;
}

export interface CallResult<T> {
  value: T;
  usage: UsageRecord[];
}

export interface SessionBrief {
  id: string;
  name: string;
  content: string;
  updatedAt: Date;
}

export type VotingMode = "full" | "chairman";

export interface AnswerRequest {
  seat: SeatDef;
  question: string;
  brief?: string;
  /** Soft word cap stated in the prompt. */
  wordCap?: number;
  onText?: (delta: string) => void;
}

export interface LabeledAnswer {
  label: string;
  text: string;
}

export interface RankRequest {
  reviewer: SeatDef;
  question: string;
  brief?: string;
  answers: LabeledAnswer[];
}

export interface ReviewItem {
  label: string;
  rank: number;
  correctness: number;
  reasoningQuality: number;
  usefulness: number;
  risksCovered: number;
  reasoning: string;
}

export interface RankingOutput {
  items: ReviewItem[];
}

/** Everything the chairman sees, already mapped to one canonical set of labels. */
export interface SynthesizeRequest {
  chairman: SeatDef;
  question: string;
  brief?: string;
  mode: VotingMode;
  answers: LabeledAnswer[];
  reviews: { reviewer: string; items: ReviewItem[] }[];
  tally?: TallyView;
  onText?: (delta: string) => void;
}

export interface TallyView {
  scores: { label: string; points: number; maxPossible: number; fraction: number }[];
  winnerLabel: string | null;
  marginFraction: number;
  closeRace: boolean;
  tie: boolean;
}

/** The three-method interface; other providers can be added without touching the orchestrator. */
export interface CouncilProvider {
  answer(req: AnswerRequest): Promise<CallResult<string>>;
  rank(req: RankRequest): Promise<CallResult<RankingOutput>>;
  synthesize(req: SynthesizeRequest): Promise<CallResult<string>>;
}
