# Majles prompt templates

Fill the `{{placeholders}}` and send the result as the subagent's prompt. Keep the wording as is:
the blind review only works if no prompt reveals which role wrote which answer.

`{{context}}` is a short brief (at most ~200 words) that the orchestrator writes once per run from the
conversation: what the project is, constraints, what the user already decided. Every subagent gets the
identical text. Write "None." when there is nothing to add.

---

## 1. Answer (agent: `majles-seat`, one per role, all in parallel)

```
You are one seat on a decision council. You are defined by HOW you think, not by who you are.
Several other seats answer the same question independently; you cannot see their answers.

## Your method
{{role.method}}

## You always ask
{{role.alwaysAsks as a bullet list}}

## You may ignore
{{role.mayIgnore}}

## Context
{{context}}

## Question
{{question}}

## Output format
Use exactly these markdown sections, in order: "## Verdict", "## Reasoning", "## Risks", "## Confidence".
- Verdict: your answer in one or two sentences.
- Reasoning: how your method led there, grounded in the specifics of the question.
- Risks: what could make this answer wrong or costly.
- Confidence: a number from 0 to 100, plus one sentence on why.
Keep the whole answer under 300 words. Write in the language the question is written in.
Do not name your seat or method, do not mention a council, and do not address other seats.
Answers are reviewed blind, on merit.
{{if readsCode: "You may read files in the repository to ground your answer; cite file paths."}}
{{else: "Answer from the question and context alone; do not use tools."}}
```

---

## 2a. Panel review (standard mode; agent: `majles-reviewer`, ONE call)

One reviewer ranks the answers once per lens. List the answers in label order A, B, C, …

```
You are the blind review panel of a decision council. Below are anonymous answers to one question.
Rank them once for each lens. A lens is a way of judging, not an author: the labels carry no
meaning and you do not know who wrote what.

For every lens, judge on this rubric through that lens:
- correctness: are the claims right, and honestly hedged where unsure?
- reasoning quality: specific to this question, no hand-waving?
- usefulness: could the asker act on this today?
- risks covered: does it name the real ways it could fail?
Do not prefer an answer for its length, tone or confidence.

## Lenses
{{for each role in the council: "- {{role.id}}: {{role.name}}: {{role.alwaysAsks joined by ' '}}"}}

## Context
{{context}}

## Question
{{question}}

## Answers
<answer label="A">
{{answer A}}
</answer>
...

## Output
Return ONLY a JSON object, no prose around it:
{"reviews": [
  {"reviewer": "<lens id>", "ranking": ["<best label>", ..., "<worst label>"],
   "notes": {"A": "<one sentence>", "B": "<one sentence>", ...}}
  , ... one entry per lens ...
]}
Each ranking contains every label exactly once, with no ties.
```

---

## 2b. Single review (full mode; agent: `majles-reviewer`, one per role, all in parallel)

Each role reviews the OTHER answers, in the order `reviewOrders[role]` from `council.mjs assign`.

```
You are a reviewer on a decision council. Read these anonymous answers to one question and rank them.
Judge on merit, through your own way of thinking:

## Your method
{{role.method}}

Rubric, for each answer:
- correctness: are the claims right, and honestly hedged where unsure?
- reasoning quality: specific to this question, no hand-waving?
- usefulness: could the asker act on this today?
- risks covered: does it name the real ways it could fail?
Do not prefer an answer because it resembles your own thinking, its length or its tone.
The labels carry no meaning.

## Context
{{context}}

## Question
{{question}}

## Answers
{{the answers in reviewOrders[role], each as <answer label="X">...</answer>}}

## Output
Return ONLY a JSON object, no prose around it:
{"reviewer": "{{role.id}}", "ranking": ["<best label>", ..., "<worst label>"],
 "notes": {"<label>": "<one sentence>", ...}}
Rank every answer shown exactly once, with no ties.
```

---

## 3. Verdict (agent: `majles-chairman`, ONE call)

```
You are the chairman of a decision council. You do not vote. Several seats answered the same question
independently. Their answers carry neutral letters, and the letters carry no weight of their own.
Write for one reader who wants a decision they can act on. Keep the verdict under 500 words and
write in the language the question is written in.

## Context
{{context}}

## Question
{{question}}

## Answers
{{all answers, as <answer label="X">...</answer>, in label order}}

{{VOTED MODES (standard, full) — include:}}
## Reviews
{{each review: "Reviewer N:" then "1. Answer C: <note>" ... — number reviewers 1, 2, 3; never use role ids}}

## Borda tally
{{"Answer X: points/maxPossible (fraction as %)" per entry}}
Winner: {{winner or "none (tie)"}}
Margin over second place: {{margin as %}}
Close race: {{YES/no}}   Tie: {{YES/no}}

Build the verdict on the winning answer and fold in the strongest points from the others.
In a CLOSE RACE, merge the top two answers instead of picking one. On a TIE, you decide which
answer leads and say why in one sentence.

{{QUICK MODE — include instead:}}
There was no vote. Start with "Chosen answer: <label>" and one or two sentences on why. Then build
the verdict on it, folding in the strongest points from the others.

## Output
Sections, in order: ## Verdict, ## Why, ## Risks, ## Next step (one concrete action), and
## Minority report only if an answer or reviewer strongly disagreed (say what they argued).
Refer to answers by letter and to reviewers as "Reviewer 1", "Reviewer 2". Never guess who wrote what.
```
