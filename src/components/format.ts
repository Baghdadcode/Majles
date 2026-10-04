export const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

export const date = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

/** Fixed class strings so Tailwind can see them. One accent per seat position. */
export const SEAT_ACCENTS = [
  { border: "border-sky-500", text: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500" },
  { border: "border-violet-500", text: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500" },
  { border: "border-amber-500", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500" },
  { border: "border-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500" },
  { border: "border-rose-500", text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500" },
  { border: "border-teal-500", text: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500" },
  { border: "border-orange-500", text: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500" },
] as const;
