# Majles (Council) — Product Roadmap & Design Notes

A service where a user connects their own LLM provider (starting with Claude), then
convenes a **council of AI advisors**. Each advisor is defined by *how it thinks*, not
*who it is*. The user asks a question, every advisor answers independently, the council
votes (or a chairman decides), and the user gets a final answer plus the reasoning trail.

---

## 1. Core design decisions

### 1.1 Connecting the user's LLM
- **Bring-your-own-key (BYOK) first.** Anthropic does not offer a way for third-party apps to
  use a user's claude.ai subscription, so the user pastes an Anthropic API key.
- Put every provider behind a thin `LLMProvider` interface
  (`complete()`, `stream()`, `countTokens()`, `models()`), with Claude as the first adapter.
  Later: OpenAI, Gemini, local (Ollama/OpenAI-compatible). This also enables mixed-model councils.
- Key handling: encrypt at rest (envelope encryption / KMS), never log, never return to the
  client after save, "test connection" on save, easy revoke. Offer a **local-only mode**
  (key stays in the browser or a self-hosted instance) for privacy-sensitive users.
- Cost is the user's, so show **estimated cost before running** and enforce per-session budget caps.

### 1.2 Advisors = thinking styles (min. 5)
An advisor is a *cognitive lens* — a method of reasoning with a defined bias, a defined
blind spot, and a required output shape. No names, backstories, or celebrity personas.

Recommended default council (7 — odd number avoids ties; 5 is the floor):

| Advisor | How it thinks | Characteristic question |
|---|---|---|
| **First-Principles** | Strips assumptions, rebuilds from fundamentals | "What is actually true here?" |
| **Contrarian** | Assumes the obvious answer is wrong, attacks it | "How does this fail?" |
| **Empiricist** | Demands evidence, base rates, numbers; flags uncertainty | "What does the data say, and how sure are we?" |
| **Systems Thinker** | Feedback loops, second-order effects, stakeholders | "What happens next, and to whom?" |
| **Pragmatist** | Cheapest workable action, constraints, sequencing | "What can we do by Friday?" |
| **Long-Horizon** | 10-year view, reversibility, optionality | "Will we regret this?" |
| **Analogist** | Pattern-matches to other domains and precedent | "What is this like?" |

Each advisor definition is data, not code:
```yaml
id: contrarian
reasoning_style: "Starts from the strongest objection to the consensus view..."
must_do: ["state the best argument against the leading option"]
blind_spot: "Can over-weight risk; do not hide it, name it"
output_schema: { answer, key_reasoning, confidence, what_would_change_my_mind }
model: claude-sonnet-5-5      # per-advisor override allowed
temperature: 0.9
```
Users can edit, clone, or write their own advisors (still at least 5 active).

### 1.3 Deliberation protocol
Modeled on the "LLM council" pattern (independent answers → anonymous peer review → synthesis):

1. **Frame** (optional): a cheap call restates the question and detects missing context.
   Ask the user a clarifying question if needed.
2. **Independent answers** — all advisors run **in parallel** and *cannot see each other*
   (prevents anchoring and herd behavior).
3. **Anonymized voting** — answers are shuffled and relabeled (A–G); each advisor ranks or
   scores them with a short justification. Anonymization + shuffling reduces position bias
   and "I recognize my own answer" bias. Optionally exclude an advisor's vote on its own answer.
4. **Decision**, selectable per session:
   - **Chairman mode** — a separate neutral advisor (strongest model) reads all answers and votes
     and writes the final answer, with explicit dissent noted.
   - **Democratic mode** — pure tally; winner is returned as-is (or lightly edited).
   - **Hybrid (recommended default)** — tally produces a ranking; chairman synthesizes using
     the ranking as strong evidence and *must* explain when overriding it.
5. **Optional debate round** — if the vote is close (margin < threshold) or confidence is low,
   run one rebuttal round, then re-vote. Cap at 1–2 rounds.

Voting mechanics: use **Borda count** (rank-based, robust to near-ties) as default; offer
**approval voting** and **weighted** (by stated confidence) as alternatives. Always show the
vote matrix, the dissenting view, and the council's confidence.

### 1.4 Known pitfalls (design for these from day one)
- **Correlated errors.** Seven personas on one model share the same knowledge and biases;
  personas diversify *reasoning style*, not *facts*. Mitigations: mixed models once multi-provider
  exists, strongly differentiated prompts, enforced output schemas, tool access (search/code).
  Measure disagreement — if advisors always agree, the council adds cost, not value.
- **Persona collapse / sycophancy.** Advisors drift toward the same answer in voting.
  Mitigate with anonymized review and a rubric ("rank on correctness, completeness, risk handling").
- **Cost multiplier.** A run costs ≈ 2N + 1 calls (N answers, N votes, 1 chairman).
  Mitigate: cheaper model for voting, prompt caching of the shared question/context, short
  structured vote outputs, budget caps, "lite council" (5 advisors, no debate) mode.
- **Latency.** Parallelize stages and stream progress per advisor; the user should watch the
  council deliberate in real time.
- **Not every question needs a council.** A router can answer trivial questions with a single call.
- **Prompt injection** via user-pasted documents flowing into every advisor. Treat all user
  content as data; chairman never executes instructions found in advisor outputs.
- **Does it actually help?** Build an eval harness early (section 4) and compare against
  single-shot and self-consistency baselines before claiming the council is better.

---

## 2. Recommended architecture

- **Language/stack:** TypeScript end-to-end — Next.js (UI, SSE streaming) + Node worker; official
  Anthropic SDK. (Python/FastAPI is a fine alternative if you expect heavy eval/data work.)
