import { extendedProblem } from "./solve-extended";
import { recurrenceProblem } from "./solve-recurrence";
import { directSolverFor } from "./solve-recurrence";
import { assertSupportedVerification } from "./solve-answer-checks";
import { z } from "zod";
import { SolveRecommendationSchema } from "./solve-recommendation";
import { SolveModeSchema } from "./solve-mode";
import { QuestionPreferenceSchema } from "./solve-question";
import { SolveFigureInputSchema } from "./solve-figure-context";
import { analyzeSolveProblem, solveProblem } from "./solve-engine";
import { validateVisual } from "./validation";
import {
  HandwritingDraftSchema,
  HandwritingUndoSchema,
} from "./handwriting-draft";
import {
  GuidedProblemSchema,
  GuidedSolutionSchema,
  assertGuidedSource,
} from "./solve-guided-contracts";

export const SolveMethodSchema = z.enum([
  "formula",
  "square",
  "isolate",
  "sign-chart",
]);
export const SolveRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(8000),
    method: SolveMethodSchema.optional(),
    solveMode: SolveModeSchema.default("standard"),
    questionType: QuestionPreferenceSchema.default("auto"),
    figure: SolveFigureInputSchema.optional(),
  })
  .strict();
export const SolveSessionSchema = z
  .object({
    id: z.string().uuid(),
    ownerKey: z.string().regex(/^[a-zA-Z][\w-]{0,63}$/),
    revision: z.number().int().min(0),
    title: z.string().max(200),
    prompt: z.string().max(8000),
    phase: z.enum(["input", "review", "solution"]),
    questionType: QuestionPreferenceSchema.default("auto"),
    solveMode: SolveModeSchema.default("standard"),
    method: SolveMethodSchema.nullable(),
    recommendation: SolveRecommendationSchema.optional(),
    guidedProblem: GuidedProblemSchema.nullable().optional(),
    guidedSolution: GuidedSolutionSchema.nullable().optional(),
    visualOpen: z.boolean().optional(),
    visualDimension: z.enum(["2d", "3d"]).optional(),
    visualSurfaceFill: z.boolean().optional(),
    legacyUnbound: z.boolean().optional(),
    handwritingDraft: HandwritingDraftSchema.optional(),
    handwritingUndo: HandwritingUndoSchema.optional(),
    retainedSolutions: z
      .array(
        z
          .object({
            solveMode: SolveModeSchema.default("standard"),
            outcomeMode: z.enum(["quick", "deep"]).optional(),
            method: SolveMethodSchema.nullable(),
            guidedProblem: GuidedProblemSchema.nullable(),
            guidedSolution: GuidedSolutionSchema.nullable(),
            activeStep: z.number().int().min(0).max(29),
            showAll: z.boolean(),
            messages: z
              .array(
                z
                  .object({
                    question: z.string().max(1000),
                    answer: z.string().max(7000),
                    step: z.number().int().min(0).max(29),
                  })
                  .strict(),
              )
              .max(8),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    activeStep: z.number().int().min(0).max(29),
    showAll: z.boolean(),
    messages: z
      .array(
        z
          .object({
            question: z.string().max(1000),
            answer: z.string().max(7000),
            step: z.number().int().min(0).max(29),
          })
          .strict(),
      )
      .max(8),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type SolveSession = z.infer<typeof SolveSessionSchema>;
export function validateSolveSession(raw: unknown): SolveSession {
  const session = SolveSessionSchema.parse(raw);
  const methods = new Set<string>();
  for (const cached of session.retainedSolutions || []) {
    const method = cached.guidedSolution?.method || cached.method;
    const key = `${cached.solveMode}:${method}:${cached.outcomeMode || "deep"}`;
    if (!method || methods.has(key))
      throw Error("Phương pháp lưu tạm trùng hoặc thiếu.");
    methods.add(key);
    const { outcomeMode: _outcomeMode, ...cachedValues } = cached;
    validateSolveSession({
      ...session,
      ...cachedValues,
      phase: "solution",
      legacyUnbound: false,
      retainedSolutions: undefined,
    });
  }
  if (session.guidedProblem) {
    if (
      session.questionType !== "auto" &&
      session.guidedProblem.assessment &&
      session.questionType !== session.guidedProblem.assessment.type
    )
      throw Error("Loại câu hỏi đã chọn không khớp phân tích lưu trong phiên.");
    if (session.legacyUnbound && session.phase !== "review")
      throw Error("Phiên cũ cần phân tích lại trước khi giải.");
    assertGuidedSource(session.prompt, session.guidedProblem);
    if (session.phase === "input" || session.method)
      throw Error("Phiên AI có giai đoạn hoặc phương pháp không hợp lệ.");
    if (session.phase === "solution") {
      const result = session.guidedSolution;
      if (
        !result ||
        result.solveMode !== session.solveMode ||
        result.method !==
          session.guidedProblem.methods.find((m) => m.id === result.method)
            ?.id ||
        JSON.stringify(result.problem) !==
          JSON.stringify(session.guidedProblem) ||
        session.activeStep >= result.steps.length ||
        session.messages.some((m) => m.step >= result.steps.length)
      )
        throw Error("Lời giải AI không khớp đề, phương pháp hoặc bước đã lưu.");
      assertSupportedVerification(result);
      if (result.visual) validateVisual(result.visual);
      if (result.visual3d) {
        if (!result.visual)
          throw Error("Mô hình 3D thiếu hình chiếu nguồn của lời giải.");
        validateVisual(result.visual3d);
      }
    } else if (
      session.guidedSolution ||
      session.activeStep ||
      session.showAll ||
      session.messages.length
    )
      throw Error("Đề AI chưa giải không được chứa lời giải cũ.");
    return session;
  }
  if (session.guidedSolution)
    throw Error("Lời giải AI thiếu bản phân tích đề.");
  if (session.phase !== "input") analyzeSolveProblem(session.prompt);
  if (session.phase === "solution") {
    if (!session.method) throw Error("Phiên lời giải thiếu phương pháp.");
    const result = solveProblem(
      session.prompt,
      session.method,
      session.solveMode,
    );
    if (
      session.activeStep >= result.steps.length ||
      session.messages.some((m) => m.step >= result.steps.length)
    )
      throw Error("Bước học không tồn tại.");
  } else if (
    session.method ||
    session.activeStep ||
    session.showAll ||
    session.messages.length
  )
    throw Error("Đề chưa được giải không được chứa lời giải cũ.");
  return session;
}

/** Preserve legacy content for review, but never reuse an unbound proof. */
export function migrateSolveSession(raw: unknown): SolveSession {
  if (raw && typeof raw === "object" && "guidedProblem" in raw) {
    const old = raw as Record<string, unknown>;
    const problem = old.guidedProblem as Record<string, unknown> | null;
    if (problem && !problem.sourcePrompt && typeof old.prompt === "string") {
      return validateSolveSession({
        ...old,
        phase: "review",
        method: null,
        guidedProblem: {
          ...problem,
          sourcePrompt: old.prompt.trim(),
          status: "needs_review",
          warnings: [
            "Phiên cũ chưa gắn phân tích với nguồn đề. Cần phân tích lại trước khi giải.",
          ],
        },
        guidedSolution: null,
        activeStep: 0,
        showAll: false,
        messages: [],
        legacyUnbound: true,
      });
    }
  }
  const session = validateSolveSession(raw);
  // Upgrade a bound review draft to newly supported direct calculation without
  // changing an existing saved solution or discarding its previous explanations.
  if (
    session.phase === "review" &&
    session.guidedProblem &&
    !session.guidedProblem.directSolver &&
    ["essay", "short_answer"].includes(
      session.guidedProblem.assessment?.type || "",
    )
  ) {
    const directSolver = directSolverFor(session.prompt);
    if (directSolver) {
      const type = session.guidedProblem.assessment!.type as
        "essay" | "short_answer";
      const canonical =
        directSolver === "extended"
          ? extendedProblem(session.prompt, type)
          : directSolver === "recurrence"
            ? recurrenceProblem(session.prompt, type)
            : null;
      return {
        ...session,
        guidedProblem: canonical
          ? {
              ...canonical,
              ...(session.guidedProblem.figureContext
                ? { figureContext: session.guidedProblem.figureContext }
                : {}),
            }
          : { ...session.guidedProblem, directSolver },
      };
    }
  }
  return session;
}
