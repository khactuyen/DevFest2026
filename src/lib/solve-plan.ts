import { extendedProblem } from "./solve-extended";
import { recurrenceProblem } from "./solve-recurrence";
import { createHash } from "node:crypto";
import { AppError } from "./app-error";
import { analyzeSolveProblem, calculateConstantAnswer } from "./solve-engine";
import { analyzeGuidedProblem } from "./solve-guided";
import { GuidedProblemSchema } from "./solve-guided-contracts";
import { recommendSolveMethods } from "./gemini-decisions";
import {
  detectQuestionType,
  questionAssessment,
  type QuestionPreference,
} from "./solve-question";
import {
  normalizeSolveSource,
  unresolvedSourceMarks,
  type SourceReview,
} from "./solve-source";
import type { SolveFigureInput } from "./solve-figure-context";

export async function prepareSolvePlan(
  source: string,
  preference: QuestionPreference,
  review: SourceReview | undefined,
  signal?: AbortSignal,
  figure?: SolveFigureInput,
) {
  const prompt = normalizeSolveSource(source);
  if (unresolvedSourceMarks(prompt).length)
    throw new AppError(
      422,
      "Đề còn ký hiệu không đọc được. Hãy sửa đúng chỗ được đánh dấu trước khi xử lý.",
      "solve_source_unclear",
    );
  if (
    (review?.needsReview ||
      review?.ambiguities.length ||
      figure?.ambiguities.length) &&
    !review?.confirmed
  )
    throw new AppError(
      422,
      "Hãy đối chiếu và xác nhận các dữ kiện chưa rõ trước khi giải.",
      "solve_source_unconfirmed",
    );
  const type =
    preference === "auto" ? detectQuestionType(prompt) : preference;
  if (!type)
    throw new AppError(
      422,
      "Chưa rõ loại câu hỏi. Hãy chọn Tự luận, Trắc nghiệm, Đúng/Sai hoặc Trả lời ngắn.",
      "solve_question_unclear",
    );
  const assessment = questionAssessment(prompt, type);
  if (
    (type === "multiple_choice" || type === "true_false") &&
    !assessment.stem.trim()
  )
    throw new AppError(
      422,
      "Chưa có phần dẫn hoặc giả thiết chung. Hãy bổ sung trước các phương án/mệnh đề.",
      "solve_source_unclear",
    );
  if (type === "multiple_choice" || type === "true_false")
    return {
      prompt,
      type,
      ...(await recommendSolveMethods(prompt, type, signal, figure)),
    };
  const recurrence = recurrenceProblem(prompt, type);
  if (recurrence) return { prompt, type, problem: recurrence, cached: false };
  try {
    return {
      prompt,
      type,
      problem: analyzeSolveProblem(prompt),
      cached: false,
    };
  } catch {
    /* use the broader reasoning path */
  }
  const extended = extendedProblem(prompt, type);
  if (extended) return { prompt, type, problem: extended, cached: false };
  let direct = false;
  try {
    calculateConstantAnswer(prompt);
    direct = true;
  } catch {
    /* Unsupported expressions still require an explicit reasoning request. */
  }
  if (type === "short_answer" || direct) {
    const problem = GuidedProblemSchema.parse({
      kind: "ai",
      ...(direct ? { directSolver: "arithmetic" } : {}),
      sourcePrompt: prompt,
      assessment,
      topic: direct ? "Biểu thức số" : "Trả lời ngắn",
      summary: direct
        ? "Biểu thức có thể tính và kiểm tra trực tiếp."
        : "Tạo đáp án ngắn từ đề, kèm điều kiện và phép kiểm tra trong phạm vi có thể.",
      givens: [],
      goals: [
        "Tìm đáp án ngắn cho yêu cầu trong đề, nêu điều kiện và kiểm tra kết quả.",
      ],
      status: "ready",
      warnings: [],
      methods: [
        {
          id: "ai-0",
          label: direct ? "Tính trực tiếp" : "Tính đáp án và kiểm tra",
          description: direct
            ? "Tính bằng số học phân số chính xác, không gọi LLM."
            : "Bộ giải hoặc LLM tính đáp án từ đề gốc; kết quả ghi rõ phạm vi đã kiểm tra.",
          coversGoals: [0],
        },
      ],
      ...(figure
        ? {
            figureContext: {
              description: figure.description,
              ambiguities: figure.ambiguities,
              imageProvided: !!figure.imageDataUrl,
              ...(figure.imageDataUrl
                ? {
                    imageDigest: createHash("sha256")
                      .update(figure.imageDataUrl)
                      .digest("hex"),
                  }
                : {}),
            },
          }
        : {}),
    });
    return { prompt, type, problem, cached: false };
  }
  const problem = await analyzeGuidedProblem(prompt, signal, "essay", figure);
  const critical =
    problem.reviewIssues?.filter(
      (issue) =>
        ["ambiguity", "missing"].includes(issue.kind) &&
        issue.evidence &&
        issue.neededFor &&
        issue.impact,
    ) || [];
  return {
    prompt,
    type,
    problem: critical.length
      ? GuidedProblemSchema.parse({
          ...problem,
          status: "needs_review",
          warnings: [
            ...new Set([
              ...problem.warnings,
              ...critical.map((issue) => issue.detail),
            ]),
          ].slice(0, 8),
        })
      : problem,
    cached: false,
  };
}
