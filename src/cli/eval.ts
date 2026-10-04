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
import type { SeatDef, VotingMode } from "../core/types";
import { parseQuestions, stripChairmanPreamble } from "./questions";
import { loadEnv } from "../config/env";

interface Args {
  file: string;
  council: string;
  mode: VotingMode;
  briefPath?: string;
  out: string;
  limit?: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { file: "questions.md", council: "game-dev", mode: "full", out: "eval-out", dryRun: false };
  const rest = [...argv];
  while (rest.length) {
    const a = rest.shift()!;
    if (a === "--council") args.council = rest.shift()!;
    else if (a === "--mode") args.mode = rest.shift() as VotingMode;
    else if (a === "--brief") args.briefPath = rest.shift()!;
    else if (a === "--out") args.out = rest.shift()!;
    else if (a === "--limit") args.limit = Number(rest.shift());
    else if (a === "--dry-run") args.dryRun = true;
    else if (!a.startsWith("--")) args.file = a;
    else throw new Error(`Unknown option ${a}`);
  }
  if (args.mode !== "full" && args.mode !== "chairman") throw new Error('--mode must be "full" or "chairman"');
  return args;
}

/** Rough pre-run estimate (documented as an estimate: tokens per call are typical, not measured). */
function estimateCost(questions: number, seats: number, mode: VotingMode): number {
  const p = PRICING["claude-opus-5-5"];
  const call = (inTok: number, outTok: number) => (inTok * p.inputPerMTok + outTok * p.outputPerMTok) / 1e6;
  const answers = seats * call(1_500, 4_000);
  const ranks = mode === "full" ? seats * call(5_000, 3_000) : 0;
  const chair = call(mode === "full" ? 9_000 : 6_000, 6_000);
  const baseline = call(1_000, 4_000);
  return questions * (answers + ranks + chair + baseline);
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const questions = parseQuestions(readFileSync(args.file, "utf8")).slice(0, args.limit);
  if (questions.length === 0) throw new Error(`No questions found in ${args.file}. Use "## Title" headings.`);
  const council = getCouncil(args.council);

  console.log(`Council "${council.name}" (${council.seats.map((s) => s.name).join(", ")}), mode: ${args.mode}`);
  console.log(
    `${questions.length} question(s). Rough estimate: ${formatUsd(estimateCost(questions.length, council.seats.length, args.mode))} (plus one baseline answer each).`,
  );
  if (args.dryRun) return;

  await checkApiKey();
  const provider = new ClaudeProvider();
  const db = openDb();
  seedDefaults(db);

  const brief = args.briefPath
    ? upsertBrief(db, {
        id: basename(args.briefPath, extname(args.briefPath)),
        name: basename(args.briefPath, extname(args.briefPath)),
        content: readFileSync(args.briefPath, "utf8"),
      })
    : undefined;
  if (brief) console.log(`Brief: ${brief.name} (last edited ${brief.updatedAt.toISOString().slice(0, 10)})`);

  const baselineSeat: SeatDef = { ...CHAIRMAN, id: "single", name: "Single", effort: "high" };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(args.out, stamp);
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
    process.stdout.write(`[${i + 1}/${questions.length}] ${q.title} ... `);
    const createdAt = new Date();
    const [session, base] = await Promise.all([
      runSession({ question: q.text, brief: brief?.content, seats: council.seats, mode: args.mode }, provider),
      provider.baseline(q.text, baselineSeat, brief?.content),
    ]);
    const sessionId = saveSession(db, { question: q.text, council, brief, result: session, createdAt });
    const baselineCost = sumCost(base.usage);
    const councilIsResponse = (randomInt(2) + 1) as 1 | 2;
    rows.push({ title: q.title, session, baseline: base.value, baselineCost, sessionId, councilIsResponse });
    console.log(`${session.state} ${formatUsd(session.totalCostUsd + baselineCost)}`);
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
  const wins = seatWins(db);
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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
