import { NextResponse } from "next/server";
import { z } from "zod";
import { api, body, HttpError } from "@/lib/http";
import { getAuthContext, requireRole } from "@/lib/auth/server";
import { localMaterialSummaries, moderateLocalMaterial } from "@/lib/store";
export async function GET(req: Request) {
  return api(async () => {
    await requireRole("admin", req); const { db } = await getAuthContext(req);
    if (!db) return NextResponse.json(await localMaterialSummaries());
    const { data, error } = await db.rpc("admin_material_summaries");
    if (error) throw new HttpError(403, "Không tải được danh sách nội dung.");
    return NextResponse.json(data);
  }, req);
}
export async function PATCH(req: Request) {
  return api(async () => {
    const user = await requireRole("admin", req), { db } = await getAuthContext(req);
    const input = z.object({ id: z.string().uuid(), withdrawn: z.boolean(), reason: z.string().trim().min(3).max(500) }).strict().parse(await body(req, 2000));
    if (db) { const { error } = await db.rpc("admin_moderate_material", { material_id: input.id, withdrawn: input.withdrawn, reason: input.reason }); if (error) throw new HttpError(400, "Không cập nhật được trạng thái nội dung."); }
    else await moderateLocalMaterial(user.id, input.id, input.withdrawn, input.reason);
    return NextResponse.json({ ok: true });
  }, req);
}
