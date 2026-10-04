import type { Stage } from "./model";

const FULL: Stage[] = ["answering", "ranking", "counting", "synthesizing", "done"];
const FAST: Stage[] = ["answering", "synthesizing", "done"];
const LABEL: Record<Stage, string> = {
  answering: "Answering",
  ranking: "Ranking",
  counting: "Counting",
  synthesizing: "Chairman",
  done: "Done",
  failed: "Failed",
};

export function StageStepper({ stage, mode }: { stage: Stage; mode: "full" | "chairman" }) {
  const steps = mode === "full" ? FULL : FAST;
  const current = steps.indexOf(stage);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Session progress">
      {steps.map((s, i) => {
        const state = stage === "failed" ? "idle" : i < current || stage === "done" ? "past" : i === current ? "now" : "idle";
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={
                state === "past"
                  ? "rounded-full bg-zinc-900 px-2.5 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : state === "now"
                    ? "rounded-full bg-indigo-600 px-2.5 py-1 text-white"
                    : "rounded-full bg-zinc-200 px-2.5 py-1 text-zinc-500 dark:bg-zinc-800"
              }
              aria-current={state === "now" ? "step" : undefined}
            >
              {LABEL[s]}
              {state === "now" && s !== "done" ? "…" : ""}
            </span>
            {i < steps.length - 1 && <span className="text-zinc-400">›</span>}
          </li>
        );
      })}
      {stage === "failed" && <li className="rounded-full bg-red-600 px-2.5 py-1 text-white">Failed</li>}
    </ol>
  );
}
