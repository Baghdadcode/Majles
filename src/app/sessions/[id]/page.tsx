import { notFound } from "next/navigation";
import { getSessionDetail, listCouncils } from "../../../db/queries";
import { getDb, getLiveRun, type StreamEvent } from "../../../server/runtime";
import { SessionReport } from "../../../components/SessionReport";
import { LiveSession } from "../../../components/LiveSession";
import { modelFromDetail } from "../../../components/model";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getSessionDetail(await getDb(), id);
  if (detail) {
    return (
      <SessionReport
        model={modelFromDetail(detail)}
        header={{
          question: detail.question,
          councilName: detail.councilName,
          createdAt: detail.createdAt,
          brief: detail.brief,
          usage: detail.usage,
        }}
      />
    );
  }

  // Still running in this server process: stream it.
  const started = getLiveRun(id)?.events.find((e): e is Extract<StreamEvent, { type: "started" }> => e.type === "started");
  const council = started && listCouncils().find((c) => c.id === started.councilId);
  if (!started || !council) notFound();
  return (
    <LiveSession
      id={id}
      seats={council.seats}
      mode={started.mode}
      header={{ question: started.question, councilName: council.name, brief: started.brief }}
    />
  );
}