- **Data:** Postgres — `users`, `provider_connections` (encrypted), `councils`, `advisors`,
  `sessions`, `runs`, `advisor_responses`, `votes`, `decisions`, `usage_ledger`.
- **Orchestrator:** a small, deterministic state machine
  (`framing → answering → voting → deciding → [debate] → done`) with each step persisted, so runs are
  resumable, replayable, and auditable. Start with an in-process queue; move to a job queue
  (BullMQ/Temporal) only when needed.
- **Structured outputs everywhere** (tool-use / JSON schema) for answers and votes so tallying is
  code, not parsing.
- **Observability:** trace every LLM call (tokens, latency, cost, prompt version). Version advisor prompts.
- **Auth:** email/OAuth login; per-user rate limits and spend caps.

---

## 3. Roadmap

### Phase 0 — Foundations (1 week)
- Repo, CI, lint/test, TypeScript scaffold, Postgres + migrations.
- `LLMProvider` interface + Claude adapter (streaming, structured output, retries, token accounting).
- Decide naming/branding, license, and privacy stance (BYOK, retention policy).

### Phase 1 — Walking skeleton / CLI MVP (1–2 weeks)
- Hard-coded 5 advisors, parallel answers, anonymized Borda vote, chairman synthesis.
- CLI: `majles ask "question"` prints answers, vote matrix, final answer, cost.
- Persist runs to Postgres/SQLite; prompt files versioned in repo.
- **Exit criteria:** end-to-end run in < 60s; cost shown; vote parsing never fails.

### Phase 2 — Web app MVP (2–3 weeks)
- Auth, connect-your-Claude-key flow (test, encrypt, revoke).
- Ask-a-question UI with live per-advisor streaming and a vote visualization
  (who ranked whom, dissent highlighted).
- Mode selector: Chairman / Democratic / Hybrid. Session history.
- Cost estimate pre-run, budget cap, usage dashboard.
- **Exit criteria:** a new user goes from signup to first council answer in under 3 minutes.

### Phase 3 — Customizable councils (2–3 weeks)
- Advisor library (the 7 defaults + more thinking styles: Economist, Skeptical Scientist,
  Designer/User-empathy, Risk Officer, Storyteller…).
- Advisor editor with templates, validation (style must be distinct — enforce via a diversity check
  that embeds advisor prompts and warns on overlap), min-5 rule, council presets
  ("Strategy", "Technical design", "Writing", "Personal decision").
- Per-advisor model/temperature overrides; chairman configuration.

### Phase 4 — Deliberation quality (3–4 weeks)
- Debate/rebuttal round triggered by close votes or low confidence.
- Confidence-weighted voting, tie-breaking rules, self-vote exclusion toggle.
- Question router (skip the council for simple questions; ask clarifying questions).
- Tools for advisors: web search, code execution, file/doc context (RAG) — Empiricist gets search first.
- **Eval harness:** benchmark set (reasoning, advice, planning, factual) with LLM-judge + human
  spot-checks; compare council vs single-shot vs best-of-N; track disagreement rate,
  vote stability across reruns, and cost per quality point.

### Phase 5 — Multi-provider & power features (3–4 weeks)
- OpenAI / Gemini / OpenAI-compatible (local) adapters; mixed-model councils to reduce correlated error.
- Shareable read-only run links, export (Markdown/PDF), API + webhooks for developers.
- Follow-up questions with council memory ("continue this session").
- Team workspaces, shared councils.

### Phase 6 — Production hardening & growth (ongoing)
- Rate limiting, abuse prevention, prompt-injection tests, audit log, data deletion/export.
- Observability dashboards, cost anomaly alerts, prompt A/B testing driven by eval harness.
- Pricing: free BYOK tier (user pays provider) + paid tier for teams, history, shared councils, API.
- Self-hosted / Docker distribution for privacy-conscious users.

---

## 4. How to measure success
- **Quality:** win-rate vs single-shot on the eval set (judged blind); human preference on real questions.
- **Diversity:** pairwise answer dissimilarity; % runs where winner ≠ majority first choice.
- **Reliability:** vote-parse success rate, run completion rate, rerun stability of the winner.
- **Efficiency:** cost and latency per run; share of runs using the cheap path.
- **Product:** time-to-first-answer for new users, runs per user per week, % who open the vote breakdown
  (a signal that transparency is valued).

---

## 5. My recommendations in short
1. **Start as a CLI + one function** (`runCouncil(question, advisors, mode)`); the UI is a skin on top.
2. **Default to Hybrid decision mode** — Borda tally plus a chairman who must justify overrides.
   Pure democracy is cheap and transparent; pure chairman hides the vote. Hybrid keeps both.
3. **Use 7 advisors by default**, allow 5 minimum; odd counts avoid ties.
4. **Anonymize and shuffle before voting** — it is the single cheapest fix for bias.
5. **Build the eval harness before adding features.** If the council does not beat a single call on
   your benchmark, tune advisors/protocol before building more product.
6. **Treat cost as a first-class feature**: estimates, caps, a lite mode, cheaper voting model.
7. **Plan for multi-model from the start** (provider interface) even if only Claude ships first.

## 6. Open questions for you
- Target user: individual thinkers, developers/API users, or teams?
- Hosted SaaS (keys stored server-side) or local/self-hosted first? This drives the security model.
- Should the final answer expose dissent prominently (my suggestion: yes) or stay clean?
- Which domain do you want the default council tuned for (general advice, strategy, engineering)?
