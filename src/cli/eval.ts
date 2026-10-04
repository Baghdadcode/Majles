import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { randomInt } from "node:crypto";
import { formatUsd, sumCost } from "../core/cost";
import { runSession, type SessionResult } from "../core/orchestrator";
import { PRICING } from "../config/models";
import { openDb } from "../db/client";
import { saveSession, seatWins, seedDefaults, upsertBrief } from "../db/store";
import { ClaudeProvider, checkApiKey } from "../providers/claude";
import { getCouncil } from "../seats/councils";
import { CHAIRMAN } from "../seats/definitions";
import type { CallResult, CouncilProvider, SeatDef, VotingMode } from "../core/types";
import { FakeProvider } from "../providers/fake";
import { parseQuestions, selectQuestions, stripChairmanPreamble } from "./questions";
import { getDbPath, loadEnv } from "../config/env";
import type { SessionEvent } from "../core/orchestrator";

interface Args {
  file: string;
  council: string;
  mode: VotingMode;
  briefPath?: string;
  out: string;
  limit?: number;
  only?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { file: "questions.md", council: "game-dev", mode: "full", out: "eval-out", dryRun: false };
  const rest = [...argv];
  let positional = 0;
  while (rest.length) {
    const a = rest.shift()!;
    if (a === "--council") args.council = rest.shift()!;
    else if (a === "--mode") args.mode = rest.shift() as VotingMode;
    else if (a === "--brief") args.briefPath = rest.shift()!;
    else if (a === "--out") args.out = rest.shift()!;
    else if (a === "--limit") args.limit = Number(rest.shift());
    else if (a === "--only") args.only = rest.shift()!;
    else if (a === "--dry-run") args.dryRun = true;
    else if (!a.startsWith("--")) {
      // A second positional usually means the shell or npm swallowed the "--" and our flags with it.
      if (positional++ > 0) {
        throw new Error(
          `Unexpected argument "${a}". Options like --only/--brief were probably eaten by npm. ` +
            `In PowerShell, quote the separator: npm run council:eval '--' questions.md --only "..."`,
        );
      }
      args.file = a;
    }
    else throw new Error(`Unknown option ${a}`);
  }
  if (args.mode !== "full" && args.mode !== "chairman") throw new Error('--mode must be "full" or "chairman"');
  return args;
}

/**
 * Rough pre-run estimate: typical tokens per call, not measured. The brief (about 4 characters per token) is
 * priced as a cache write on the parallel answer and baseline calls and as a cache read on the later calls.
 * Includes the single-answer baseline.
 */
function estimateCost(questions: number, seats: number, mode: VotingMode, briefChars = 0): number {
  const p = PRICING["claude-opus-5-5"];
  const call = (inTok: number, outTok: number) => (inTok * p.inputPerMTok + outTok * p.outputPerMTok) / 1e6;
  const briefTok = Math.ceil(briefChars / 4);
  const firstWave = seats + 1; // answers + baseline, sent together
  const laterCalls = (mode === "full" ? seats : 0) + 1; // rankings + chairman
  const brief = (briefTok * (firstWave * p.cacheWritePerMTok + laterCalls * p.cacheReadPerMTok)) / 1e6;
  const answers = seats * call(1_500, 4_000);
  const ranks = mode === "full" ? seats * call(5_000, 3_000) : 0;
  const chair = call(mode === "full" ? 9_000 : 6_000, 6_000);
  const baseline = call(1_000, 4_000);
  return questions * (answers + ranks + chair + baseline + brief);
}

let finished = false;
const step = (msg: string) => console.log(`- ${msg}...`);

/** Progress for long runs; text deltas are skipped to keep the terminal readable. */
function logEvent(e: SessionEvent): void {
  if (e.type === "state") console.log(`    ${e.state}`);
  else if (e.type === "answer_done") console.log(`      answered: ${e.seatId}`);
  else if (e.type === "answer_failed") console.log(`      FAILED to answer: ${e.seatId}: ${e.error}`);
  else if (e.type === "ranking_done") console.log(`      ranked: ${e.reviewerId}`);
  else if (e.type === "ranking_failed") console.log(`      FAILED to rank: ${e.reviewerId}: ${e.error}`);
}

