// One view model for a council session, built either from live server-sent events or from a saved session.
import type { StreamEvent } from "../server/runtime";
import type { RankingView, SeatView, SessionDetailView, TallyView } from "../core/view";
import type { VotingMode } from "../core/types";

export type Stage = "answering" | "ranking" | "counting" | "synthesizing" | "done" | "failed";

export interface AnswerState {
  text: string;
  status: "pending" | "streaming" | "done" | "failed";
  error?: string;
}

export interface SessionModel {
  seats: SeatView[];
  mode: VotingMode;
  effectiveMode: VotingMode;
  stage: Stage;
  answers: Record<string, AnswerState>;
  rankings: RankingView[];
  failedReviewers: { seatId: string; error: string }[];
  tally: TallyView | null;
  labels: { label: string; seatId: string }[];
  verdict: string;
  costUsd: number;
  error: string | null;
  saved: boolean;
}

export function initialModel(seats: SeatView[], mode: VotingMode): SessionModel {
  return {
    seats,
    mode,
    effectiveMode: mode,
    stage: "answering",
    answers: Object.fromEntries(seats.map((s) => [s.id, { text: "", status: "pending" as const }])),
    rankings: [],
    failedReviewers: [],
    tally: null,
    labels: [],
    verdict: "",
    costUsd: 0,
    error: null,
    saved: false,
  };
}

export function reduce(m: SessionModel, e: StreamEvent): SessionModel {
  switch (e.type) {
    case "state":
      return { ...m, stage: e.state };
    case "answer_delta": {
      const prev = m.answers[e.seatId] ?? { text: "", status: "pending" as const };
      return { ...m, answers: { ...m.answers, [e.seatId]: { text: prev.text + e.text, status: "streaming" } } };
    }
    case "answer_done": {
      const prev = m.answers[e.seatId] ?? { text: "", status: "pending" as const };
      return { ...m, answers: { ...m.answers, [e.seatId]: { ...prev, status: "done" } } };
    }
    case "answer_failed":
      return { ...m, answers: { ...m.answers, [e.seatId]: { text: "", status: "failed", error: e.error } } };
    case "labels":
      return { ...m, labels: e.labels };
    case "ranking_done":
      return { ...m, rankings: [...m.rankings, { reviewerSeatId: e.reviewerId, reviewerLabel: e.reviewerLabel, items: e.items }] };
    case "ranking_failed":
      return { ...m, failedReviewers: [...m.failedReviewers, { seatId: e.reviewerId, error: e.error }] };
    case "tally":
      return { ...m, tally: e.tally };
    case "cost":
      return { ...m, costUsd: e.totalUsd };
    case "verdict_delta":
      // Ranking produced no tally means the chairman decided alone.
      return { ...m, verdict: m.verdict + e.text, effectiveMode: m.mode === "full" && !m.tally ? "chairman" : m.effectiveMode };
    case "saved":
      return { ...m, saved: true };
    case "error":
      return { ...m, stage: "failed", error: e.message };
    default:
      return m;
  }
}

export function modelFromDetail(d: SessionDetailView): SessionModel {
  const answers: Record<string, AnswerState> = {};
  for (const s of d.seats) answers[s.id] = { text: "", status: "failed", error: "No answer" };
  for (const a of d.answers) {
    answers[a.seatId] = a.status === "ok" ? { text: a.text ?? "", status: "done" } : { text: "", status: "failed", error: a.error ?? "Failed" };
  }
  return {
    seats: d.seats,
    mode: d.mode,
    effectiveMode: d.effectiveMode,
    stage: d.state === "done" ? "done" : "failed",
    answers,
    rankings: [...d.rankings].sort((a, b) => a.reviewerLabel.localeCompare(b.reviewerLabel, undefined, { numeric: true })),
    failedReviewers: [],
    tally: d.tally,
    labels: d.answers.filter((a) => a.label).map((a) => ({ label: a.label!, seatId: a.seatId })).sort((a, b) => a.label.localeCompare(b.label)),
    verdict: d.verdict ?? "",
    costUsd: d.totalCostUsd,
    error: d.error,
    saved: true,
  };
}
