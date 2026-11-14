import { z } from "zod";
import { SolveResultReviewSchema } from "./solve-result-review";
import { SolveRecommendationSchema } from "./solve-recommendation";
import { SolveModeSchema } from "./solve-mode";
import { ThreeVisualSpecSchema, TwoDVisualSpecSchema } from "./contracts";
import {
  AssessmentSchema,
  ItemConclusionSchema,
  assessmentResultIssues,
  assessmentAnswer,
  questionAssessment,
  isChoiceAssessment,
} from "./solve-question";
import {
  canAttemptSolve,
  SolveReviewIssuesSchema,
  SolveResultKindSchema,
} from "./solve-review";
import { SolveFigureContextSchema } from "./solve-figure-context";

export const GuidedMethodSchema = z
  .object({
    id: z.string().regex(/^ai-[0-3]$/),
    label: z.string().trim().min(2).max(100),
    description: z.string().trim().min(5).max(350),
    plan: z.array(z.string().trim().min(5).max(300)).min(1).max(8).optional(),
    coversGoals: z
      .array(z.number().int().min(0).max(7))
      .min(1)
      .max(8)
      .optional(),
  })
  .strict();

export const GuidedProblemSchema = z
  .object({
    kind: z.literal("ai"),
    directSolver: z.enum(["recurrence", "arithmetic", "extended"]).optional(),
    recommendation: SolveRecommendationSchema.optional(),
    sourcePrompt: z.string().trim().min(1).max(8000).optional(),
    assessment: AssessmentSchema.optional(),
    figureContext: SolveFigureContextSchema.optional(),
    topic: z.string().trim().min(2).max(120),
    summary: z.string().trim().min(5).max(700),
    givens: z.array(z.string().trim().min(1).max(300)).max(12),
    goals: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
    warnings: z.array(z.string().trim().min(1).max(500)).max(8),
    status: z.enum(["ready", "caution", "needs_review", "contradictory"]),
    reviewIssues: SolveReviewIssuesSchema.optional(),
    methods: z.array(GuidedMethodSchema).max(4),
  })
  .strict()
  .superRefine((problem, ctx) => {
    if (problem.assessment && problem.sourcePrompt) {
      try {
        if (
          JSON.stringify(problem.assessment) !==
          JSON.stringify(
            questionAssessment(problem.sourcePrompt, problem.assessment.type),
          )
        )
          throw Error();
        if (
          problem.assessment.type === "true_false" &&
          problem.goals.length !== problem.assessment.items.length
        )
          throw Error();
        if (
          problem.assessment.type === "multiple_choice" &&
          problem.goals.length !== 1
        )
          throw Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["assessment"],
          message: "Loại câu hỏi, lựa chọn hoặc mệnh đề không khớp nguồn đề.",
        });
      }
    }
    if (canAttemptSolve(problem) && !problem.methods.length)
      ctx.addIssue({
        code: "custom",
        path: ["methods"],
        message: "Đề sẵn sàng cần ít nhất một cách giải.",
      });
    if (
      new Set(problem.methods.map((m) => m.id)).size !== problem.methods.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["methods"],
        message: "ID phương pháp phải khác nhau.",
      });
    for (const method of problem.methods) {
      if (
        method.coversGoals &&
        (method.coversGoals.some((g) => g >= problem.goals.length) ||
          new Set(method.coversGoals).size !== problem.goals.length)
      )
        ctx.addIssue({
          code: "custom",
          path: ["methods"],
          message: "Cách giải cần kế hoạch cho toàn bộ yêu cầu.",
        });
    }
  });
export type GuidedProblem = z.infer<typeof GuidedProblemSchema>;

export const GuidedStepSchema = z
  .object({
    id: z.string().regex(/^ai-step-[0-9]+$/),
    title: z.string().trim().min(2).max(140),
    content: z.string().trim().min(5).max(6000),
    hint: z.string().trim().min(2).max(900),
    explanation: z.string().trim().min(2).max(2000),
    targets: z.array(z.string()).max(0),
    completesGoals: z.array(z.number().int().min(0).max(7)).max(8).optional(),
  })
  .strict();

