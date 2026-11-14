import { NextResponse } from "next/server";
import { z } from "zod";
import { api, body, HttpError } from "@/lib/http";
import { getAuthContext, requireRole } from "@/lib/auth/server";
import { changeLocalAccess, localAdminData } from "@/lib/auth/local";
export async function GET(req: Request) {
  return api(async () => {
    const user = await requireRole("admin", req), { db } = await getAuthContext(req);
    if (!db) return NextResponse.json(await localAdminData(user.id));
    const { data, error } = await db.rpc("admin_list_accounts");
    if (error) throw new HttpError(403, "Không tải được danh sách quản trị.");
    return NextResponse.json(data);
  }, req);
}
export async function PATCH(req: Request) {
  return api(async () => {
    const user = await requireRole("admin", req), { db } = await getAuthContext(req);
    const input = z.object({ id: z.string().uuid(), role: z.enum(["learner", "author", "admin"]), status: z.enum(["active", "suspended"]), quota: z.number().int().min(0).max(10000), canAuthor: z.boolean().default(false) }).strict().parse(await body(req, 2000));
    if (db) {
      const { error } = await db.rpc("admin_update_access", { target_user: input.id, new_role: input.role, new_status: input.status, new_quota: input.quota, new_can_author: input.canAuthor });
      if (error) throw new HttpError(error.message.includes("last_admin") ? 409 : 400, error.message.includes("last_admin") ? "Không thể vô hiệu hóa quản trị viên cuối cùng." : "Không cập nhật được quyền tài khoản.");
    } else await changeLocalAccess(user.id, input.id, input.role, input.status, input.quota, input.canAuthor);
    return NextResponse.json({ ok: true });
  }, req);
}
