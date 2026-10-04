// Plain, JSON-safe shapes shared by the server routes and the browser UI.
import type { VotingMode } from "./types";

export interface SeatView {
  id: string;
  name: string;
  model: string;
  effort: string;
}

export interface CouncilView {
  id: string;
  name: string;
  isDefault: boolean;
  seats: SeatView[];
}

export interface BriefView {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

export interface TallyView {
  entries: { seatId: string; points: number; maxPossible: number; fraction: number }[];
  winnerSeatId: string | null;
  marginFraction: number;
  closeRace: boolean;
  tie: boolean;
}

export interface RankingView {
  reviewerSeatId: string;
  reviewerLabel: string;
  items: { answerSeatId: string; rank: number; reasoning: string }[];
}

export interface SessionSummaryView {
  id: string;
  question: string;
  councilName: string;
  mode: VotingMode;
  state: string;
  winnerSeatId: string | null;
  closeRace: boolean | null;
  totalCostUsd: number;
  createdAt: string;
}

export interface SessionDetailView extends SessionSummaryView {
  councilId: string;
  effectiveMode: VotingMode;
  error: string | null;
  finishedAt: string | null;
  brief: { id: string; name: string; updatedAt: string } | null;
  seats: SeatView[];
  answers: { seatId: string; label: string | null; text: string | null; status: string; error: string | null }[];
  rankings: RankingView[];
  tally: TallyView | null;
  verdict: string | null;
  usage: { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
}

/** Splits the chairman's verdict into the main answer and the minority report (if any). */
export function splitVerdict(verdict: string): { main: string; minority: string | null } {
  const m = /\n#{1,6}\s*Minority report\s*\n/i.exec(`\n${verdict}`);
  if (!m) return { main: verdict.trim(), minority: null };
  const idx = m.index;
  const text = `\n${verdict}`;
  return { main: text.slice(0, idx).trim(), minority: text.slice(idx + m[0].length).trim() || null };
}