export const GuidedSolutionSchema = z
  .object({
    kind: z.literal("ai"),
    problem: GuidedProblemSchema,
    method: z.string().regex(/^ai-[0-3]$/),
    solveMode: SolveModeSchema.default("standard"),
    origin: z.enum(["gemini-decision", "jev", "llm", "solver"]).optional(),
    resultReview: SolveResultReviewSchema.optional(),
    geminiVerified: z.literal(true).optional(),
    steps: z.array(GuidedStepSchema).min(1).max(30),
    answer: z.string().trim().min(1).max(4000),
    itemConclusions: z.array(ItemConclusionSchema).max(8).optional(),
    warning: z.string().trim().max(500).default(""),
    resultKind: SolveResultKindSchema.default("complete"),
    assumptions: z.array(z.string().trim().min(5).max(500)).max(8).default([]),
    unresolvedGoals: z.array(z.number().int().min(0).max(7)).max(8).default([]),
    reviewIssues: SolveReviewIssuesSchema.optional(),
    verification: z.enum([
      "Lời giải do AI đề xuất; chưa được bộ giải toán xác định kiểm chứng.",
      "Đáp án được tính và kiểm tra bằng bộ giải xác định trong phạm vi hỗ trợ.",
    ]),
    visual: TwoDVisualSpecSchema.nullable(),
    visual3d: ThreeVisualSpecSchema.nullable().optional(),
    visualWarning: z.string().trim().min(1).max(300),
    quality: z
      .object({
        version: z.literal(1),
        numericChecks: z.number().int().min(0).max(360),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((solution, ctx) => {
    if (solution.geminiVerified && (
      solution.solveMode !== "detailed" ||
      solution.origin !== "llm" ||
      solution.resultKind !== "complete" ||
      solution.assumptions.length > 0 ||
      solution.unresolvedGoals.length > 0 ||
      solution.resultReview?.unresolvedItems.length
    )) {
      ctx.addIssue({
        code: "custom",
        path: ["geminiVerified"],
        message: "Chỉ ghi nhận kiểm chứng Gemini cho lời giải chuyên sâu đã hoàn tất.",
      });
    }
    if (
      isChoiceAssessment(solution.problem.assessment) &&
      solution.resultKind === "conditional"
    )
      ctx.addIssue({
        code: "custom",
        path: ["resultKind"],
        message:
          "Đáp án lựa chọn/đúng sai phải đủ kết luận, không chọn theo giả định chưa có trong đề.",
      });
    for (const message of assessmentResultIssues(
      solution.problem.assessment,
      solution.itemConclusions,
      solution.resultKind === "partial",
    ))
      ctx.addIssue({ code: "custom", path: ["itemConclusions"], message });
    if (
      isChoiceAssessment(solution.problem.assessment) &&
      solution.itemConclusions &&
      solution.itemConclusions.length > 0 &&
      solution.answer !==
        assessmentAnswer(solution.problem.assessment, solution.itemConclusions)
    )
      ctx.addIssue({
        code: "custom",
        path: ["answer"],
        message: "Kết luận không khớp đáp án/mệnh đề đã đánh giá.",
      });
    if (solution.solveMode === "standard" && solution.steps.length > 12)
      ctx.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Giải chuẩn tối đa 12 bước.",
      });
    if (
      !canAttemptSolve(solution.problem) ||
      !solution.problem.methods.some((m) => m.id === solution.method)
    )
      ctx.addIssue({
        code: "custom",
        path: ["problem"],
        message: "Lời giải cần đề sẵn sàng và phương pháp hợp lệ.",
      });
    if (new Set(solution.steps.map((s) => s.id)).size !== solution.steps.length)
      ctx.addIssue({
        code: "custom",
        path: ["steps"],
        message: "ID bước phải khác nhau.",
      });
    if (
      solution.resultKind === "conditional"
        ? !solution.assumptions.length
        : solution.assumptions.length > 0
    )
      ctx.addIssue({
        code: "custom",
        path: ["assumptions"],
        message:
          "Lời giải có điều kiện phải ghi rõ giả định; không giấu giả định trong đáp án đầy đủ.",
      });
    if (
      solution.resultKind === "partial"
        ? !solution.unresolvedGoals.length
        : solution.unresolvedGoals.length > 0
    )
      ctx.addIssue({
        code: "custom",
        path: ["unresolvedGoals"],
        message: "Kết quả một phần phải chỉ rõ yêu cầu chưa kết luận.",
      });
    if (
      solution.reviewIssues?.some(
        (issue) =>
          issue.kind === "contradiction" &&
          issue.evidence &&
          issue.neededFor &&
          issue.impact,
      ) ||
      (solution.resultKind === "complete" &&
        solution.reviewIssues?.some((issue) => issue.kind !== "advisory"))
    )
      ctx.addIssue({
        code: "custom",
        path: ["reviewIssues"],
        message: "Kết quả không khớp vấn đề còn tồn tại trong dữ kiện.",
      });
    if (solution.quality || solution.resultKind !== "complete") {
      const goals = new Set(
        solution.steps.flatMap((s) => s.completesGoals ?? []),
      );
      const unresolved = solution.unresolvedGoals;
      if (
        new Set([...goals, ...unresolved]).size !==
          solution.problem.goals.length ||
        unresolved.some(
          (g) => goals.has(g) || g >= solution.problem.goals.length,
        ) ||
        new Set(unresolved).size !== unresolved.length ||
        [...goals].some((g) => g >= solution.problem.goals.length)
      )
        ctx.addIssue({
          code: "custom",
          path: ["steps"],
          message: "Thiếu bước kết luận cho yêu cầu của đề.",
        });
    }
  });
export type GuidedSolution = z.infer<typeof GuidedSolutionSchema>;

export function assertGuidedSource(prompt: string, problem: GuidedProblem) {
  if (!problem.sourcePrompt || problem.sourcePrompt !== prompt.trim())
    throw Error(
      "Phân tích không khớp nguồn đề. Hãy phân tích lại đề trước khi tiếp tục.",
    );
}

export function isGuidedProblem(value: unknown): value is GuidedProblem {
  return Boolean(
    value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "ai",
  );
}
export function isGuidedSolution(value: unknown): value is GuidedSolution {
  return Boolean(
    value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "ai",
  );
}
