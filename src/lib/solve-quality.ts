import { z } from "zod";
import { SolveResultKindSchema, SolveReviewIssuesSchema, reviewIssueJson } from "./solve-review";
import { ItemConclusionSchema } from "./solve-question";

// Optional UI help is not a premise of a proof. Only absent/blank strings are
// normalized; numbers/objects remain validation errors.
export function supportingText(fallback: string, max: number) {
  return z.preprocess(
    (value) =>
      value == null || (typeof value === "string" && !value.trim())
        ? fallback
        : value,
    z.string().trim().min(2).max(max),
  );
}

export function readableProofContent(
  step: { content: string; explanation: string },
  version?: number,
) {
  if (version === 1) return step.content;
  // Old saved proofs are preserved. Their helper may contain an essential
  // premise, so show it explicitly in BOTH reading and printing views.
  return `${step.content}\n\nGiải thích từ phiên cũ (cần đối chiếu): ${step.explanation}`;
}

export function mathTextIssues(text: string): string[] {
  const issues: string[] = [];
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
    issues.push("control_character");
  const delimiters = /\\[()[\]]|\$\$?/g;
  let open = "";
  let start = 0;
  let lastEnd = 0;
  const orphan =
    /\\(?:frac|dfrac|tfrac|sqrt|angle|perp|parallel|cdot|cos|sin|tan|sum|log|vec|overrightarrow|in|ne|geq?|leq?)\b/;
  for (const match of text.matchAll(delimiters)) {
    const token = match[0];
    if (!open) {
      if (orphan.test(text.slice(lastEnd, match.index)))
        issues.push("unwrapped_latex");
      if (text[match.index! - 1] === "\\")
        issues.push("double_escaped_delimiter");
      if (token === "\\)" || token === "\\]") {
        issues.push("math_delimiter");
        continue;
      }
      open = token;
      start = match.index! + token.length;
    } else {
      const close = open === "\\(" ? "\\)" : open === "\\[" ? "\\]" : open;
      if (token !== close) {
        issues.push("math_delimiter");
        continue;
      }
      const math = text.slice(start, match.index);
      // High-confidence damaged JSON escapes: \ne -> newline + e, \frac
      // -> form feed, \times -> tab + imes. Do not guess/replace meanings.
      if (
        /(?:\r?\n)\s*(?:e(?:q)?(?=[\s0-9{\\])|otin\b|abla\b)|\t(?:imes|heta|ext|an)\b/.test(
          math,
        )
      )
        issues.push("damaged_math_escape");
      if (/[{}]/.test(math)) {
        let depth = 0;
        for (let i = 0; i < math.length; i++) {
          if (math[i] === "\\") {
            i++;
            continue;
          }
          if (math[i] === "{") depth++;
          if (math[i] === "}" && --depth < 0) break;
        }
        if (depth !== 0) issues.push("math_braces");
      }
      open = "";
      lastEnd = match.index! + token.length;
    }
  }
  if (open) issues.push("math_delimiter");
  else if (orphan.test(text.slice(lastEnd))) issues.push("unwrapped_latex");
  return [...new Set(issues)];
}

const coordinate = z.number().finite().min(-1e6).max(1e6);
const vector = z.tuple([coordinate, coordinate, coordinate]);
const pointName = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,15}$/);
const point = z.object({ name: pointName, coordinates: vector }).strict();
const directedVector = z
  .object({ from: pointName, to: pointName, components: vector })
  .strict();
export const NumericGeometryCheckSchema = z
  .object({
    // Numeric claims only; no JS/expression execution and no general proof checker.
    points: z.array(point).min(2).max(8),
    vectors: z.array(directedVector).min(1).max(4),
    relation: z.enum([
      "vectors",
      "dot",
      "norm",
      "absoluteCosine",
      "orthogonal",
    ]),
    value: z.number().finite().min(-1e12).max(1e12),
  })
  .strict();
export type NumericGeometryCheck = z.infer<typeof NumericGeometryCheckSchema>;

