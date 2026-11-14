import { requireUser } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { SOLVE_BODY_BYTES } from "@/lib/solve-limits";
import { z } from "zod";
import { SolveModeSchema } from "@/lib/solve-mode";
import { api, body, } from "@/lib/http";
import { GuidedProblemSchema } from "@/lib/solve-guided-contracts";
import { solveGuidedProblem } from "@/lib/solve-guided";
import { SolveFigureInputSchema } from "@/lib/solve-figure-context";

export const runtime = "nodejs";
// Statically analyzable route limit; leaves headroom over the 155s AI budget.
export const maxDuration = 180;

const Input = z
  .object({
    prompt: z.string().trim().min(1).max(8000),
    analysis: GuidedProblemSchema,
    method: z.string().regex(/^ai-[0-3]$/),
    solveMode: SolveModeSchema.default("standard"),
    figure: SolveFigureInputSchema.optional(),
  })
  .strict();

export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const input = Input.parse(await body(req, SOLVE_BODY_BYTES.guidedWithFigure));
    return NextResponse.json({
      solution: await solveGuidedProblem(
        input.prompt,
        input.analysis,
        input.method,
        req.signal,
        input.solveMode,
        input.figure,
      ),
    });
  }, req);
}
