import { AskForm } from "../components/AskForm";
import { listBriefs, listCouncils, listSessions } from "../db/queries";
import { getDb, getKeyStatus } from "../server/runtime";
import Link from "next/link";
import { dateTime, usd } from "../components/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDb();
  const [briefs, status, recent] = await Promise.all([listBriefs(db), getKeyStatus(), listSessions(db, 5)]);
  return (
    <div className="space-y-8">
      <AskForm councils={listCouncils()} briefs={briefs} keyOk={status.ok} />
      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Recent sessions</h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white text-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/sessions/${s.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <span className="flex-1 truncate">{s.question}</span>
                  <span className="text-xs text-zinc-500">{dateTime(s.createdAt)}</span>
                  <span className="w-16 text-right text-xs text-zinc-500">{usd(s.totalCostUsd)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
