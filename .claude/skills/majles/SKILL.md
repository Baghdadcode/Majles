---
name: majles
description: Run Majles, a council of AI advisors, on an idea, plan or decision. The chairman picks the most relevant roles from a pool of 14 (Skeptic, Architect, User Advocate, Security & Privacy, ...), each role answers independently, the answers are ranked blind, and the chairman writes a verdict. Three modes - quick, standard, full. Use when the user asks for a council, a panel, several perspectives, a second opinion, to bounce or stress-test an idea, or mentions Majles.
argument-hint: "[quick|standard|full] [council-id] <question>"
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/council.mjs *)
---

# Majles

You are the orchestrator. You run the council; you never answer the question yourself and you never
write a role's answer for it. Independent answers are the whole point: a role that sees another
role's answer anchors on it.

Files next to this one:
- [roles.yaml](roles.yaml): the role pool, with `group` and `scope`
- [councils.yaml](councils.yaml): ready-made councils that skip role selection
- [prompts.md](prompts.md): the exact prompt for every subagent; always use it
- `scripts/council.mjs`: draws the blind labels and counts the vote; never do either by hand

## Modes

| Mode | Steps | Subagents | Default for |
|---|---|---|---|
| `quick` | 3 roles answer, chairman picks and writes the verdict | 4 | small, everyday questions |
| `standard` | 5 roles answer, one panel ranks them blind once per role lens, Borda count, verdict | 7 | everything else (default) |
| `full` | 5 roles answer, each role ranks the others blind separately, Borda count, verdict | 11 | big decisions that are hard to undo |

The user picks a mode by saying it ("quick", "full", "snabbt", "fullt råd"). If they don't, you
propose one in step 1.

## Step 1: Set up the council

1. Read `roles.yaml` and `councils.yaml`.
2. Write the **context**: at most ~200 words from the conversation (what the project is, constraints,
   what has been decided). Every subagent gets the same text. If the question is about code in this
   repository, name the relevant file paths in it.
3. **Pick the roles**:
   - If the user named a council from `councils.yaml`, use its roles (the first 3 in quick mode).
   - Otherwise pick 5 roles (3 in quick mode) from `roles.yaml` that fit this question, with
     these rules:
     - at least one role from group `test`; prefer `skeptic` unless another test role fits clearly better
     - at most two roles from any one group
     - `player-experience` only for games, `user-advocate` only for non-games, never both
     - a question about code in this repository should include `architect` or `tester`
4. **Show the setup and wait**, in the user's language:
   - the mode, with a one-line reason if you propose a different one than the default
   - each role with one line on why it is on this council
   - up to 3 clarifying questions, only if the answers would change the advice
   - an invitation to swap roles, change mode, or say "go"

   Skip the wait only when the user already said to run without questions ("kör direkt", "just run it").
   Apply any swaps, recheck the rules above, and continue.

## Step 2: Answers

1. Run `node ${CLAUDE_SKILL_DIR}/scripts/council.mjs assign <role-id> <role-id> ...` and keep its JSON.
   `labels` maps each letter to a role; `reviewOrders` is used in full mode.
2. Launch one `majles-seat` subagent per role, **all in the same message so they run in parallel**,
   with the Answer prompt from `prompts.md`. Tell the user briefly that the council is answering.
3. If a role fails or returns nothing, retry it once. If it fails again, drop it and its label; carry
   on as long as at least 3 answers remain (2 in quick mode), otherwise stop and tell the user.

## Step 3: Blind review (standard and full only)

- **standard**: one `majles-reviewer` subagent with the Panel review prompt. The lenses are the roles
  on the council (by id); the answers are listed by label.
- **full**: one `majles-reviewer` per role, all in one message, with the Single review prompt and the
  answers in that role's `reviewOrders` order. A role never sees its own answer.

Extract the JSON from each result. If a reviewer returns unusable JSON, ask that same reviewer once
(SendMessage) to return valid JSON only; if it fails again, leave that review out.

## Step 4: Count (standard and full only)

Run `node ${CLAUDE_SKILL_DIR}/scripts/council.mjs tally` with this JSON on stdin (a heredoc is fine):

```json
{"labels": {...from assign...}, "reviews": [{"reviewer": "<role-id>", "ranking": ["C", "A", ...]}, ...]}
```

The script drops each reviewer's own answer before counting, so pass panel rankings unchanged. If
`skipped` is not empty, mention it in the final report. If `counted` is 0, fall back to the quick-mode
verdict and say so.

## Step 5: Verdict

Launch one `majles-chairman` subagent with the Verdict prompt from `prompts.md`: the answers by
letter, the reviews numbered "Reviewer 1, 2, ..." (never by role), and the tally. The chairman must
not learn which role wrote which answer.

## Step 6: Report to the user

In the user's language:
1. The chairman's verdict, unchanged.
2. A short key: letter, role, Borda points (or "chosen" in quick mode), and the badges *close race*,
   *tie*, *skipped reviews* when they apply.
3. One line offering the full answers of any role, or a new round on a follow-up.

Do not add your own opinion to the verdict. If you see a factual error in it, say so separately and
plainly.

## Subagents

The agent types live in `.claude/agents/`: `majles-seat` and `majles-reviewer` run on Sonnet and
`majles-chairman` on Opus. If a type is missing (for example the skill was copied without them), use
`general-purpose` with the Agent tool's `model` parameter instead: `sonnet` for answers and reviews,
`opus` for the verdict.

Only the councils marked `readsCode: true`, or questions that name files in this repository, should
let roles read files. In every other case the Answer prompt tells them not to use tools.
