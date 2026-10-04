export interface Question {
  title: string;
  text: string;
}

/** Each question starts with a "## Title" heading; everything under it, up to the next heading, is the question. */
export function parseQuestions(markdown: string): Question[] {
  const out: Question[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const h = /^##\s+(.*\S)\s*$/.exec(line);
    if (h) {
      if (current) out.push({ title: current.title, text: current.lines.join("\n").trim() });
      current = { title: h[1]!, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) out.push({ title: current.title, text: current.lines.join("\n").trim() });
  return out.filter((q) => q.text.length > 0);
}

export function stripChairmanPreamble(verdict: string): string {
  return verdict.replace(/^\s*(\*\*)?Chosen answer:.*\n+/i, "").trim();
}

/**
 * Prepares a verdict for the blind comparison: drops the "Chosen answer" line and the minority report, both of
 * which give away that the response came from a council. The full verdict stays in sessions.json and the database.
 */
export function blindVerdict(verdict: string): string {
  return stripChairmanPreamble(verdict)
    .replace(/\n#{1,6}\s*Minority report[\s\S]*$/i, "")
    .trim();
}

/** `--only` takes a 1-based question number or a (case-insensitive) title. */
export function selectQuestions(questions: Question[], only?: string): Question[] {
  if (!only) return questions;
  const n = Number(only);
  const picked = Number.isInteger(n) && n > 0
    ? questions.slice(n - 1, n)
    : questions.filter((q) => q.title.trim().toLowerCase() === only.trim().toLowerCase());
  if (picked.length === 0) {
    throw new Error(`No question matches --only "${only}". Titles: ${questions.map((q, i) => `${i + 1}. ${q.title}`).join("; ")}`);
  }
  return picked;
}
