import { NextResponse } from "next/server";
import { getMaterial, saveMaterial, deleteMaterial } from "@/lib/store";
import { api, body, HttpError } from "@/lib/http";
import { publicMaterial } from "@/lib/public-material";
import { shareCookieName } from "@/lib/store";
import { getAuthContext, requireOwner, requireUser } from "@/lib/auth/server";
import { ownsMaterial } from "@/lib/auth/types";
import { retainMaterialReview } from "@/lib/material-publish";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  return api(async () => {
    const query = new URL(req.url).searchParams;
    const token = query.get("share") || undefined;
    const m = await getMaterial((await params).id, { token, edit: query.get("edit") === "1", publishedOnly: query.get("published") === "1" });
    if (!m)
      throw new HttpError(404, "Không tìm thấy tài liệu");
    const { user } = await getAuthContext(req);
    const response = NextResponse.json(ownsMaterial(user, m.ownerId) ? m : publicMaterial(m));
    if (token && /^[\w-]{40,100}$/.test(token)) response.cookies.set(shareCookieName(m.id), token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 86400 });
    return response;
  }, req);
}
export async function PATCH(req: Request, { params }: Context) {
  return api(async () => {
    await requireUser(req);
    const m = await getMaterial((await params).id, { edit: true });
    if (!m) throw new HttpError(404, "Không tìm thấy tài liệu");
    await requireOwner(m.ownerId);
    const raw = await body(req);
    if (!raw || typeof raw !== "object" || raw.revision !== m.revision)
      throw new HttpError(409, "Học liệu đã thay đổi ở nơi khác. Tải lại trước khi tiếp tục.", "material_revision_conflict");
    return NextResponse.json(
      await saveMaterial(retainMaterialReview(m, {
        ...m,
        ...raw,
        id: m.id,
        ownerId: m.ownerId,
        status: m.status,
        slug: m.slug,
        createdAt: m.createdAt,
        publishedAt: m.publishedAt,
        revision: m.revision + 1,
        updatedAt: new Date().toISOString(),
      }), m.revision),
    );
  }, req);
}
export async function DELETE(req: Request, { params }: Context) {
  return api(async () => {
    await requireUser(req);
    const value = new URL(req.url).searchParams.get("draftRevision");
    const revision = value === null ? undefined : Number(value);
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1))
      throw new HttpError(400, "Phiên bản bản nháp không hợp lệ.");
    await deleteMaterial((await params).id, revision);
    return NextResponse.json({ deleted: true });
  }, req);
}
