"use client";

import { useEffect, useReducer } from "react";
import { useRouter } from "next/navigation";
import { SessionReport, type SessionHeader } from "./SessionReport";
import { initialModel, reduce } from "./model";
import type { SeatView } from "../core/view";
import type { StreamEvent } from "../server/runtime";
import type { VotingMode } from "../core/types";

/** Streams a running session over server-sent events, then hands over to the saved version. */
export function LiveSession({ id, seats, mode, header }: { id: string; seats: SeatView[]; mode: VotingMode; header: SessionHeader }) {
  const router = useRouter();
  const [model, dispatch] = useReducer(reduce, initialModel(seats, mode));

  useEffect(() => {
    const es = new EventSource(`/api/sessions/${id}/events`);
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data) as StreamEvent;
      dispatch(e);
      if (e.type === "saved") {
        es.close();
        router.refresh(); // the server page now renders the stored session
      } else if (e.type === "error") {
        es.close();
      }
    };
    es.onerror = () => {
      // EventSource reconnects on its own; the server replays everything so far.
    };
    return () => es.close();
  }, [id, router]);

  return <SessionReport header={header} model={model} />;
}
