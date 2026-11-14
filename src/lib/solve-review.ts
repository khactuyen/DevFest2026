import { z } from "zod";

export const SolveReviewIssueSchema = z
  .object({
    kind: z.enum(["advisory", "ambiguity", "missing", "contradiction"]),
    detail: z.string().trim().min(5).max(500),
    evidence: z.string().trim().max(500),
    neededFor: z.string().trim().max(300),
    impact: z.string().trim().max(500),
  })
  .strict();
export const SolveReviewIssuesSchema = z.array(SolveReviewIssueSchema).max(8);
export const SolveResultKindSchema = z.enum([
  "complete",
  "conditional",
  "partial",
]);
export const reviewIssueJson = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "detail", "evidence", "neededFor", "impact"],
  properties: {
    kind: {
      type: "string",
      enum: ["advisory", "ambiguity", "missing", "contradiction"],
    },
    detail: { type: "string", minLength: 5, maxLength: 500 },
    evidence: { type: "string", maxLength: 500 },
    neededFor: { type: "string", maxLength: 300 },
    impact: { type: "string", maxLength: 500 },
  },
};
export function canAttemptSolve(problem: { status: string }) {
  return problem.status === "ready" || problem.status === "caution";
}
/** A provider's vague suspicion is not evidence that the problem is impossible.
 * Legacy analyses remain blocked until reanalysed with the structured protocol. */
export function reviewedStatus(
  status: "ready" | "caution" | "needs_review" | "contradictory",
  issues?: z.infer<typeof SolveReviewIssuesSchema>,
) {
  if (!issues) return status;
  const justified = issues.filter(
    (issue) =>
      issue.kind !== "advisory" &&
      issue.evidence &&
      issue.neededFor &&
      issue.impact,
  );
  if (justified.some((issue) => issue.kind === "contradiction"))
    return "contradictory" as const;
  // A missing/ambiguous detail may still permit a parameterised or partial solution.
  // The solver must explicitly label that outcome, never silently fill the gap.
  if (status !== "ready" || issues.length) return "caution" as const;
  return "ready" as const;
}
