import { NextResponse } from "next/server";
import { curriculumLessonList } from "@/lib/curriculum-contracts";
import { getCurriculum, saveCurriculum } from "@/lib/curriculum-store";
import { getMaterial } from "@/lib/store";
import { api, requireAuthor, HttpError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    await requireAuthor(req);
    const { id } = await context.params;
    const curriculum = await getCurriculum(id, true);
    if (!curriculum) throw new HttpError(404, "Không tìm thấy chương trình học");
    if (!curriculum.courses.length) throw new HttpError(400, "Chương trình cần ít nhất một khóa học");
    const lessons = curriculumLessonList(curriculum);
    if (!lessons.length) throw new HttpError(400, "Chương trình cần ít nhất một bài học");
    for (const { lesson } of lessons) {
      if (!lesson.materialId) throw new HttpError(400, `Bài “${lesson.title}” chưa có học liệu`);
      const material = await getMaterial(lesson.materialId, { publishedOnly: true });
      if (!material || material.status !== "published" || material.visibility !== "public")
        throw new HttpError(400, `Học liệu của bài “${lesson.title}” chưa được xuất bản`);
    }
    const now = new Date().toISOString();
    const published = await saveCurriculum({
      ...curriculum,
      status: "published",
      revision: curriculum.revision + 1,
      updatedAt: now,
      publishedAt: now,
    }, "publish");
    return NextResponse.json(published);
  }, req);
}
