import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "./app-error";
import type { Assessment } from "./lesson-assessment";
import { formatAssessmentEmail } from "./lesson-assessment-email-format";
import { updateAssessmentStudent } from "./lesson-assessment-store";

const lease = 30_000;
const retryWindow = 23 * 60 * 60 * 1000;
const endpoint = "https://api.resend.com/emails";

class MailError extends Error {
  constructor(message: string, readonly uncertain = false) { super(message); }
}

export function assessmentMailMode() {
  const key = process.env.RESEND_API_KEY?.trim();
  const sender = process.env.LESSON_ASSESSMENT_FROM_EMAIL?.trim();
  if (key && sender && (process.env.NODE_ENV !== "production" || process.env.APP_ORIGIN?.trim())) return "email";
  if (!key && !sender && process.env.NODE_ENV !== "production") return "local";
  return "unavailable";
}

export async function sendAssessmentResult(assessment: Assessment, studentKey: string, requestOrigin: string) {
  const mode = assessmentMailMode();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.LESSON_ASSESSMENT_FROM_EMAIL?.trim();
  const configuredOrigin = process.env.APP_ORIGIN;
  if (mode === "unavailable") {
    throw new AppError(503, "Cần cấu hình dịch vụ email và địa chỉ MathCos trước khi gửi.", "assessment_mail_unavailable");
  }
  const origin = new URL(configuredOrigin || requestOrigin).origin;
  const { student, changed } = await updateAssessmentStudent(assessment.id, studentKey, (current) => {
    if (!current.review?.approved || !current.email || current.delivery?.sentAt && !(mode === "email" && current.delivery.testOnly)) return;
    const previous = current.delivery;
    const now = Date.now();
    if (previous?.sentAt && previous.testOnly && mode === "email") {
      return { ...current, delivery: { token: previous.token, firstAttempt: now, lastAttempt: now } };
    }
    if (previous && now - previous.lastAttempt < lease && !previous.error) return;
    if (previous && now - previous.firstAttempt >= retryWindow && (!previous.error || previous.uncertain)) {
      throw new AppError(409, "Chưa rõ email lần trước đã gửi chưa. Hãy kiểm tra lịch sử gửi ở nhà cung cấp.", "assessment_mail_uncertain");
    }
    const delivery = previous && now - previous.firstAttempt < retryWindow ? previous :
      { token: randomBytes(32).toString("base64url"), firstAttempt: now, lastAttempt: now };
    const uncertain = delivery === previous && (!previous.error || previous.uncertain);
    return { ...current, delivery: { ...delivery, lastAttempt: now, error: undefined, uncertain } };
  });
  if (!changed || !student.delivery || !student.review) return student;
  const attempt = student.delivery;
  const link = `${origin}/phieu-kiem-tra/${assessment.id}#${student.key}.${attempt.token}`;
  const { subject, text } = formatAssessmentEmail(assessment, student, student.review.grade, link);
  let error: MailError | undefined;
  try {
    if (apiKey && from) {
      const response = await fetch(endpoint, {
        method: "POST", signal: AbortSignal.timeout(12_000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
          "Idempotency-Key": `lesson-assessment/${student.key}/${attempt.token}` },
        body: JSON.stringify({ from, to: [student.email], subject, text }),
      });
      if (!response.ok) throw new MailError(response.status === 429 ? "Dịch vụ email đang bận. Hãy thử gửi lại."
        : "Dịch vụ email chưa nhận thư. Kiểm tra cấu hình rồi thử lại.", response.status >= 500 || response.status === 409);
    } else {
      const directory = process.env.MATH_STUDIO_DATA_DIR || path.join(process.cwd(), "data");
      await fs.mkdir(directory, { recursive: true });
      await fs.appendFile(path.join(directory, "lesson-assessment-outbox.jsonl"),
        JSON.stringify({ to: student.email, link, text, id: student.key }) + "\n", { mode: 0o600 });
    }
  } catch (reason) {
    error = reason instanceof MailError ? reason : new MailError("Kết nối email bị gián đoạn. Có thể thử gửi lại.", true);
  }
  const saved = await updateAssessmentStudent(assessment.id, student.key, (current) => {
    if (current.delivery?.token !== attempt.token || current.delivery.lastAttempt !== attempt.lastAttempt) return;
    return { ...current, delivery: { ...attempt,
      ...(error ? { error: error.message, uncertain: error.uncertain || attempt.uncertain } : { sentAt: new Date().toISOString(), testOnly: mode === "local" }),
    } };
  });
  return saved.student;
}
