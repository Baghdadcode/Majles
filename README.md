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

See `ROADMAP.md` for the phases, what is done, and the defaults chosen along the way.
