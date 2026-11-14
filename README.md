# Council

A personal, local app: ask a question, a council of AI advisors (Claude) answers independently, they rank each
other's answers blind, and a chairman writes the verdict.

## Setup

Requires Node 22.13 or newer.

```bash
npm install
cp .env.example .env.local   # then put your Console API key in it (console.anthropic.com)
npm run dev                  # http://localhost:3000
```

A Claude.ai subscription does not work: the app calls the Anthropic API with your own key, which stays on the
server side and is never sent to the browser. The database is created automatically in `data/council.db`.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | The dashboard |
| `COUNCIL_FAKE=1 npm run dev` | The dashboard offline with canned answers (no key, no cost, separate database). PowerShell: `$env:COUNCIL_FAKE="1"; npm run dev` |
| `npx tsx src/cli/eval.ts questions.md --brief stronghold-td.md --dry-run` | Blind council-vs-single-answer eval; drop `--dry-run` to run it |
| `npm test` | Unit tests (never call the API) |
| `npm run test:e2e` | Browser tests in fake mode |
| `npm run test:live` | One real-API smoke test (costs about $1) |

## Majles skill for Claude Code

The same council idea also runs inside Claude Code, with no API key: subagents answer instead of API calls.
Open Claude Code in this repository and ask, for example, "kör ett Majles-råd om min app-idé" or
"Majles full: should I rewrite the backend?".

- The chairman picks 5 of 14 roles for the question (or use a ready-made council), shows them, and waits for "go".
- Modes: `quick` (3 roles, 4 subagents), `standard` (default, 7), `full` (11, like the app).
- Answers and reviews run on Sonnet, the verdict on Opus.

Files: `.claude/skills/majles/` (the skill, roles, councils, prompts, tally script) and `.claude/agents/majles-*.md`.

### Install as a plugin (every project)

This repository is also a plugin marketplace. In Claude Code, run:

```
/plugin marketplace add Baghdadcode/Majles
/plugin install majles@majles
```

Then start Majles with `/majles:majles quick <question>`, or just ask for "Majles" in plain words.

**Updates:** turn on auto-update once (`/plugin` → Marketplaces → majles → Enable auto-update). The plugin has
no `version` field, so every commit on the default branch counts as a new version; Claude Code picks it up in
the background and it applies from the next session (or `/reload-plugins`). To update by hand:
`/plugin marketplace update majles`.

Check the manifests with `claude plugin validate .`.

See `ROADMAP.md` for the phases, what is done, and the defaults chosen along the way.
