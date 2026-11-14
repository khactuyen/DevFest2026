import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/server";
import { api, body, HttpError } from "@/lib/http";
import { assignAssessmentStudentIds, PublishAssessmentSchema } from "@/lib/lesson-assessment";
import { assessmentHistory, createAssessment } from "@/lib/lesson-assessment-store";
import { validateStudents } from "@/lib/lesson-check-roster";

export const runtime = "nodejs";

export function GET(req: Request) {
  return api(async () => {
    const user = await requireUser(req);
    const lesson = z.string().uuid().parse(new URL(req.url).searchParams.get("lesson"));
    return NextResponse.json(await assessmentHistory(user.id, lesson));
  }, req);
}

export function POST(req: Request) {
  return api(async () => {
    const user = await requireUser(req);
    const { lessonId, requestId, title, questions, students } = PublishAssessmentSchema.parse(await body(req));
    let roster;
    try { roster = validateStudents(students); }
    catch (error) { throw new HttpError(400, (error as Error).message); }
    const assessment = await createAssessment({
      id: requestId, lessonId, ownerId: user.id, title, questions, createdAt: new Date().toISOString(),
    }, assignAssessmentStudentIds(roster));
    if (assessment.ownerId !== user.id || assessment.lessonId !== lessonId) throw new HttpError(409, "Mã tạo phiếu đã được sử dụng.");
    return NextResponse.json({ id: assessment.id }, { status: 201 });
  }, req);
}
