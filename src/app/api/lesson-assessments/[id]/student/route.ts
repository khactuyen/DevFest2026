import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { api, body, HttpError } from "@/lib/http";
import { assessmentMaxQuestions, assessmentStudentId, normalizeAssessmentStudentId, publicAssessment } from "@/lib/lesson-assessment";
import { gradeAssessment } from "@/lib/lesson-assessment-grading";
import { findAssessmentStudent, getAssessment, updateAssessmentStudent } from "@/lib/lesson-assessment-store";

export const runtime = "nodejs";
export const maxDuration = 60;
const Code = z.string().trim().transform((value) => value.replace(/[\s-]+/g, "").toUpperCase()).pipe(z.string().regex(/^[A-F0-9]{16}$/));
const StudentId = z.string().trim().min(1, "Nhập mã học sinh.").max(60);
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), code: Code, studentId: StudentId }).strict(),
  z.object({ action: z.literal("submit"), code: Code, studentId: StudentId, answers: z.array(z.string().trim().max(2000)).max(assessmentMaxQuestions) }).strict(),
  z.object({ action: z.literal("result"), student: z.string().uuid(), token: z.string().regex(/^[\w-]{43}$/) }).strict(),
]);

export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const id = z.string().uuid().parse((await params).id);
    const input = Input.parse(await body(req));
    const assessment = await getAssessment(id);
    const denied = () => new HttpError(404, "Không tìm thấy phiếu hoặc mã nhập không khớp.");
    if (!assessment) throw denied();
    const student = input.action === "result" ? await findAssessmentStudent(id, "id", input.student)
      : await findAssessmentStudent(id, "code", input.code);
    if (!student) throw denied();
    const publicView = publicAssessment(assessment);
    const identity = { id: assessmentStudentId(student), name: student.name };
    if (input.action === "result") {
      if (!student.delivery?.sentAt || !student.review?.approved ||
        !timingSafeEqual(Buffer.from(student.delivery.token), Buffer.from(input.token))) throw denied();
      return NextResponse.json({ assessment: publicView, identity, answers: student.answers, grade: student.review.grade });
    }
    if (normalizeAssessmentStudentId(input.studentId) !== normalizeAssessmentStudentId(identity.id)) throw denied();
    if (input.action === "open") return NextResponse.json({ assessment: publicView, identity, submittedAt: student.submittedAt });
    const { answers } = input;
    if (answers.length !== assessment.questions.length ||
      answers.some((value, index) => value && (assessment.questions[index].kind === "multiple" && !/^[ABCD]$/.test(value) ||
        assessment.questions[index].kind === "true-false" && !/^[ĐS-]( [ĐS-]){3}$/.test(value)))) {
      throw new HttpError(400, "Bài làm không khớp với câu hỏi.");
    }
    const saved = await updateAssessmentStudent(id, student.key, (current) => {
      if (current.submittedAt) return;
      return { ...current, answers, submittedAt: new Date().toISOString() };
    });
    if (saved.changed) after(() => gradeAssessment(assessment, student.key).catch(() => {}));
    return NextResponse.json({ submittedAt: saved.student.submittedAt });
  }, req);
}
