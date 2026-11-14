import { NextResponse } from "next/server";
import { attachMaterialToLesson, getCurriculum } from "@/lib/curriculum-store";
import { getMaterial } from "@/lib/store";
import { api, body, requireAuthor, HttpError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string; lessonId: string }> }) {
  return api(async () => {
    await requireAuthor(req);
    const { id, lessonId } = await context.params;
    if (!(await getCurriculum(id, true))) throw new HttpError(404, "Không tìm thấy chương trình học");
    const input = await body(req);
    if (typeof input.materialId !== "string" || !(await getMaterial(input.materialId)))
      throw new HttpError(400, "Học liệu liên kết không tồn tại");
    return NextResponse.json(await attachMaterialToLesson(id, lessonId, input.materialId));
  }, req);
}
