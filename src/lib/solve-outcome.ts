import { solveExtended } from "./solve-extended";
import { solveRecurrence } from "./solve-recurrence";
import { z } from "zod";
import { AppError } from "./app-error";
import {
  GuidedProblemSchema,
  GuidedSolutionSchema,
  assertGuidedSource,
  type GuidedProblem,
  type GuidedSolution,
} from "./solve-guided-contracts";
import {
  assessmentAnswer,
  isChoiceAssessment,
  type ItemConclusion,
} from "./solve-question";
import { independentAssessmentAnswers } from "./solve-answer-checks";
import { calculateConstantAnswer } from "./solve-engine";
import { solveGuidedProblem } from "./solve-guided";
import { requestOpenRouterJson } from "./openrouter";
import type { SolveResultReview } from "./solve-result-review";
import type { SolveMode } from "./solve-mode";
import type { SolveFigureInput } from "./solve-figure-context";
import { solveDecisionLabel } from "./solve-recommendation";
import { verifyDetailedSolution } from "./gemini-decisions";

const unverified =
  "Lời giải do AI đề xuất; chưa được bộ giải toán xác định kiểm chứng.";
const exactVerification =
  "Đáp án được tính và kiểm tra bằng bộ giải xác định trong phạm vi hỗ trợ.";
const shortStep = (title: string, content: string, goals: number[], i = 0) => ({
  id: `ai-step-${i}`,
  title,
  content,
  hint: "Đối chiếu với đề gốc và trạng thái kiểm chứng.",
  explanation: "Có thể yêu cầu giải thích chi tiết nếu cần.",
  targets: [],
  completesGoals: goals,
});
function basicReview(
  solution: GuidedSolution,
  source: SolveResultReview["source"],
): SolveResultReview {
  return {
    source,
    status: solution.resultKind === "partial" ? "partial" : "unverified",
    summary:
      solution.resultKind === "partial"
        ? "Chỉ trả phần đã kết luận; các yêu cầu còn lại chưa được xác minh."
        : "Đã kiểm tra cấu trúc lời giải và điều kiện biểu diễn. Chưa xác minh toàn bộ đáp án, điều kiện và lập luận AI.",
    checks: [
      {
        itemId: "answer",
        status: "unverified",
        detail:
          "Kiểm tra cấu trúc không phải chứng minh tính đúng đắn toán học.",
      },
    ],
    disputes: [],
    unresolvedItems: (solution.unresolvedGoals || []).map(String),
  };
}
function candidateVerdicts(problem: GuidedProblem): Record<string, string> {
  const rec = problem.recommendation;
  if (problem.assessment?.type === "multiple_choice")
    return rec?.candidateAnswer ? { answer: rec.candidateAnswer.optionId } : {};
  return Object.fromEntries(
    (rec?.statementDecisions || [])
      .filter((item) => item.verdict !== "unknown")
      .map((item) => [item.itemId, item.verdict]),
  );
}

