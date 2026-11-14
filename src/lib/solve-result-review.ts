import { z } from "zod";

export const SolveResultReviewSchema = z
  .object({
    status: z.enum([
      "answer_verified",
      "scope_checked",
      "unverified",
      "partial",
    ]),
    source: z.enum(["solver", "gemini-decision", "jev", "llm"]),
    summary: z.string().min(5).max(700),
    checks: z
      .array(
        z
          .object({
            itemId: z.string().max(30),
            status: z.enum(["verified", "unverified", "conflict"]),
            detail: z.string().min(2).max(1200),
          })
          .strict(),
      )
      .max(12),
    disputes: z
      .array(
        z
          .object({
            itemId: z.string().max(30),
            proposed: z.string().max(100),
            reasoned: z.string().max(100),
            resolution: z.enum([
              "deterministic",
              "reasoning_recheck",
              "unresolved",
            ]),
            detail: z.string().max(1200),
          })
          .strict(),
      )
      .max(8)
      .default([]),
    unresolvedItems: z.array(z.string().max(30)).max(8).default([]),
  })
  .strict();
export type SolveResultReview = z.infer<typeof SolveResultReviewSchema>;
