import { NextResponse } from "next/server";
import { deleteCurriculum, getCurriculum, saveCurriculum } from "@/lib/curriculum-store";
import { api, body, isAuthor, requireAuthor, HttpError } from "@/lib/http";
import { requireOwner } from "@/lib/auth/server";

export const runtime = "nodejs";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const curriculum = await getCurriculum(id, new URL(req.url).searchParams.get("published") !== "1" && await isAuthor(req));
    if (!curriculum) throw new HttpError(404, "Không tìm thấy chương trình học");
    return NextResponse.json(curriculum);
  }, req);
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    await requireAuthor(req);
    const { id } = await context.params;
    const previous = await getCurriculum(id, true);
    if (!previous) throw new HttpError(404, "Không tìm thấy chương trình học");
    await requireOwner(previous.ownerId);
    const input = await body(req);
    if (input.id !== id) throw new HttpError(400, "ID chương trình không khớp");
    if (input.revision !== previous.revision)
      throw new HttpError(409, "Chương trình đã đổi ở nơi khác. Hãy tải lại bản mới nhất trước khi lưu.", "curriculum_revision_conflict");
    const saved = await saveCurriculum({
      ...input,
      status: input.status === "archived" ? "archived" : previous.status,
      ownerId: previous.ownerId,
      revision: previous.revision + 1,
      createdAt: previous.createdAt,
      updatedAt: new Date().toISOString(),
      publishedAt: previous.publishedAt,
    });
    return NextResponse.json(saved);
  }, req);
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    await requireAuthor(req);
    const { id } = await context.params;
    if (!(await getCurriculum(id, true))) throw new HttpError(404, "Không tìm thấy chương trình học");
    await deleteCurriculum(id);
    return NextResponse.json({ deleted: true });
  }, req);
}