export function quickAssessmentOutcome(
  problem: GuidedProblem,
  method: string,
  solveMode: SolveMode,
): GuidedSolution {
  const a = problem.assessment;
  if (!isChoiceAssessment(a))
    throw new AppError(
      422,
      "Đề này cần bộ giải hoặc LLM tạo đáp án.",
      "solve_quick_unavailable",
    );
  const provider = problem.recommendation?.provider ?? "gemini-decision";
  const providerLabel = solveDecisionLabel(provider);
  const candidates = candidateVerdicts(problem),
    independent = independentAssessmentAnswers(a);
  const results: ItemConclusion[] =
    a.type === "multiple_choice"
      ? a.items
          .filter((item) => item.id === candidates.answer)
          .map((item) => ({
            itemId: item.id,
            verdict: "correct" as const,
            justification:
              `Đáp án ứng viên từ ${providerLabel}, đang chờ kiểm tra độc lập.`,
          }))
      : a.items.flatMap((item) =>
          candidates[item.id]
            ? [
                {
                  itemId: item.id,
                  verdict: candidates[item.id] as "true" | "false",
                  justification:
                    `Đánh giá ứng viên từ ${providerLabel} dựa trên phần dẫn.`,
                },
              ]
            : [],
        );
  const disputes: SolveResultReview["disputes"] = [];
  for (const check of independent) {
    const id = a.type === "multiple_choice" ? "answer" : check.itemId;
    const truth = a.type === "multiple_choice" ? check.itemId : check.verdict;
    if (candidates[id] && candidates[id] !== truth)
      disputes.push({
        itemId: id,
        proposed: candidates[id],
        reasoned: truth,
        resolution: "deterministic",
        detail: check.detail,
      });
    if (a.type === "multiple_choice")
      results.splice(0, results.length, {
        itemId: check.itemId,
        verdict: "correct",
        justification: check.detail.slice(0, 400),
      });
    else {
      const prior = results.findIndex((item) => item.itemId === check.itemId);
      const value = {
        itemId: check.itemId,
        verdict: check.verdict,
        justification: check.detail.slice(0, 400),
      };
      if (prior < 0) results.push(value);
      else results[prior] = value;
    }
  }
  const unresolved =
    a.type === "multiple_choice"
      ? results.length
        ? []
        : [0]
      : a.items.flatMap((item, i) =>
          results.some((result) => result.itemId === item.id) ? [] : [i],
        );
  const completeCheck =
    a.type === "multiple_choice"
      ? independent.length > 0
      : independent.length === a.items.length;
  const checks: SolveResultReview["checks"] =
    a.type === "multiple_choice"
      ? [
          {
            itemId: "answer",
            status: completeCheck ? "verified" : "unverified",
            detail:
              independent[0]?.detail ||
              "Chưa có bộ kiểm tra độc lập cho lựa chọn này.",
          },
        ]
      : a.items.map((item) => ({
          itemId: item.id,
          status: independent.some((check) => check.itemId === item.id)
            ? ("verified" as const)
            : ("unverified" as const),
          detail:
            independent.find((check) => check.itemId === item.id)?.detail ||
            `Ứng viên từ ${providerLabel}, đang chờ bộ giải kiểm tra.`,
        }));
  const steps = results.map((item, i) =>
    shortStep(
      a.type === "multiple_choice"
        ? `Đáp án ${item.itemId}`
        : `Ý ${item.itemId}: ${item.verdict === "true" ? "Đúng" : "Sai"}`,
      item.justification,
      [
        a.type === "multiple_choice"
          ? 0
          : a.items.findIndex((source) => source.id === item.itemId),
      ],
      i,
    ),
  );
  return GuidedSolutionSchema.parse({
    kind: "ai",
    origin: completeCheck ? "solver" : provider,
    problem,
    method,
    solveMode,
    answer:
      assessmentAnswer(a, results) ||
      "Chưa có kết luận đủ cơ sở. Các ý chưa xác định được giữ để kiểm tra sâu.",
    itemConclusions: results,
    steps: steps.length
      ? steps
      : [
          shortStep(
            "Chưa đủ cơ sở kết luận",
            `${providerLabel} chưa chọn được đáp án đủ rõ. Hãy kiểm tra dữ kiện hoặc yêu cầu giải sâu.`,
            [],
          ),
        ],
    resultKind: unresolved.length ? "partial" : "complete",
    assumptions: [],
    unresolvedGoals: unresolved,
    warning: completeCheck
      ? ""
      : "Đáp án ứng viên chưa phải lời giải được chứng minh. Những phần chưa kiểm tra được được ghi rõ.",
    verification: completeCheck ? exactVerification : unverified,
    visual: null,
    visualWarning: "Kết quả nhanh chưa có hình minh họa.",
    resultReview: {
      source: completeCheck ? "solver" : provider,
      status: unresolved.length
        ? "partial"
        : completeCheck
          ? "answer_verified"
          : "unverified",
      summary: completeCheck
        ? "Đáp án đã được đối chiếu độc lập trong phạm vi bộ giải hỗ trợ."
        : "Kết quả gồm đáp án ứng viên và phần đã kiểm tra được.",
      checks,
      disputes,
      unresolvedItems: unresolved.map((i) =>
        a.type === "multiple_choice" ? "answer" : a.items[i].id,
      ),
    },
  });
}

