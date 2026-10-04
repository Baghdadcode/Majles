import { ordinal } from "./format";
import type { SessionModel } from "./model";

/** Reviewers (rows) against answers (columns), with Borda totals, winner and close-race badge. */
export function VoteMatrix({ model }: { model: SessionModel }) {
  const { tally, rankings, seats } = model;
  if (model.effectiveMode === "chairman") {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        No vote in this session: the chairman picked the best answer directly{model.mode === "full" ? " (no ranking came back)" : ""}.
      </section>
    );
  }
  if (rankings.length === 0 && model.failedReviewers.length === 0) return null;
  const name = new Map(seats.map((s) => [s.id, s.name]));
  const answered = seats.filter((s) => model.answers[s.id]?.status !== "failed");
  const entry = new Map(tally?.entries.map((e) => [e.seatId, e]) ?? []);

  return (
    <section aria-labelledby="matrix-heading" className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="matrix-heading" className="text-sm font-semibold">
          Vote matrix
        </h2>
        {tally?.tie && <Badge tone="red">Tie: chairman decides</Badge>}
        {tally && !tally.tie && tally.closeRace && <Badge tone="amber">Close race</Badge>}
        {tally && (
          <span className="text-xs text-zinc-500">
            Margin {(tally.marginFraction * 100).toFixed(1)}% of max score
          </span>
        )}
        {!tally && <span className="text-xs text-zinc-500">{rankings.length} of {answered.length} reviews in…</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead>
            <tr>
              <th className="py-1.5 pr-2 font-medium text-zinc-500">Reviewer ↓ / Answer →</th>
              {answered.map((s) => (
                <th key={s.id} className={`px-2 py-1.5 font-medium ${tally?.winnerSeatId === s.id ? "text-indigo-600 dark:text-indigo-400" : ""}`}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rankings.map((r) => {
              const byAnswer = new Map(r.items.map((i) => [i.answerSeatId, i]));
              const n = r.items.length;
              return (
                <tr key={r.reviewerSeatId} className="border-t border-zinc-100 dark:border-zinc-800">
                  <th className="py-1.5 pr-2 font-normal">
                    {name.get(r.reviewerSeatId)} <span className="text-zinc-400">({r.reviewerLabel})</span>
                  </th>
                  {answered.map((s) => {
                    const it = byAnswer.get(s.id);
                    if (s.id === r.reviewerSeatId) return <td key={s.id} className="px-2 py-1.5 text-zinc-300 dark:text-zinc-600" title="Seats never rank their own answer">—</td>;
                    if (!it) return <td key={s.id} className="px-2 py-1.5 text-zinc-300">·</td>;
                    return (
                      <td key={s.id} className="px-2 py-1.5" title={it.reasoning}>
                        <span className={it.rank === 1 ? "font-semibold" : ""}>{ordinal(it.rank)}</span>
                        <span className="ml-1 text-zinc-400">+{n - it.rank}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {model.failedReviewers.map((f) => (
              <tr key={f.seatId} className="border-t border-zinc-100 text-red-600 dark:border-zinc-800 dark:text-red-400">
                <th className="py-1.5 pr-2 font-normal">{name.get(f.seatId)}</th>
                <td colSpan={answered.length} className="px-2 py-1.5">Review failed: {f.error}</td>
              </tr>
            ))}
          </tbody>
          {tally && (
            <tfoot>
              <tr className="border-t-2 border-zinc-300 dark:border-zinc-700">
                <th className="py-1.5 pr-2 font-semibold">Borda total</th>
                {answered.map((s) => {
                  const e = entry.get(s.id);
                  const win = tally.winnerSeatId === s.id;
                  return (
                    <td key={s.id} className={`px-2 py-1.5 font-semibold ${win ? "text-indigo-600 dark:text-indigo-400" : ""}`}>
                      {e ? `${e.points}/${e.maxPossible}` : "–"}
                      {win && <span className="ml-1 rounded bg-indigo-600 px-1 py-0.5 text-[10px] font-medium text-white">Winner</span>}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">Hover a cell for the reviewer&apos;s one-sentence reason. With N answers ranked, 1st gets N−1 points and last gets 0.</p>
    </section>
  );
}

function Badge({ tone, children }: { tone: "amber" | "red"; children: React.ReactNode }) {
  const cls = tone === "amber" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}
