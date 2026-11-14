import { analyzeExtended } from "./exact-solver";
import { parseExpression, evaluate, relation } from "./exact-solver/expression";
import { cmp, sub, Z, readQ } from "./exact-solver/arithmetic";
import { solveExtended } from "./solve-extended";
import { solveRecurrence } from "./solve-recurrence";
import {
  calculateConstantAnswer,
  analyzeSolveProblem,
  checkRationalRelation,
  solveProblem,
} from "./solve-engine";
import type { QuestionAssessment } from "./solve-question";

export type IndependentAnswer = {
  itemId: string;
  verdict: "correct" | "true" | "false";
  detail: string;
};
function rational(source: string): string | null {
  const s = source.replace(/\\(?:d?frac)\{(-?\d+)\}\{(-?\d+)\}/g, "$1/$2");
  const m = /^([+-]?\d+)(?:\.(\d{1,8}))?(?:\/([+-]?\d+))?$/.exec(s);
  if (!m || s.length > 80) return null;
  let n = BigInt(m[1] + (m[2] || "")),
    d = m[3] ? BigInt(m[3]) : 10n ** BigInt(m[2]?.length || 0);
  if (!d || (m[2] && m[3])) return null;
  let a = n < 0n ? -n : n,
    b = d < 0n ? -d : d;
  while (b) [a, b] = [b, a % b];
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  return `${n / a}/${d / a}`;
}
function rationalSet(source: string): string | null {
  let s = source
    .replace(/\\(?:left|right)/g, "")
    .replace(/\\[()[\]]|\$/g, "")
    .replace(/\\([{}])/g, "$1")
    .replace(/\s/g, "")
    .replace(/^[Sx]=/, "");
  const braced = s.startsWith("{") && s.endsWith("}");
  if (braced) s = s.slice(1, -1);
  else if (/[;,]/.test(s)) return null; // Do not confuse decimal commas with root lists.
  const values = s.split(/[;,]/).map(rational);
  if (
    values.some((value) => value === null) ||
    new Set(values).size !== values.length
  )
    return null;
  return values.sort().join(",");
}

/** Conservative checks against source text, independent of provider verdicts. */
export function independentAssessmentAnswers(
  assessment: QuestionAssessment,
): IndependentAnswer[] {
  if (assessment.type === "multiple_choice") {
    try {
      const stem = assessment.stem
        .replace(
          /(?:chọn\s*(?:một\s*)?đáp\s*án(?:\s*đúng)?)[.!?:：]?\s*$/iu,
          "",
        )
        .trim();
      let expected: string | null = null;
      try {
        const problem = analyzeSolveProblem(stem);
        if (problem.relation !== "=") return [];
        const solution = solveProblem(stem, problem.methods[0].id);
        if (solution.exactRoots.length)
          expected = rationalSet(`{${solution.exactRoots.join(";")}}`);
      } catch {
        const solved = analyzeExtended(stem)?.rationalSolutions;
        if (solved?.variable === "x")
          expected = rationalSet(`{${solved.values.join(";")}}`);
      }
      const sets = assessment.items.map((item) => rationalSet(item.content));
      if (expected === null || sets.some((set) => set === null)) return [];
      const matching = assessment.items.filter((_, i) => sets[i] === expected);
      if (matching.length !== 1) return [];
      return [
        {
          itemId: matching[0].id,
          verdict: "correct",
          detail:
            "Đã giải phương trình nguồn và đối chiếu chính xác toàn bộ tập nghiệm hữu tỉ với tất cả phương án; chỉ một phương án khớp.",
        },
      ];
    } catch {
      return [];
    }
  }
  if (assessment.type !== "true_false") return [];
  const stem = assessment.stem
    .replace(
      /(?:xét\s*(?:tính\s*)?đúng\s*[/–—-]?\s*sai|các\s*mệnh\s*đề\s*sau)[.!?:：]?\s*$/iu,
      "",
    )
    .trim();
  const bound =
    /^(?:Cho\s+)?x\s*=\s*([+-]?\d+(?:\.\d+)?(?:\/[+-]?\d+)?)[.;]?$/iu.exec(
      stem,
    )?.[1];
  return assessment.items.flatMap((item) => {
    try {
      const check = checkRationalRelation(item.content, bound);
      return [
        {
          itemId: item.id,
          verdict: check.holds ? ("true" as const) : ("false" as const),
          detail: check.detail,
        },
      ];
    } catch {
      try {
        const r = relation(item.content);
        const values: Record<string, ReturnType<typeof readQ>> = bound !==
        undefined
          ? { x: readQ(bound) }
          : {};
        const difference = cmp(
          sub(evaluate(r.left, values), evaluate(r.right, values)),
          Z,
        );
        const holds =
          r.op === "="
            ? difference === 0
            : r.op === "<"
              ? difference < 0
              : r.op === ">"
                ? difference > 0
                : r.op === "<="
                  ? difference <= 0
                  : difference >= 0;
        return [
          {
            itemId: item.id,
            verdict: holds ? ("true" as const) : ("false" as const),
            detail:
              "Đã thế giá trị vào đầy đủ hai vế gốc bằng phân số chính xác, kiểm tra tất cả phép chia và so sánh kết quả theo quan hệ nguồn.",
          },
        ];
      } catch {
        return [];
      }
    }
  });
}

