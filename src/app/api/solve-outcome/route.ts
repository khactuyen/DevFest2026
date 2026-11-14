import { NextResponse } from "next/server";
import { z } from "zod";
import { api, body } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { GuidedProblemSchema } from "@/lib/solve-guided-contracts";
import { SolveModeSchema } from "@/lib/solve-mode";
import { SolveFigureInputSchema } from "@/lib/solve-figure-context";
import { SOLVE_BODY_BYTES } from "@/lib/solve-limits";
import { solveWorkflowOutcome } from "@/lib/solve-outcome";
export const runtime = "nodejs";
export const maxDuration = 180;
const Input = z
  .object({
    prompt: z.string().trim().min(1).max(8000),
    analysis: GuidedProblemSchema,
    method: z.string().regex(/^ai-[0-3]$/),
    mode: z.enum(["quick", "deep"]).default("deep"),
    solveMode: SolveModeSchema.default("standard"),
    figure: SolveFigureInputSchema.optional(),
  })
  .strict();
export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const input = Input.parse(
      await body(req, SOLVE_BODY_BYTES.guidedWithFigure),
    );
    return NextResponse.json({
      solution: await solveWorkflowOutcome(
        input.prompt,
        input.analysis,
        input.method,
        input.mode,
        req.signal,
        input.solveMode,
        input.figure,
      ),
    });
  }, req);
}