const near = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
export function checkNumericGeometry(claim: NumericGeometryCheck): string {
  const points = new Map(claim.points.map((p) => [p.name, p.coordinates]));
  if (points.size !== claim.points.length) throw Error("Tên điểm bị trùng.");
  for (const v of claim.vectors) {
    const from = points.get(v.from),
      to = points.get(v.to);
    if (!from || !to) throw Error("Vectơ tham chiếu điểm không tồn tại.");
    if (!v.components.every((c, i) => near(c, to[i] - from[i])))
      throw Error(
        `Vectơ ${v.from}${v.to} phải bằng tọa độ ${v.to} trừ ${v.from}, không được đảo hướng.`,
      );
  }
  const vectors = claim.vectors.map((v) => v.components);
  const norm = (v: number[]) => Math.hypot(...v);
  let value = 0;
  if (claim.relation !== "vectors") {
    if (claim.relation === "norm") {
      if (vectors.length !== 1) throw Error("Độ dài cần đúng một vectơ.");
      value = norm(vectors[0]);
    } else {
      if (vectors.length !== 2) throw Error("Quan hệ cần đúng hai vectơ.");
      value = vectors[0].reduce((sum, c, i) => sum + c * vectors[1][i], 0);
      if (claim.relation === "absoluteCosine") {
        const denominator = norm(vectors[0]) * norm(vectors[1]);
        if (denominator <= 1e-12)
          throw Error("Không xác định góc với vectơ không.");
        value = Math.abs(value) / denominator;
      }
      if (
        claim.relation === "orthogonal" &&
        (!near(value, 0) ||
          norm(vectors[0]) <= 1e-12 ||
          norm(vectors[1]) <= 1e-12)
      )
        throw Error("Hai vectơ khác không chưa vuông góc.");
    }
    if (!near(value, claim.value))
      throw Error("Kết quả quan hệ vectơ không khớp tọa độ đã khai báo.");
  }
  const display = (value: number) => Number(value.toPrecision(8));
  const lines = claim.vectors.map(
    (v) =>
      `\\(\\overrightarrow{${v.from}${v.to}}${v.components.every(Number.isInteger) ? "=" : "\\approx"}(${v.components.map(display).join(",")})\\)`,
  );
  if (claim.relation !== "vectors")
    lines.push(`${claim.relation} = ${claim.value}`);
  return `Đối chiếu số học trên tọa độ khai báo: ${lines.join("; ")}. Không xác nhận tọa độ thỏa đề hoặc toàn bộ chứng minh.`;
}

const operation = z.object({
  content: z.string().trim().min(5).max(3000),
  reason: z.string().trim().min(2).max(1000),
  geometryChecks: z.array(NumericGeometryCheckSchema).max(2).default([]),
});
export const ProofOutputSchema = z.object({
  qualityVersion: z.literal(1),
  status: z.enum(["solved", "needs_review"]),
  warning: z.string().trim().max(500).default(""),
  answer: z.string().trim().max(4000),
  itemConclusions: z.array(ItemConclusionSchema).max(8).optional(),
  resultKind: SolveResultKindSchema.default("complete"),
  assumptions: z.array(z.string().trim().min(5).max(500)).max(8).default([]),
  unresolvedGoals: z.array(z.number().int().min(0).max(7)).max(8).default([]),
  reviewIssues: SolveReviewIssuesSchema.optional(),
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(140),
        operations: z.array(operation).min(1).max(6),
        completesGoals: z
          .array(z.number().int().min(0).max(7))
          .max(8)
          .default([]),
        hint: supportingText(
          "Đối chiếu lại giả thiết và kết luận ở bước này.",
          900,
        ),
        explanation: supportingText(
          "AI chưa cung cấp giải thích bổ sung cho bước này; cần đối chiếu độc lập.",
          2000,
        ),
      }),
    )
    .max(30),
});

