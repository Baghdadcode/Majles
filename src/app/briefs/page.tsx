import { BriefEditor } from "../../components/BriefEditor";
import { listBriefs } from "../../db/queries";
import { getDb } from "../../server/runtime";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const briefs = await listBriefs(await getDb());
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Project briefs</h1>
        <p className="text-sm text-zinc-500">
          Background about one game. Attach a brief to a question and every seat and the chairman see it. Sessions remember when the brief was last edited.
        </p>
      </div>
      <BriefEditor initial={briefs} />
    </div>
  );
}
