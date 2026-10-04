# Council — Roadmap

A personal, local-only app: ask a question, a council of AI advisors answers independently, they rank each
other's answers blind, and a chairman writes the verdict. One user, one machine, one Anthropic Console API key.

Stack: Next.js (App Router) + TypeScript strict + Tailwind (from Phase 1), `@anthropic-ai/sdk` only,
SQLite via Drizzle. No auth, hosting or job queue.

## Defaults I chose where the brief was ambiguous

- **Branches/PRs:** Phase 0 lives on `claude/jolly-hamilton-bmuq5n` (the branch this session was assigned).
  Later phases get their own branch and PR once you tell me to start them.
- **Brief is a cached shared block.** It is the first system block (with `cache_control`) on every call in a
  session: answers, rankings and the chairman. The five answer calls start at the same moment, so each pays the
  cache write; the ranking and chairman calls are where `cache_read_input_tokens` should show up. Caches are per
  model, so a seat switched to Sonnet will not share the Opus cache. Very short briefs fall under the model's
  minimum cacheable length and will not cache at all.
- **Cache pricing:** write = 1.25x input, read = $0.20/MTok on both models. All prices live in `src/config/models.ts`.
- **Chairman is blind to seats.** It sees answers as A–E and reviewers as "Reviewer 1…", never seat names, so
  reputation cannot sway it. Seat identities stay in the database.
- **Borda with unequal review counts:** an author never reviews its own answer, and a reviewer can fail, so
  answers are ordered by points as a fraction of the points available to them (identical to raw points when every
  reviewer succeeds). Margin and the 10% close-race test use that fraction. An exact tie goes to the chairman.
- **Reviewer scores:** besides the full ranking, each reviewer gives 1–5 scores for correctness, reasoning
  quality, usefulness and risks covered, plus one sentence per answer. Zod validates labels (exactly the ones
  shown), ranks (1..N, no gaps) and score ranges.
- **Failure handling:** a seat that fails is dropped (≥ 4 answers must remain). A reviewer that fails is skipped.
  If no ranking survives, the session falls back to chairman-decides and records that.
- **Retries:** 429, 5xx and connection errors back off exponentially (honouring `retry-after`), up to 5
  attempts; `max_tokens` doubles the limit and retries; at most 5 requests in flight. SDK retries are off so
  they are not stacked.
- **Refusals:** `stop_reason: "refusal"` is checked before content is read. Server-side fallback is on
  (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`); if the whole chain refuses the seat fails.
  With a fallback, per-attempt `usage.iterations` is used for cost.
- **Eval baseline:** the single answer uses Opus 5.5 at `high` effort, the same brief, the same
  Verdict/Why/Risks layout and about 800 words, to keep the blind comparison fair. The chairman's
  "Chosen answer:" line and the minority report are stripped from the blind file (both give the council away);
  the full verdict stays in `sessions.json` and the database.
- **SQLite driver:** Node's built-in `node:sqlite` (Node 22.13+) through Drizzle's sqlite-proxy driver.
  `better-sqlite3` crashed on Windows (access violation on open), and the built-in module has no native addon
  to compile. Node prints an "ExperimentalWarning: SQLite" line; it is harmless.
- **Question file format:** `## Title` heading per question, the question below it.

## Phase 0 — prove it works (script only)

- [x] Scaffold: TypeScript strict, ESLint, Vitest, Drizzle, `.env.example`, `.env.local` git-ignored
- [x] Provider interface (`answer`, `rank`, `synthesize`) + Claude implementation
- [x] Streaming, adaptive thinking, explicit `output_config.effort`, no `temperature`, no forced `tool_choice`
- [x] Structured-output rankings (`output_config.format`) validated with Zod
- [x] Refusal handling + server-side fallback, `max_tokens` and 429 backoff, concurrency cap of 5
- [x] Prompt caching of the project brief, `cache_read_input_tokens` recorded per call
- [x] Versioned seats (8) and councils (Game Dev default, General); 5–7 seats enforced
- [x] Orchestrator state machine: answering → ranking → counting → synthesizing → done / failed
- [x] Blind anonymization (fresh order per reviewer, no self-ranking, identifiers stripped)
- [x] Borda count, margin, close-race flag, tie → chairman
- [x] "Chairman decides" fast mode
- [x] SQLite schema (9 tables) + migrations + session persistence
- [x] Usage and cost per call and per session
- [x] `npm run council:eval`: council + single-Opus baseline, blind `Response 1/2`, separate answer key, disagreement rate, cost
- [x] `questions.example.md` (5 questions)
- [x] Unit tests: Borda, anonymization, close race, cost, schemas, orchestrator (fake provider), provider (mocked client), DB
- [x] Opt-in live smoke test: `npm run test:live`
- [x] First real run (1 question, "Match length"): council preferred in the blind comparison; $0.66 per question
      (council $0.59, single $0.07); all five seats reached the same verdict, Pragmatist won unanimously.
- [x] **Gate:** skipped by your decision (2026-10-04) to avoid spending on the full 30-question eval. Judge the council
      through real use in Phase 1 instead. `npm run council:eval` stays available, e.g. `--limit 10` (~$6.50).

## Phase 1 — MVP dashboard (not started)

- [ ] Next.js + Tailwind shell; startup key check (Models API call) with a clear Console-key error
- [ ] Question box: council picker, optional brief, voting mode
- [ ] Live per-seat columns over server-sent events
- [ ] Vote matrix (reviewers × answers, Borda totals, winner, close-race badge)
- [ ] Verdict card with minority report
- [ ] Cost per session + estimate before running
- [ ] Session history; brief editor (Stronghold TD first); brief's last-edited date shown in each session
- [ ] Gate: you use it for a week

## Phase 2 — custom councils (not started)

- [ ] Seat editor with templates and versioning; per-seat model and effort; saved councils
- [ ] Optional rebuttal round (close races only), then re-rank
- [ ] Follow-up questions with prior context
- [ ] File attachments (text, CSV, PDF)

## Phase 3 — other models (only if you confirm the seats agree too often)

- [ ] Second provider behind the interface; mixed-model councils

## Phase 4 — a smarter council (not started)

- [ ] Web search for the Empiricist (Anthropic server-side tool)
- [ ] Seat track records, thumbs up/down on verdicts
- [ ] Suggested councils by question type
- [ ] Overnight mode via Message Batches (half price)
