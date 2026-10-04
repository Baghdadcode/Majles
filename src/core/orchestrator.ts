import { LIMITS } from "../config/models";
import { anonymizeFor } from "./anonymize";
import { bordaCount, toReview, type Review, type Tally } from "./borda";
import { sumCost } from "./cost";
import { CHAIRMAN } from "../seats/definitions";
import type {
  CouncilProvider,
  LabeledAnswer,
  ReviewItem,
  SeatDef,
  TallyView,
  UsageRecord,
  VotingMode,
} from "./types";
import { LABELS } from "./anonymize";

export type SessionState = "answering" | "ranking" | "counting" | "synthesizing" | "done" | "failed";

export type SessionEvent =
  | { type: "state"; state: SessionState }
  | { type: "answer_delta"; seatId: string; text: string }
  | { type: "answer_done"; seatId: string }
  | { type: "answer_failed"; seatId: string; error: string }
  | { type: "labels"; labels: { label: string; seatId: string }[] }
  | {
      type: "ranking_done";
      reviewerId: string;
      reviewerLabel: string;
      items: { answerSeatId: string; rank: number; reasoning: string }[];
    }
  | { type: "ranking_failed"; reviewerId: string; error: string }
  | { type: "tally"; tally: TallyEvent }
  | { type: "cost"; totalUsd: number }
  | { type: "verdict_delta"; text: string };

export interface TallyEvent {
  entries: { seatId: string; points: number; maxPossible: number; fraction: number }[];
  winnerSeatId: string | null;
  marginFraction: number;
  closeRace: boolean;
  tie: boolean;
}

export interface SessionInput {
  question: string;
  brief?: string;
  seats: SeatDef[];
  mode: VotingMode;
  chairman?: SeatDef;
  onEvent?: (e: SessionEvent) => void;
  rng?: () => number;
}

export interface SeatAnswer {
  answerId: string;
  seatId: string;
  text: string;
}

export interface SeatRanking {
  reviewerId: string;
  /** "Reviewer N" as the chairman saw it (numbered in the order rankings came back). */
  reviewerLabel: string;
  /** Items in the reviewer's own labels, plus the canonical answer each label pointed to. */
  items: (ReviewItem & { answerId: string })[];
}

export interface SessionResult {
  state: "done" | "failed";
  mode: VotingMode;
  /** Mode actually used; a full vote falls back to chairman-decides when no ranking survives. */
  effectiveMode: VotingMode;
  error?: string;
  answers: SeatAnswer[];
  /** Neutral label (A, B, ...) the chairman saw for each answer id. */
  labels: Record<string, string>;
  failedSeats: { seatId: string; stage: "answer" | "rank"; error: string }[];
  rankings: SeatRanking[];
  tally?: Tally;
  winnerSeatId?: string | null;
  verdict?: string;
  usage: UsageRecord[];
  totalCostUsd: number;
}