async function reviewReasonedOutcome(
  prompt: string,
  solution: GuidedSolution,
  signal?: AbortSignal,
): Promise<GuidedSolution> {
  const a = solution.problem.assessment;
  if (!isChoiceAssessment(a))
    return GuidedSolutionSchema.parse({
      ...solution,
      origin: "llm",
      resultReview: basicReview(solution, "llm"),
    });
  const candidates = candidateVerdicts(solution.problem),
    independent = independentAssessmentAnswers(a);
  const reasoning: Record<string, string> =
    a.type === "multiple_choice"
      ? { answer: solution.itemConclusions?.[0]?.itemId || "unknown" }
      : Object.fromEntries(
          (solution.itemConclusions || []).map((item) => [
            item.itemId,
            item.verdict,
          ]),
        );
  const exact =
    a.type === "multiple_choice"
      ? Object.fromEntries(
          independent.map((item) => [
            "answer",
            { verdict: item.itemId, detail: item.detail },
          ]),
        )
      : Object.fromEntries(
          independent.map((item) => [
            item.itemId,
            { verdict: item.verdict, detail: item.detail },
          ]),
        );
  const ids =
    a.type === "multiple_choice" ? ["answer"] : a.items.map((item) => item.id);
  const disputes: SolveResultReview["disputes"] = [],
    pending: string[] = [];
  for (const id of ids) {
    if (
      (exact[id] && exact[id].verdict !== reasoning[id]) ||
      (candidates[id] && candidates[id] !== reasoning[id])
    ) {
      if (exact[id]?.verdict === reasoning[id])
        disputes.push({
          itemId: id,
          proposed: candidates[id],
          reasoned: reasoning[id],
          resolution: "deterministic",
          detail: exact[id].detail,
        });
      else pending.push(id);
    }
  }
  const Recheck = z
    .object({
      checks: z
        .array(
          z
            .object({
              itemId: z.string().max(10),
              decision: z.string().max(10),
              justification: z.string().min(5).max(1000),
            })
            .strict(),
        )
        .max(8),
    })
    .strict();
  let rechecked: z.infer<typeof Recheck>["checks"] = [];
  if (pending.length) {
    try {
      const output = await requestOpenRouterJson({
        task: "solve",
        signal,
        timeoutMs: 20000,
        maxTokens: 2200,
        routing: { prompt },
        system:
          "Kiểm tra lại độc lập đúng các ý được yêu cầu từ đề gốc. Không dùng các mệnh đề đúng/sai hoặc phương án nhiễu làm giả thiết. Không có đáp án trước đó để bám theo. Chỉ trả JSON checks gồm itemId, decision, justification có căn cứ. true_false: decision true/false/unknown. multiple_choice: decision là nhãn nguồn hoặc unknown. Thiếu dữ kiện hoặc chưa có lập luận chắc chắn thì unknown. Không tuyên bố đã kiểm chứng toàn bộ bằng máy.",
        user: JSON.stringify({
          type: a.type,
          commonHypotheses: a.stem,
          sourceItems: a.items,
          requestedItems: pending,
        }),
        responseSchema: {
          name: "solve_dispute_recheck",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["checks"],
            properties: {
              checks: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["itemId", "decision", "justification"],
                  properties: {
                    itemId: { type: "string", enum: pending },
                    decision: {
                      type: "string",
                      enum:
                        a.type === "multiple_choice"
                          ? [...a.items.map((item) => item.id), "unknown"]
                          : ["true", "false", "unknown"],
                    },
                    justification: { type: "string" },
                  },
                },
              },
            },
          },
        },
      });
      rechecked = Recheck.parse(output).checks;
      if (
        rechecked.length !== pending.length ||
        new Set(rechecked.map((item) => item.itemId)).size !== pending.length ||
        rechecked.some(
          (item) =>
            !pending.includes(item.itemId) ||
            !(
              a.type === "multiple_choice"
                ? [...a.items.map((item) => item.id), "unknown"]
                : ["true", "false", "unknown"]
            ).includes(item.decision),
        )
      )
        rechecked = [];
    } catch (error) {
      signal?.throwIfAborted(); /* Return unresolved parts instead of discarding the whole solution. */
    }
  }
  const unresolvedIds: string[] = [],
    corrections = new Map<string, { verdict: string; detail: string }>();
  for (const id of pending) {
    const reviewed = rechecked.find((item) => item.itemId === id);
    if (exact[id] && reviewed?.decision === exact[id].verdict) {
      corrections.set(id, exact[id]);
      disputes.push({
        itemId: id,
        proposed: candidates[id] || "unknown",
        reasoned: reasoning[id],
        resolution: "deterministic",
        detail: exact[id].detail,
      });
    } else if (
      !exact[id] &&
      reviewed &&
      reviewed.decision === reasoning[id] &&
      reviewed.decision !== "unknown"
    )
      disputes.push({
        itemId: id,
        proposed: candidates[id] || "unknown",
        reasoned: reasoning[id],
        resolution: "reasoning_recheck",
        detail: reviewed.justification,
      });
    else {
      unresolvedIds.push(id);
      disputes.push({
        itemId: id,
        proposed: candidates[id] || "unknown",
        reasoned: reasoning[id] || "unknown",
        resolution: "unresolved",
        detail:
          reviewed?.justification ||
          "Lượt kiểm tra riêng chưa phân xử được. Không dùng bỏ phiếu giữa các model để xác minh đáp án.",
      });
    }
  }
  const goalIndex = (id: string) =>
    a.type === "multiple_choice"
      ? 0
      : a.items.findIndex((item) => item.id === id);
  const affectedGoals = [
    ...new Set([...unresolvedIds, ...corrections.keys()].map(goalIndex)),
  ];
  let items = [...(solution.itemConclusions || [])].filter(
    (item) =>
      !unresolvedIds.includes(
        a.type === "multiple_choice" ? "answer" : item.itemId,
      ),
  );
  let steps = solution.steps.filter(
    (step) =>
      !step.completesGoals?.some((goal) => affectedGoals.includes(goal)),
  );
  for (const [id, correction] of corrections) {
    const result: ItemConclusion = {
      itemId: a.type === "multiple_choice" ? correction.verdict : id,
      verdict:
        a.type === "multiple_choice"
          ? "correct"
          : (correction.verdict as "true" | "false"),
      justification: correction.detail.slice(0, 400),
    };
    if (a.type === "multiple_choice") items = [result];
    else items = [...items.filter((item) => item.itemId !== id), result];
    steps.push(
      shortStep(
        `Đối chiếu lại ${id === "answer" ? "đáp án" : `ý ${id}`}`,
        correction.detail,
        [goalIndex(id)],
        steps.length,
      ),
    );
  }
  const unresolvedGoals = [
    ...new Set([
      ...(solution.unresolvedGoals || []),
      ...unresolvedIds.map(goalIndex),
    ]),
  ];
  if (unresolvedGoals.length)
    steps = items.map((item, i) =>
      shortStep(
        `Phần giữ lại: ${a.type === "multiple_choice" ? "đáp án" : "ý"} ${item.itemId}`,
        item.justification,
        [
          a.type === "multiple_choice"
            ? 0
            : a.items.findIndex((source) => source.id === item.itemId),
        ],
        i,
      ),
    );
  const allChecked =
    a.type === "multiple_choice"
      ? independent.length === 1
      : independent.length === a.items.length;
  const review: SolveResultReview = {
    source: "llm",
    status: unresolvedGoals.length
      ? "partial"
      : allChecked
        ? "scope_checked"
        : "unverified",
    summary: unresolvedGoals.length
      ? "Có phần chưa phân xử được sau kiểm tra riêng. Chỉ các kết luận còn đủ cơ sở được trả về; phần còn lại ghi rõ chưa xác minh."
      : allChecked
        ? "Đáp án đã đối chiếu bằng bộ giải trong phạm vi hỗ trợ. Điều kiện và toàn bộ lập luận AI chưa được chứng minh tự động."
        : "Đã kiểm tra cấu trúc và rà lại riêng các bất đồng nếu có. Chưa có kiểm chứng toán học đầy đủ cho đáp án và lập luận.",
    checks: ids.map((id) => ({
      itemId: id,
      status: unresolvedIds.includes(id)
        ? ("conflict" as const)
        : exact[id]
          ? ("verified" as const)
          : ("unverified" as const),
      detail:
        exact[id]?.detail ||
        "Chưa có bộ kiểm tra xác định cho ý này; cần đối chiếu lập luận.",
    })),
    disputes,
    unresolvedItems: unresolvedIds,
  };
  return GuidedSolutionSchema.parse({
    ...solution,
    origin: "llm",
    problem: solution.problem,
    resultReview: review,
    ...(affectedGoals.length
      ? {
          quality: undefined,
          steps: (steps.length
            ? steps
            : [
                shortStep(
                  "Cần xác minh thêm",
                  "Chưa có kết luận được phân xử đủ cơ sở. Giữ đề gốc và kiểm tra lại các phần đánh dấu.",
                  [],
                ),
              ]
          ).map((step, i) => ({ ...step, id: `ai-step-${i}` })),
          itemConclusions: items,
          answer:
            assessmentAnswer(a, items) ||
            "Chưa có kết luận đủ cơ sở; các đáp án đang bất đồng chưa được xác minh.",
          ...(unresolvedGoals.length
            ? { resultKind: "partial", assumptions: [], unresolvedGoals }
            : {}),
        }
      : {}),
  });
}