export function compileProof(
  raw: z.infer<typeof ProofOutputSchema>,
  goalCount: number,
  mode: "standard" | "detailed",
) {
  const problems: string[] = [];
  const checkText = (value: string, path: string) => {
    problems.push(...mathTextIssues(value).map((issue) => `${path}:${issue}`));
  };
  checkText(raw.answer, "answer");
  checkText(raw.warning, "warning");
  raw.assumptions.forEach((text, i) => checkText(text, `assumptions.${i}`));
  raw.reviewIssues?.forEach((issue, i) => Object.values(issue).forEach(text => checkText(text, `reviewIssues.${i}`)));
  raw.itemConclusions?.forEach((item, index) => checkText(item.justification, `itemConclusions.${index}.justification`));
  const covered = new Set<number>();
  let numericChecks = 0;
  const steps: {
    title: string;
    content: string;
    hint: string;
    explanation: string;
    completesGoals: number[];
  }[] = [];
  raw.steps.forEach((s, i) => {
    checkText(s.title, `steps.${i}.title`);
    checkText(s.hint, `steps.${i}.hint`);
    checkText(s.explanation, `steps.${i}.explanation`);
    s.completesGoals.forEach((g) => {
      if (g >= goalCount) problems.push(`steps.${i}:unknown_goal`);
      covered.add(g);
    });
    const contents = s.operations.map((op, j) => {
      checkText(op.content, `steps.${i}.operations.${j}.content`);
      checkText(op.reason, `steps.${i}.operations.${j}.reason`);
      const checks: string[] = [];
      op.geometryChecks.forEach((claim, k) => {
        try {
          checks.push(checkNumericGeometry(claim));
          numericChecks++;
        } catch (e) {
          problems.push(
            `steps.${i}.operations.${j}.geometryChecks.${k}:${(e as Error).message}`,
          );
        }
      });
      return `${op.content}\n\nCăn cứ: ${op.reason}${checks.length ? "\n\n" + checks.join("\n\n") : ""}`;
    });
    if (mode === "detailed")
      contents.forEach((content, j) =>
        steps.push({
          title:
            contents.length > 1
              ? `${s.title.slice(0, 130)} (${j + 1}/${contents.length})`
              : s.title,
          content,
          hint: s.hint,
          explanation: s.explanation,
          completesGoals: j === contents.length - 1 ? s.completesGoals : [],
        }),
      );
    else
      steps.push({
        title: s.title,
        content: contents.join("\n\n"),
        hint: s.hint,
        explanation: s.explanation,
        completesGoals: s.completesGoals,
      });
  });
  if (raw.status === "solved") {
    if (!raw.answer || !steps.length) problems.push("missing_proof_or_answer");
    for (let g = 0; g < goalCount; g++)
      if (!covered.has(g) && !(raw.resultKind === "partial" && raw.unresolvedGoals.includes(g))) problems.push(`goals.${g}:uncovered`);
    if (raw.resultKind === "conditional" ? !raw.assumptions.length : raw.assumptions.length > 0) problems.push("assumptions:result_kind_mismatch");
    if (raw.resultKind === "partial" ? !raw.unresolvedGoals.length : raw.unresolvedGoals.length > 0) problems.push("unresolved:result_kind_mismatch");
    if (new Set(raw.unresolvedGoals).size !== raw.unresolvedGoals.length || raw.unresolvedGoals.some(g => g >= goalCount || covered.has(g))) problems.push("unresolved:invalid_goal");
    if (raw.reviewIssues?.some(issue => issue.kind === "contradiction" && issue.evidence && issue.impact && issue.neededFor)) problems.push("contradictory_premises");
    if (raw.resultKind === "complete" && raw.reviewIssues?.some(issue => issue.kind !== "advisory")) problems.push("unresolved_issue_in_complete_answer");
  }
  if (steps.length > (mode === "standard" ? 12 : 30))
    problems.push("step_budget");
  if (steps.some((s) => s.content.length > 6000))
    problems.push("content_budget");
  return { steps, problems: [...new Set(problems)], numericChecks };
}

// JSON Schema is derived from the same limits; optional UI help may be blank.
const string = (minLength: number, maxLength: number) => ({
  type: "string",
  minLength,
  maxLength,
});
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const array = (items: unknown, maxItems: number, minItems = 0) => ({
  type: "array",
  items,
  minItems,
  maxItems,
});
const number = { type: "number", minimum: -1e6, maximum: 1e6 };
const coords = { ...array(number, 3, 3) };
const name = { ...string(1, 16), pattern: "^[A-Za-z][A-Za-z0-9_]{0,15}$" };
export const geometryCheckJson = object({
  points: array(object({ name, coordinates: coords }), 8, 2),
  vectors: array(object({ from: name, to: name, components: coords }), 4, 1),
  relation: {
    type: "string",
    enum: ["vectors", "dot", "norm", "absoluteCosine", "orthogonal"],
  },
  value: { type: "number", minimum: -1e12, maximum: 1e12 },
});
export function proofResponseSchema(mode: "standard" | "detailed", assessment = false) {
  return {
    name: "solve_guided_steps_v1",
    schema: object({
      qualityVersion: { type: "integer", const: 1 },
      status: { type: "string", enum: ["solved", "needs_review"] },
      warning: string(0, 500),
      answer: string(0, 4000),
      resultKind: { type: "string", enum: ["complete", "conditional", "partial"] },
      assumptions: array(string(5, 500), 8),
      unresolvedGoals: array({ type: "integer", minimum: 0, maximum: 7 }, 8),
      reviewIssues: array(reviewIssueJson, 8),
      ...(assessment ? { itemConclusions: array(object({ itemId: { ...string(1, 1), pattern: "^[a-hA-H]$" }, verdict: { type: "string", enum: ["true", "false", "correct"] }, justification: string(5, 400) }), 8) } : {}),
      steps: array(
        object({
          title: string(2, 140),
          operations: array(
            object({
              content: string(5, 3000),
              reason: string(2, 1000),
              geometryChecks: array(geometryCheckJson, 2),
            }),
            6,
            1,
          ),
          completesGoals: array({ type: "integer", minimum: 0, maximum: 7 }, 8),
          hint: string(0, 900),
          explanation: string(0, 2000),
        }),
        mode === "standard" ? 12 : 30,
      ),
    }),
  };
}