export async function runSession(input: SessionInput, provider: CouncilProvider): Promise<SessionResult> {
  const emit = input.onEvent ?? (() => undefined);
  const chairman = input.chairman ?? CHAIRMAN;
  const usage: UsageRecord[] = [];
  const failedSeats: SessionResult["failedSeats"] = [];
  const result: SessionResult = {
    state: "failed",
    mode: input.mode,
    effectiveMode: input.mode,
    answers: [],
    labels: {},
    failedSeats,
    rankings: [],
    usage,
    totalCostUsd: 0,
  };
  const record = (u: UsageRecord[]) => {
    usage.push(...u);
    emit({ type: "cost", totalUsd: sumCost(usage) });
  };
  const finish = (state: "done" | "failed", error?: string): SessionResult => {
    result.state = state;
    result.error = error;
    result.totalCostUsd = sumCost(usage);
    emit({ type: "state", state });
    return result;
  };

  try {
    // 1. Answer: all seats in parallel; each sees only the question, the brief and its own method.
    emit({ type: "state", state: "answering" });
    const settled = await Promise.allSettled(
      input.seats.map(async (seat) => {
        try {
          const r = await provider.answer({
            seat,
            question: input.question,
            brief: input.brief,
            onText: (text) => emit({ type: "answer_delta", seatId: seat.id, text }),
          });
          record(r.usage);
          emit({ type: "answer_done", seatId: seat.id });
          return { seat, text: r.value };
        } catch (err) {
          const error = errorMessage(err);
          failedSeats.push({ seatId: seat.id, stage: "answer", error });
          emit({ type: "answer_failed", seatId: seat.id, error });
          throw err;
        }
      }),
    );
    const answers: SeatAnswer[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled") {
        answers.push({ answerId: `ans-${s.value.seat.id}`, seatId: s.value.seat.id, text: s.value.text });
      }
      // failures were recorded in failedSeats when they happened
    }
    result.answers = answers;
    if (answers.length < LIMITS.minAnswers) {
      return finish("failed", `Only ${answers.length} answers came back; at least ${LIMITS.minAnswers} are needed.`);
    }
    if (answers.length > LABELS.length) return finish("failed", "Too many seats to label");

    const seatById = new Map(input.seats.map((s) => [s.id, s]));
    const seatNames = input.seats.map((s) => s.name);

    // The chairman sees one canonical, neutral labelling (the same for every call it makes).
    const canonical = answers.map((a, i) => ({ ...a, label: LABELS[i]! }));
    const canonicalLabel = new Map(canonical.map((a) => [a.answerId, a.label]));
    const chairAnswers: LabeledAnswer[] = canonical.map((a) => ({ label: a.label, text: a.text }));
    result.labels = Object.fromEntries(canonical.map((a) => [a.answerId, a.label]));
    emit({ type: "labels", labels: canonical.map((a) => ({ label: a.label, seatId: a.seatId })) });
    const seatOfAnswer = new Map(answers.map((a) => [a.answerId, a.seatId]));

    let tally: Tally | undefined;
    let reviewsForChair: { reviewer: string; items: ReviewItem[] }[] = [];
    let effectiveMode = input.mode;

    if (input.mode === "full") {
      // 2 + 3. Anonymize (fresh order per reviewer, own answer excluded) and rank.
      emit({ type: "state", state: "ranking" });
      const reviews: Review[] = [];
      await Promise.all(
        answers.map(async (reviewerAnswer) => {
          const reviewer = seatById.get(reviewerAnswer.seatId)!;
          const anon = anonymizeFor(reviewer, answers, seatNames, input.rng);
          try {
            const r = await provider.rank({
              reviewer,
              question: input.question,
              brief: input.brief,
              answers: anon.presented.map((p) => ({ label: p.label, text: p.text })),
            });
            record(r.usage);
            reviews.push(toReview(reviewer.id, r.value.items, anon.labelToAnswerId));
            const reviewerLabel = `Reviewer ${result.rankings.length + 1}`;
            const items = r.value.items.map((i) => ({ ...i, answerId: anon.labelToAnswerId.get(i.label)! }));
            result.rankings.push({ reviewerId: reviewer.id, reviewerLabel, items });
            emit({
              type: "ranking_done",
              reviewerId: reviewer.id,
              reviewerLabel,
              items: items.map((i) => ({ answerSeatId: seatOfAnswer.get(i.answerId)!, rank: i.rank, reasoning: i.reasoning })),
            });
          } catch (err) {
            const error = errorMessage(err);
            failedSeats.push({ seatId: reviewer.id, stage: "rank", error });
            emit({ type: "ranking_failed", reviewerId: reviewer.id, error });
          }
        }),
      );

      // 4. Count.
      emit({ type: "state", state: "counting" });
      if (reviews.length === 0) {
        effectiveMode = "chairman"; // nothing to count; the chairman decides
      } else {
        tally = bordaCount(
          answers.map((a) => a.answerId),
          reviews,
        );
        result.tally = tally;
        result.winnerSeatId = tally.winnerId ? answers.find((a) => a.answerId === tally!.winnerId)?.seatId : null;
        // Present each reviewer to the chairman neutrally, translated to the canonical answer labels.
        emit({
          type: "tally",
          tally: {
            entries: tally.entries.map((e) => ({
              seatId: seatOfAnswer.get(e.answerId)!,
              points: e.points,
              maxPossible: e.maxPossible,
              fraction: e.fraction,
            })),
            winnerSeatId: result.winnerSeatId ?? null,
            marginFraction: tally.marginFraction,
            closeRace: tally.closeRace,
            tie: tally.tie,
          },
        });
        reviewsForChair = result.rankings.map((r) => ({
          reviewer: r.reviewerLabel,
          items: r.items
            .map((i) => ({ ...i, label: canonicalLabel.get(i.answerId)! }))
            .sort((a, b) => a.rank - b.rank),
        }));
      }
    }
    result.effectiveMode = effectiveMode;

    // 5. Synthesize: a separate call; the chairman does not vote.
    emit({ type: "state", state: "synthesizing" });
    const tallyView: TallyView | undefined = tally && {
      scores: tally.entries.map((e) => ({
        label: canonicalLabel.get(e.answerId)!,
        points: e.points,
        maxPossible: e.maxPossible,
        fraction: e.fraction,
      })),
      winnerLabel: tally.winnerId ? canonicalLabel.get(tally.winnerId)! : null,
      marginFraction: tally.marginFraction,
      closeRace: tally.closeRace,
      tie: tally.tie,
    };
    const verdict = await provider.synthesize({
      chairman,
      question: input.question,
      brief: input.brief,
      mode: effectiveMode,
      answers: chairAnswers,
      reviews: reviewsForChair,
      tally: tallyView,
      onText: (text) => emit({ type: "verdict_delta", text }),
    });
    record(verdict.usage);
    result.verdict = verdict.value;
    return finish("done");
  } catch (err) {
    return finish("failed", errorMessage(err));
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
