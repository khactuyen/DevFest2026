import { assessmentTotal, type Assessment, type ReviewGrade } from "./lesson-assessment";

export function formatAssessmentEmail(
  assessment: Pick<Assessment, "title" | "questions">,
  student: { name: string; id: string },
  grade: ReviewGrade,
  link: string,
) {
  const total = assessment.questions.reduce((sum, question) => sum + question.points, 0);
  return {
    subject: `Kết quả phiếu · ${assessment.title.replace(/[\r\n]/g, " ")}`,
    text: [
      `Chào ${student.name || student.id},`,
      `Giáo viên đã duyệt kết quả phiếu “${assessment.title}”.`,
      `Điểm ${assessmentTotal(grade)}/${total}`,
      grade.feedback,
      `Xem điểm và nhận xét từng câu: ${link}`,
    ].filter(Boolean).join("\n\n"),
  };
}
