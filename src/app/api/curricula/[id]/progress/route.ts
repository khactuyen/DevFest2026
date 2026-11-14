import { NextResponse } from "next/server";
import { curriculumLessonList, isLessonUnlocked } from "@/lib/curriculum-contracts";
import { getCurriculum, getCurriculumMaterial, getCurriculumProgress, saveCurriculumProgress } from "@/lib/curriculum-store";
import { getMaterial } from "@/lib/store";
import { api, body, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";

export const runtime = "nodejs";

async function learnerId(req: Request) { return (await requireUser(req)).id; }

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    if (!(await getCurriculum(id, false))) throw new HttpError(404, "Không tìm thấy chương trình học");
    return NextResponse.json(await getCurriculumProgress(id, await learnerId(req)));
  }, req);
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await context.params;
    const curriculum = await getCurriculum(id, false);
    if (!curriculum) throw new HttpError(404, "Không tìm thấy chương trình học");
    const input = await body(req);
    if (typeof input.lessonId !== "string") throw new HttpError(400, "Thiếu bài học");
    const record = curriculumLessonList(curriculum).find((item) => item.lesson.id === input.lessonId);
    if (!record || !record.lesson.materialId) throw new HttpError(404, "Không tìm thấy bài học");
    const material = await getCurriculumMaterial(id, input.lessonId);
    if (!material || material.status !== "published") throw new HttpError(400, "Học liệu chưa sẵn sàng");
    const rawStepIds: unknown[] = Array.isArray(input.completedStepIds)
      ? input.completedStepIds
      : [];
    const requested = rawStepIds.filter(
      (stepId): stepId is string => typeof stepId === "string",
    );
    const validStepIds = new Set(material.learningSteps.map((step) => step.id));
    if (requested.some((stepId: string) => !validStepIds.has(stepId)))
      throw new HttpError(400, "Bước học tập không thuộc bài học này");
    const idForLearner = await learnerId(req);
    const current = await getCurriculumProgress(id, idForLearner);
    const completedLessonIds = new Set(
      current.lessons.filter((lesson) => lesson.completedAt).map((lesson) => lesson.lessonId),
    );
    if (!isLessonUnlocked(curriculum, input.lessonId, completedLessonIds))
      throw new HttpError(403, "Bài học này chưa được mở khóa");
    const now = new Date().toISOString();
    const completedStepSet = new Set(requested);
    const allStepsDone = material.learningSteps.length > 0 && material.learningSteps.every(step => completedStepSet.has(step.id));
    const completed = record.lesson.completionRule.type === "open"
      ? true
      : allStepsDone;
    const next = {
      ...current,
      updatedAt: now,
      lessons: [
        ...current.lessons.filter((lesson) => lesson.lessonId !== input.lessonId),
        {
          lessonId: input.lessonId,
          completedStepIds: [...new Set(requested)],
          lastOpenedAt: now,
          completedAt: completed ? now : current.lessons.find((lesson) => lesson.lessonId === input.lessonId)?.completedAt || null,
        },
      ],
    };
    return NextResponse.json(await saveCurriculumProgress(next));
  }, req);
}
