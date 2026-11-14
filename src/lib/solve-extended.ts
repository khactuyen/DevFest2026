import { analyzeExtended } from "./exact-solver";
import {
  GuidedProblemSchema,
  GuidedSolutionSchema,
  type GuidedProblem,
} from "./solve-guided-contracts";
import { questionAssessment } from "./solve-question";
import type { SolveMode } from "./solve-mode";

export function extendedProblem(
  prompt: string,
  type: "essay" | "short_answer",
): GuidedProblem | null {
  const r = analyzeExtended(prompt);
  if (!r) return null;
  return GuidedProblemSchema.parse({
    kind: "ai",
    directSolver: "extended",
    sourcePrompt: prompt,
    assessment: questionAssessment(prompt, type),
    topic: r.topic,
    summary:
      "Bài thuộc bộ giải mở rộng: tính và kiểm tra trực tiếp; AI chỉ giải thích khi người học yêu cầu.",
    givens: [r.domain],
    goals: ["Giải đầy đủ yêu cầu trong đề và kiểm tra kết quả."],
    warnings: [],
    status: "ready",
    methods: r.methods.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      coversGoals: [0],
    })),
  });
}
export function solveExtended(
  prompt: string,
  problem: GuidedProblem,
  method: string,
  solveMode: SolveMode,
) {
  const r = analyzeExtended(prompt);
  if (!r) return null;
  const selected = r.methods.find((m) => m.id === method);
  if (!selected) return null;
  const steps = [
    ...selected.steps,
    { title: "Trạng thái kiểm chứng", content: r.checks.join("\n") },
  ];
  return GuidedSolutionSchema.parse({
    kind: "ai",
    origin: "solver",
    problem,
    method,
    solveMode,
    answer: r.answer,
    steps: steps.map((step, i) => ({
      ...step,
      id: `ai-step-${i}`,
      hint: "Đối chiếu điều kiện và công thức đang được dùng với đề gốc.",
      explanation:
        "Bước được dựng từ quy tắc của bộ giải trực tiếp. Có thể yêu cầu AI giải thích thêm khi cần.",
      targets: [],
      completesGoals: i === steps.length - 1 ? [0] : [],
    })),
    resultKind: "complete",
    assumptions: [],
    unresolvedGoals: [],
    warning: "",
    visual: null,
    visualWarning:
      "Bộ giải đang kiểm tra bằng biểu thức và các phép tính chính xác; không tự tạo hình minh họa.",
    verification:
      "Đáp án được tính và kiểm tra bằng bộ giải xác định trong phạm vi hỗ trợ.",
    resultReview: {
      source: "solver",
      status: "answer_verified",
      summary: `Bộ giải trực tiếp: ${r.topic}. Điều kiện nguồn và các quy tắc xác minh đã được kiểm tra.`,
      checks: [
        {
          itemId: "answer",
          status: "verified",
          detail: r.checks.join(" ").slice(0, 1200),
        },
      ],
      disputes: [],
      unresolvedItems: [],
    },
  });
}
