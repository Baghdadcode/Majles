"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { SEAT_ACCENTS } from "./format";
import type { SessionModel } from "./model";

export function AnswerColumns({ model }: { model: SessionModel }) {
  const [expanded, setExpanded] = useState(false);
  const labelOf = new Map(model.labels.map((l) => [l.seatId, l.label]));
  const winner = model.tally?.winnerSeatId;
  const settled = model.stage !== "answering";
  return (
    <section aria-labelledby="answers-heading">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="answers-heading" className="text-sm font-semibold">
          Seat answers
        </h2>
        {settled && (
          <button className="text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setExpanded((x) => !x)}>
            {expanded ? "Collapse" : "Expand all"}
          </button>
        )}
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {model.seats.map((seat, i) => {
          const a = model.answers[seat.id] ?? { text: "", status: "pending" as const };
          const accent = SEAT_ACCENTS[i % SEAT_ACCENTS.length]!;
          const tall = settled && !expanded;
          return (
            <article
              key={seat.id}
              className={`flex flex-col rounded-lg border border-l-4 border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 ${accent.border} ${winner === seat.id ? "ring-2 ring-indigo-500" : ""}`}
            >
              <header className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className={`text-sm font-semibold ${accent.text}`}>{seat.name}</h3>
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-zinc-500">
                  {labelOf.get(seat.id) && <span title="Label the chairman saw">Answer {labelOf.get(seat.id)}</span>}
                  {winner === seat.id && <span className="rounded bg-indigo-600 px-1.5 py-0.5 font-medium text-white">Winner</span>}
                  <StatusDot status={a.status} />
                </span>
              </header>
              {a.status === "failed" ? (
                <p className="text-sm text-red-600 dark:text-red-400">Failed: {a.error}</p>
              ) : a.text ? (
                <Clamp clamped={tall}>
                  <Markdown text={a.text} className={a.status === "streaming" ? "caret" : ""} />
                </Clamp>
              ) : (
                <p className="text-sm text-zinc-400">Thinking…</p>
              )}
              <footer className="mt-auto pt-2 text-[11px] text-zinc-400">
                {seat.model.replace("claude-", "")} · {seat.effort} effort
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "done" ? "bg-emerald-500" : status === "failed" ? "bg-red-500" : status === "streaming" ? "bg-indigo-500 animate-pulse" : "bg-zinc-300 dark:bg-zinc-600";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} aria-label={status} title={status} />;
}

/** Caps a finished answer's height, fading the bottom only when the text actually overflows. */
function Clamp({ clamped, children }: { clamped: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [clamped, children]);
  return (
    <div ref={ref} className={`relative ${clamped ? "max-h-72 overflow-hidden" : ""}`}>
      {children}
      {clamped && overflows && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white dark:from-zinc-900" />
      )}
    </div>
  );
}
