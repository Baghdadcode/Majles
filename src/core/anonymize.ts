import type { SeatDef } from "./types";

export const LABELS = ["A", "B", "C", "D", "E", "F", "G"] as const;

export interface AnonymizedSet {
  reviewerId: string;
  /** Presented to the reviewer in this order, labelled A, B, C... */
  presented: { label: string; answerId: string; text: string }[];
  labelToAnswerId: Map<string, string>;
}

/** Fisher-Yates with an injectable RNG so tests are deterministic. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Removes headings and "As the <Seat>" phrasing that would reveal who wrote an answer. */
export function stripSeatIdentifiers(text: string, seatNames: string[]): string {
  if (seatNames.length === 0) return text;
  const names = seatNames.map(escapeRe).join("|");
  const headingLine = new RegExp(`^[ \\t]*(#{1,6}|\\*\\*|__)?[ \\t]*(the )?(${names})([ \\t]*(seat|advisor|perspective|view|take|lens|answer|response))?[ \\t:*_-]*$`, "gim");
  const asThe = new RegExp(`\\b(as|from) (the|a|an) (${names})(?:'s)?( seat| advisor)?\\b[,:]?`, "gi");
  return text.replace(headingLine, "").replace(asThe, "As a reviewer").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Builds the blind view for one reviewer: its own answer is excluded (no self-ranking), identifying
 * text is stripped, and the order is freshly shuffled for every reviewer.
 */
export function anonymizeFor(
  reviewer: SeatDef,
  answers: { answerId: string; seatId: string; text: string }[],
  allSeatNames: string[],
  rng: () => number = Math.random,
): AnonymizedSet {
  const others = answers.filter((a) => a.seatId !== reviewer.id);
  if (others.length > LABELS.length) throw new Error("Too many answers to label");
  const presented = shuffle(others, rng).map((a, idx) => ({
    label: LABELS[idx]!,
    answerId: a.answerId,
    text: stripSeatIdentifiers(a.text, allSeatNames),
  }));
  return {
    reviewerId: reviewer.id,
    presented,
    labelToAnswerId: new Map(presented.map((p) => [p.label, p.answerId])),
  };
}
