import { NextResponse } from "next/server";
import { listExplorationSessions, saveExplorationSession } from "@/lib/exploration-store";
import { api, body, HttpError, requireAuthor } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { ownerKeyFor } from "@/lib/auth/types";

export const runtime = "nodejs";

function ownerKey(value: string | null) {
  if (!value || !/^[a-zA-Z][\w-]{0,63}$/.test(value)) throw new HttpError(400, "Phiên thiết bị không hợp lệ.");
  return value;
}

export async function GET(req: Request) {
  return api(async () => {
    const key = ownerKeyFor((await requireUser(req)).id);
    return NextResponse.json(await listExplorationSessions(key));
  }, req);
}

export async function POST(req: Request) {
  return api(async () => {
    const user = await requireUser(req);
    const session = await saveExplorationSession({ ...await body(req, 1_200_000), ownerKey: ownerKeyFor(user.id) });
    return NextResponse.json(session);
  }, req);
}
