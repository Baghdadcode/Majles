import { z } from "zod";
import { estimateSessionCost } from "../../../core/estimate";
import { getBrief } from "../../../db/queries";
import { getCouncil } from "../../../seats/councils";
import { CHAIRMAN } from "../../../seats/definitions";
import { getDb } from "../../../server/runtime";
import { badRequest, json, readJson } from "../../../server/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  councilId: z.string(),
  briefId: z.string().nullish(),
  mode: z.enum(["full", "chairman"]),
  question: z.string().default(""),
});

export async function POST(req: Request) {
  try {
    const input = await readJson(req, schema);
    const council = getCouncil(input.councilId);
    const brief = input.briefId ? await getBrief(await getDb(), input.briefId) : null;
    const usd = estimateSessionCost({
      seats: council.seats,
      chairman: CHAIRMAN,
      mode: input.mode,
      briefChars: brief?.content.length ?? 0,
      questionChars: input.question.length,
    });
    return json({ usd });
  } catch (err) {
    return badRequest(err);
  }
}
