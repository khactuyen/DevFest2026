import { NextResponse } from "next/server";
import { deleteExplorationSession, listExplorationSessions } from "@/lib/exploration-store";
import { api, HttpError, requireAuthor } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { ownerKeyFor } from "@/lib/auth/types";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

function ownerKey(value: string | null) {
  if (!value || !/^[a-zA-Z][\w-]{0,63}$/.test(value)) throw new HttpError(400, "Phiên thiết bị không hợp lệ.");
  return value;
}

export async function GET(req: Request, { params }: Context) {
  return api(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const key = ownerKeyFor(user.id);
    const session = (await listExplorationSessions(key)).find((item) => item.id === id);
    if (!session) throw new HttpError(404, "Không tìm thấy phiên khám phá.");
    return NextResponse.json(session);
  }, req);
}

export async function DELETE(req: Request, { params }: Context) {
  return api(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const key = ownerKeyFor(user.id);
    await deleteExplorationSession(id, key);
    return NextResponse.json({ deleted: true });
  }, req);
}
