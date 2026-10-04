import { AnswerColumns } from "./AnswerColumns";
import { StageStepper } from "./StageStepper";
import { VerdictCard } from "./VerdictCard";
import { VoteMatrix } from "./VoteMatrix";
import { date, dateTime, usd } from "./format";
import type { SessionModel } from "./model";

export interface SessionHeader {
  question: string;
  councilName: string;
  createdAt?: string;
  brief: { name: string; updatedAt: string } | null;
  usage?: { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

export function SessionReport({ header, model }: { header: SessionHeader; model: SessionModel }) {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="whitespace-pre-wrap text-lg font-medium leading-snug">{header.question}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>{header.councilName} council</span>
          <span>{model.mode === "full" ? "Full vote" : "Chairman decides"}</span>
          {header.createdAt && <span>{dateTime(header.createdAt)}</span>}
          {header.brief ? (
            <span title="The brief as it was when this session ran">
              Brief: {header.brief.name} (last edited {date(header.brief.updatedAt)})
            </span>
          ) : (
            <span>No brief</span>
          )}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Cost {usd(model.costUsd)}</span>
          {header.usage && (
            <span title="Tokens served from the prompt cache">
              {header.usage.calls} calls · cache reads {header.usage.cacheReadTokens.toLocaleString()} tokens
            </span>
          )}
        </div>
        <StageStepper stage={model.stage} mode={model.mode} />
        {model.error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {model.error}
          </p>
        )}
      </header>
      <VerdictCard model={model} />
      <VoteMatrix model={model} />
      <AnswerColumns model={model} />
    </div>
  );
}
