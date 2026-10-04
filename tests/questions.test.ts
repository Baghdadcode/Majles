import { describe, expect, it } from "vitest";
import { blindVerdict, parseQuestions, selectQuestions } from "../src/cli/questions";

const qs = parseQuestions("## First one\nQ1 text\n\n## Early rush protection\nQ2 text\n");

describe("selectQuestions", () => {
  it("returns everything without --only", () => expect(selectQuestions(qs)).toHaveLength(2));
  it("picks by title, ignoring case", () => expect(selectQuestions(qs, "early rush PROTECTION")[0]!.text).toBe("Q2 text"));
  it("picks by 1-based number", () => expect(selectQuestions(qs, "2")[0]!.title).toBe("Early rush protection"));
  it("lists the titles when nothing matches", () => expect(() => selectQuestions(qs, "nope")).toThrow(/Early rush protection/));
});

describe("blindVerdict", () => {
  it("drops the chosen-answer line and the minority report", () => {
    const v = "Chosen answer: C, because.\n\n## Verdict\nDo X.\n\n## Risks\nY.\n\n## Minority report\nAnswer D disagreed.";
    expect(blindVerdict(v)).toBe("## Verdict\nDo X.\n\n## Risks\nY.");
  });
  it("leaves verdicts without a minority report alone", () => {
    expect(blindVerdict("## Verdict\nDo X.")).toBe("## Verdict\nDo X.");
  });
});
