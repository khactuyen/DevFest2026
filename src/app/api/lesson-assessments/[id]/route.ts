import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/server";
import { api, body, HttpError } from "@/lib/http";
import { assessmentStudentId, ReviewGradeSchema, type StudentAssessment } from "@/lib/lesson-assessment";
import { assessmentMailMode, sendAssessmentResult } from "@/lib/lesson-assessment-email";
import { gradeAssessment } from "@/lib/lesson-assessment-grading";
import { getAssessment, listAssessmentStudents, updateAssessmentStudent } from "@/lib/lesson-assessment-store";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
const uuid = z.string().uuid();
const key = { student: uuid };
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review"), ...key, grade: ReviewGradeSchema, approved: z.boolean(), version: uuid.nullable() }).strict(),
  z.object({ action: z.literal("approve-ready") }).strict(),
  z.object({ action: z.literal("grade"), ...key }).strict(),
  z.object({ action: z.literal("email"), ...key, email: z.union([z.string().trim().email().max(254), z.literal("")]) }).strict(),
  z.object({ action: z.literal("send"), ...key }).strict(),
]);

async function ownAssessment(req: Request, context: Context) {
  const user = await requireUser(req);
  const assessment = await getAssessment(uuid.parse((await context.params).id));
  if (!assessment || assessment.ownerId !== user.id) throw new HttpError(404, "Không tìm thấy đợt kiểm tra.");
  return assessment;
}

function teacherStudent({ delivery, grading, ...student }: StudentAssessment) {
  return { ...student, id: assessmentStudentId(student), grading: Boolean(grading && Date.now() - grading.startedAt < 120_000),
    delivery: delivery ? { sentAt: delivery.sentAt, error: delivery.error, uncertain: delivery.uncertain, testOnly: delivery.testOnly } : undefined };
}

export function GET(req: Request, context: Context) {
  return api(async () => {
    const { ownerId: _, ...assessment } = await ownAssessment(req, context);
    const students = await listAssessmentStudents(assessment.id);
    return NextResponse.json({ assessment, students: students.map(teacherStudent),
      mailMode: assessmentMailMode(),
    });
  }, req);
}

export function POST(req: Request, context: Context) {
  return api(async () => {
    const assessment = await ownAssessment(req, context);
    const input = Action.parse(await body(req, 60_000));
    if (input.action === "approve-ready") {
      const students = await listAssessmentStudents(assessment.id);
      let approved = 0;
      for (const student of students.filter((row) => row.suggestion && !row.needsReview?.length && !row.review && !row.grading)) {
        const { changed } = await updateAssessmentStudent(assessment.id, student.key, (current) => {
          if (!current.suggestion || current.needsReview?.length || current.review || current.grading) return;
          return { ...current, review: { grade: current.suggestion, approved: true, version: randomUUID() } };
        });
        if (changed) approved++;
      }
      return NextResponse.json({ approved });
    }
    if (input.action === "grade") {
      // Only the owner can request a new AI grading pass.
      after(() => gradeAssessment(assessment, input.student, true).catch(() => {}));
      return NextResponse.json({ ok: true }, { status: 202 });
    }
    if (input.action === "send") {
      const student = await sendAssessmentResult(assessment, input.student, new URL(req.url).origin);
      return NextResponse.json(teacherStudent(student));
    }
    if (input.action === "review" && (input.grade.items.length !== assessment.questions.length ||
      input.grade.items.some((item, index) => item.score > assessment.questions[index].points))) {
      throw new HttpError(400, "Điểm từng câu phải nằm trong thang điểm của phiếu.");
    }
    const { student } = await updateAssessmentStudent(assessment.id, input.student, (current) => {
      if (current.delivery && !current.delivery.testOnly && (!current.delivery.error || current.delivery.uncertain)) {
        throw new HttpError(409, "Phiếu đã bắt đầu gửi. Nội dung đánh giá và email đã được khóa.");
      }
      if (input.action === "email") return { ...current, delivery: undefined, email: input.email.toLowerCase() };
      if (!current.answers) throw new HttpError(409, "Học sinh chưa nộp bài.");
      if ((current.review?.version ?? null) !== input.version) throw new HttpError(409, "Bài vừa được cập nhật. Tải lại trước khi lưu.");
      return { ...current, delivery: undefined, grading: undefined, review: { grade: input.grade, approved: input.approved, version: randomUUID() } };
    });
    return NextResponse.json(teacherStudent(student));
  }, req);
}