// Make an early exit impossible to miss (an empty event loop ends Node silently with work still pending).
process.on("exit", (code) => {
  if (!finished) console.error(`\nCouncil eval stopped before finishing (exit code ${code}).`);
});

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const questions = selectQuestions(parseQuestions(readFileSync(args.file, "utf8")), args.only).slice(0, args.limit);
  if (questions.length === 0) throw new Error(`No questions found in ${args.file}. Use "## Title" headings.`);
  const council = getCouncil(args.council);

  console.log(`Council "${council.name}" (${council.seats.map((s) => s.name).join(", ")}), mode: ${args.mode}`);
  const briefChars = args.briefPath ? readFileSync(args.briefPath, "utf8").length : 0;
  const estimate = estimateCost(questions.length, council.seats.length, args.mode, briefChars);
  console.log(
    `${questions.length} question(s). Rough estimate: ${formatUsd(estimate)} including the single-answer baseline` +
      (args.briefPath ? ` and the brief (~${Math.ceil(briefChars / 4)} tokens per call).` : "."),
  );
  if (args.dryRun) return;

  // COUNCIL_FAKE=1 runs the whole CLI against the offline fake provider (no key, no cost), for debugging.
  const fake = process.env.COUNCIL_FAKE === "1";
  let provider: CouncilProvider;
  let baseline: (question: string, seat: SeatDef, brief?: string) => Promise<CallResult<string>>;
  if (fake) {
    step("Using the offline fake provider (COUNCIL_FAKE=1)");
    const f = new FakeProvider();
    provider = f;
    baseline = (question, seat, b) => f.answer({ seat, question, brief: b });
  } else {
    step("Checking API key");
    await checkApiKey();
    const claude = new ClaudeProvider();
    provider = claude;
    baseline = (question, seat, b) => claude.baseline(question, seat, b);
  }
  // Fake runs go to their own database and folder so they never mix with real results.
  const dbPath = fake && !process.env.COUNCIL_DB_PATH ? "./data/council-fake.db" : getDbPath();
  step(`Opening database ${dbPath}`);
  const db = await openDb(dbPath);
  await seedDefaults(db);

  const brief = args.briefPath
    ? await upsertBrief(db, {
        id: basename(args.briefPath, extname(args.briefPath)),
        name: basename(args.briefPath, extname(args.briefPath)),
        content: readFileSync(args.briefPath, "utf8"),
      })
    : undefined;
  if (brief) console.log(`Brief: ${brief.name} (last edited ${brief.updatedAt.toISOString().slice(0, 10)})`);

  const baselineSeat: SeatDef = { ...CHAIRMAN, id: "single", name: "Single", effort: "high" };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(args.out, fake ? `fake-${stamp}` : stamp);
  mkdirSync(outDir, { recursive: true });

  const rows: {
    title: string;
    session: SessionResult;
    baseline: string;
    baselineCost: number;
    sessionId: string;
    councilIsResponse: 1 | 2;
  }[] = [];

  for (const [i, q] of questions.entries()) {
    console.log(`[${i + 1}/${questions.length}] ${q.title}`);
    const createdAt = new Date();
    const [session, base] = await Promise.all([
      runSession(
        { question: q.text, brief: brief?.content, seats: council.seats, mode: args.mode, onEvent: logEvent },
        provider,
      ),
      baseline(q.text, baselineSeat, brief?.content),
    ]);
    const sessionId = await saveSession(db, { question: q.text, council, brief, result: session, createdAt });
    const baselineCost = sumCost(base.usage);
    const councilIsResponse = (randomInt(2) + 1) as 1 | 2;
    rows.push({ title: q.title, session, baseline: base.value, baselineCost, sessionId, councilIsResponse });
    console.log(`  -> ${session.state}${session.error ? `: ${session.error}` : ""} (${formatUsd(session.totalCostUsd + baselineCost)})`);
  }

  // Blind comparison: Response 1 / 2 in random order; the key lives in a separate file.
  const blind = rows
    .map((r, i) => {
      const verdict = stripChairmanPreamble(r.session.verdict ?? "(no verdict: session failed)");
      const [one, two] = r.councilIsResponse === 1 ? [verdict, r.baseline] : [r.baseline, verdict];
      return `# Question ${i + 1}: ${r.title}\n\n${questions[i]!.text}\n\n## Response 1\n\n${one}\n\n## Response 2\n\n${two}\n\n**Your pick (1 / 2 / tie):** \n\n---\n`;
    })
    .join("\n");
  writeFileSync(join(outDir, "blind-comparison.md"), `${blind}\n`);
  writeFileSync(
    join(outDir, "answer-key.json"),
    JSON.stringify(
      rows.map((r, i) => ({
        question: i + 1,
        title: r.title,
        response1: r.councilIsResponse === 1 ? "council" : "single",
        response2: r.councilIsResponse === 1 ? "single" : "council",
      })),
      null,
      2,
    ),
  );

  const done = rows.filter((r) => r.session.state === "done" && r.session.tally);
  const close = done.filter((r) => r.session.tally!.closeRace).length;
  const meanMargin = done.length ? done.reduce((s, r) => s + r.session.tally!.marginFraction, 0) / done.length : 0;
  const totalCouncil = rows.reduce((s, r) => s + r.session.totalCostUsd, 0);
  const totalBaseline = rows.reduce((s, r) => s + r.baselineCost, 0);
  const cacheReads = rows.reduce((s, r) => s + r.session.usage.reduce((a, u) => a + u.cacheReadTokens, 0), 0);
  const wins = await seatWins(db);
  const summary = [
    `# Council eval summary (${stamp})`,
    "",
    `- Council: ${council.name}; mode: ${args.mode}; questions: ${rows.length}`,
    `- Sessions completed: ${rows.filter((r) => r.session.state === "done").length}/${rows.length}`,
    `- Seats disagree (close race or tie): ${close}/${done.length} sessions (${done.length ? ((close / done.length) * 100).toFixed(0) : 0}%); mean winning margin ${(meanMargin * 100).toFixed(1)}% of max score`,
    `- Cost: council ${formatUsd(totalCouncil)}, single baseline ${formatUsd(totalBaseline)}; per question ${formatUsd((totalCouncil + totalBaseline) / Math.max(rows.length, 1))}`,
    `- Cache read tokens across all calls: ${cacheReads}${brief ? "" : " (no brief attached, nothing to cache)"}`,
    "",
    "| # | Question | State | Winner seat | Margin | Close race | Council cost | Baseline cost |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((r, i) => {
      const t = r.session.tally;
      return `| ${i + 1} | ${r.title} | ${r.session.state} | ${r.session.winnerSeatId ?? "-"} | ${t ? `${(t.marginFraction * 100).toFixed(1)}%` : "-"} | ${t ? (t.closeRace ? "yes" : "no") : "-"} | ${formatUsd(r.session.totalCostUsd)} | ${formatUsd(r.baselineCost)} |`;
    }),
    "",
    `Seat wins so far (all stored sessions): ${JSON.stringify(wins)}`,
    "",
  ].join("\n");
  writeFileSync(join(outDir, "summary.md"), summary);
  writeFileSync(
    join(outDir, "sessions.json"),
    JSON.stringify(
      rows.map((r) => ({ title: r.title, sessionId: r.sessionId, session: { ...r.session, tally: r.session.tally } })),
      null,
      2,
    ),
  );

  console.log(`\n${summary}\nWrote ${outDir}/ (blind-comparison.md, answer-key.json, summary.md, sessions.json)`);
}

main()
  .then(() => {
    finished = true;
  })
  .catch((err) => {
    finished = true;
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
  });
