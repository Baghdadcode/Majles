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
