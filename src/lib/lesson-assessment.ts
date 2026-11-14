import { z } from "zod";
import { maxLessonCheckStudents, type LessonCheckStudent } from "./lesson-check-roster";

export const assessmentMaxQuestions = 20;
export const assessmentKinds = ["multiple", "true-false", "short", "written"] as const;
export const AssessmentQuestionSchema = z.object({
  kind: z.enum(assessmentKinds),
  prompt: z.string().trim().min(1).max(2500),
  options: z.array(z.string().trim().min(1).max(400)).max(4),
  answer: z.string().trim().min(1).max(1200),
  rubric: z.string().trim().max(1600),
  points: z.number().int().min(1).max(100),
}).strict().superRefine((question, context) => {
  const { kind, options, answer, rubric } = question;
  const valid = kind === "multiple" ? options.length === 4 && new Set(options).size === 4 && /^[ABCD]$/.test(answer)
    : kind === "true-false" ? options.length === 4 && new Set(options).size === 4 && /^[ĐS]( [ĐS]){3}$/.test(answer)
      : !options.length && (kind !== "written" || !!rubric);
  if (!valid) context.addIssue({ code: "custom", path: ["answer"], message: "Kiểm tra phương án, đáp án hoặc tiêu chí chấm." });
});
export const PublishAssessmentSchema = z.object({
  lessonId: z.string().uuid(),
  requestId: z.string().uuid(),
  title: z.string().trim().min(1).max(250),
  questions: z.array(AssessmentQuestionSchema).min(1).max(assessmentMaxQuestions),
  students: z.array(z.object({
    id: z.string().max(60), name: z.string().max(120), email: z.string().max(254),
  }).strict()).min(1).max(maxLessonCheckStudents),
}).strict();

export const ReviewGradeSchema = z.object({
  items: z.array(z.object({
    score: z.number().finite().min(0).max(100),
    feedback: z.string().trim().max(1200),
  }).strict()).min(1).max(assessmentMaxQuestions),
  feedback: z.string().trim().max(1800),
}).strict();

export type AssessmentQuestion = z.infer<typeof AssessmentQuestionSchema>;
export type ReviewGrade = z.infer<typeof ReviewGradeSchema>;
export type AssessmentSummary = { id: string; title: string; createdAt: string };
export type Assessment = AssessmentSummary & { ownerId: string; lessonId: string; questions: AssessmentQuestion[] };
export type StudentAssessment = {
  key: string;
  code: string;
  id: string;
  name: string;
  email: string;
  answers?: string[];
  submittedAt?: string;
  suggestion?: ReviewGrade;
  needsReview?: number[];
  grading?: { token: string; startedAt: number };
  gradeError?: boolean;
  review?: { grade: ReviewGrade; approved: boolean; version: string };
  delivery?: { token: string; firstAttempt: number; lastAttempt: number; sentAt?: string; error?: string; uncertain?: boolean; testOnly?: boolean };
};

export const normalizeAssessmentStudentId = (value: string) => value.trim().normalize("NFC").toLocaleLowerCase("vi");

export function assignAssessmentStudentIds(students: LessonCheckStudent[]) {
  const used = new Set(students.map((student) => normalizeAssessmentStudentId(student.id)));
  let sequence = 1;
  return students.map((student) => {
    if (student.id) return student;
    let id: string;
    do { id = `HS${String(sequence++).padStart(3, "0")}`; } while (used.has(normalizeAssessmentStudentId(id)));
    used.add(normalizeAssessmentStudentId(id));
    return { ...student, id };
  });
}

export function assessmentStudentId(student: Pick<StudentAssessment, "id" | "key">) {
  return student.id || `HS-${student.key.toUpperCase()}`;
}

export function assessmentTotal(grade: ReviewGrade) {
  return Math.round(grade.items.reduce((sum, item) => sum + item.score, 0) * 100) / 100;
}

export function publicAssessment(assessment: Assessment) {
  return { title: assessment.title, questions: assessment.questions.map(({ kind, prompt, options, points }) => ({ kind, prompt, options, points })) };
}
