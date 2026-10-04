import { listCouncils } from "../../../db/queries";
import { json } from "../../../server/http";

export async function GET() {
  return json(listCouncils());
}