/** A saved result cannot promote a model vote to a deterministic verification. */
export function assertSupportedVerification(
  solution: import("./solve-guided-contracts").GuidedSolution,
) {
  const review = solution.resultReview;
  const claims =
    review?.checks.filter((check) => check.status === "verified") || [];
  const full =
    review?.status === "answer_verified" || review?.status === "scope_checked";
  if (!claims.length && !full && solution.origin !== "solver") return;
  if (
    (solution.origin === "solver" ||
      solution.verification.startsWith("Đáp án được tính")) &&
    !full
  )
    throw Error("Chưa có kiểm tra đủ phạm vi cho trạng thái của bộ giải.");
  const assessment = solution.problem.assessment;
  if (assessment?.type === "essay" || assessment?.type === "short_answer") {
    const computed =
      solveRecurrence(
        solution.problem.sourcePrompt || "",
        solution.problem,
        solution.method,
        solution.solveMode,
      ) ||
      solveExtended(
        solution.problem.sourcePrompt || "",
        solution.problem,
        solution.method,
        solution.solveMode,
      );
    if (computed) {
      if (
        solution.answer !== computed.answer ||
        solution.resultKind !== "complete" ||
        review?.status !== "answer_verified" ||
        claims.length !== 1 ||
        claims[0].itemId !== "answer" ||
        JSON.stringify(solution.steps) !== JSON.stringify(computed.steps)
      )
        throw Error("Công thức hoặc các bước không khớp bộ giải trực tiếp.");
      return;
    }
  }

  if (assessment?.type === "short_answer" || assessment?.type === "essay") {
    const calculated = calculateConstantAnswer(
      solution.problem.sourcePrompt || "",
    );
    if (
      solution.answer !== `\\[${calculated.answer}\\]` ||
      claims.some((check) => check.itemId !== "answer")
    )
      throw Error("Trạng thái kiểm chứng không khớp phép tính trực tiếp.");
    return;
  }
  if (
    !assessment ||
    !["multiple_choice", "true_false"].includes(assessment.type)
  )
    throw Error(
      "Không có bộ kiểm tra xác định cho trạng thái đã xác minh này.",
    );
  const checked = independentAssessmentAnswers(assessment),
    results = solution.itemConclusions || [];
  for (const claim of claims) {
    const valid =
      assessment.type === "multiple_choice"
        ? claim.itemId === "answer" &&
          checked.length === 1 &&
          results[0]?.itemId === checked[0].itemId
        : checked.some(
            (check) =>
              check.itemId === claim.itemId &&
              results.some(
                (item) =>
                  item.itemId === check.itemId &&
                  item.verdict === check.verdict,
              ),
          );
    if (!valid) throw Error("Không thể xác minh ý này bằng bộ giải hiện có.");
  }
  if (
    full &&
    (solution.resultKind !== "complete" ||
      checked.length !==
        (assessment.type === "multiple_choice" ? 1 : assessment.items.length) ||
      claims.length !== checked.length ||
      new Set(claims.map((claim) => claim.itemId)).size !== claims.length ||
      checked.some(
        (check) =>
          !results.some(
            (item) =>
              item.itemId === check.itemId && item.verdict === check.verdict,
          ) ||
          !claims.some(
            (claim) =>
              claim.itemId ===
              (assessment.type === "multiple_choice" ? "answer" : check.itemId),
          ),
      ))
  )
    throw Error("Chưa kiểm tra đủ các kết luận để xác nhận toàn bộ đáp án.");
}