export async function solveWorkflowOutcome(
  prompt: string,
  raw: GuidedProblem,
  method: string,
  mode: "quick" | "deep",
  signal?: AbortSignal,
  solveMode: SolveMode = "standard",
  figure?: SolveFigureInput,
) {
  const problem = GuidedProblemSchema.parse(raw);
  assertGuidedSource(prompt, problem);
  if (!problem.methods.some((item) => item.id === method))
    throw new AppError(
      422,
      "Phương pháp không thuộc đề đang xử lý.",
      "solve_method_invalid",
    );
  if (!isChoiceAssessment(problem.assessment)) {
    const recurrence = solveRecurrence(prompt, problem, method, solveMode);
    if (recurrence) return recurrence;
    const extended = solveExtended(prompt, problem, method, solveMode);
    if (extended) return extended;
  }
  if (
    problem.assessment?.type === "short_answer" ||
    problem.assessment?.type === "essay"
  ) {
    try {
      const calculated = calculateConstantAnswer(prompt);
      return GuidedSolutionSchema.parse({
        kind: "ai",
        origin: "solver",
        problem,
        method,
        solveMode,
        answer: `\\[${calculated.answer}\\]`,
        steps: [
          shortStep(
            "Tính đáp án",
            `Biểu thức: ${calculated.expression}\n\\[${calculated.answer}\\]`,
            [0],
          ),
        ],
        resultKind: "complete",
        assumptions: [],
        unresolvedGoals: [],
        warning: "",
        visual: null,
        visualWarning: "Biểu thức hằng không cần đồ thị.",
        verification: exactVerification,
        resultReview: {
          source: "solver",
          status: "answer_verified",
          summary: calculated.detail,
          checks: [
            { itemId: "answer", status: "verified", detail: calculated.detail },
          ],
          disputes: [],
          unresolvedItems: [],
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError)
        throw error; /* broader short answers need reasoning */
    }
  }
  if (problem.directSolver)
    throw new AppError(
      422,
      "Phân tích trực tiếp không còn khớp phạm vi bộ giải. Hãy sửa hoặc phân tích lại đề trước khi tiếp tục.",
      "solve_direct_unavailable",
    );
  if (mode === "quick")
    return quickAssessmentOutcome(problem, method, solveMode);
  // Solve independently before comparing against the decision model's candidates.
  const { recommendation: _recommendation, ...independentProblem } = problem;
  try {
    const solution = await solveGuidedProblem(
      prompt,
      independentProblem,
      method,
      signal,
      solveMode,
      figure,
    );
    const reviewed = await reviewReasonedOutcome(
      prompt,
      { ...solution, problem },
      signal,
    );
    return solveMode === "detailed" && await verifyDetailedSolution(prompt, reviewed, signal, figure)
      ? GuidedSolutionSchema.parse({ ...reviewed, geminiVerified: true })
      : reviewed;
  } catch (error) {
    signal?.throwIfAborted();
    if (
      isChoiceAssessment(problem.assessment) &&
      error instanceof AppError &&
      ![401, 403, 429].includes(error.status)
    ) {
      const partial = quickAssessmentOutcome(problem, method, solveMode);
      return GuidedSolutionSchema.parse({
        ...partial,
        warning:
          "Giải sâu chưa hoàn tất. Đây là kết quả nhanh và phần kiểm tra được; các kết luận chưa có kiểm chứng vẫn được ghi rõ.",
        resultReview: {
          ...partial.resultReview!,
          summary:
            "Giải sâu chưa hoàn tất; giữ phần kiểm tra được và đánh dấu các kết luận còn chưa xác minh.",
        },
      });
    }
    throw error;
  }
}
