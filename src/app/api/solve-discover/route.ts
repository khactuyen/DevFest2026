import { requireUser } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { SOLVE_BODY_BYTES } from "@/lib/solve-limits";
import { api, body, } from "@/lib/http";
import { SolveRequestSchema } from "@/lib/solve-contracts";
import { analyzeSolveProblem } from "@/lib/solve-engine";
import { analyzeGuidedProblem } from "@/lib/solve-guided";
import { detectQuestionType } from "@/lib/solve-question";

export const runtime = "nodejs";
// Statically analyzable route limit; leaves headroom over the 155s AI budget.
export const maxDuration = 180;

export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const { prompt, questionType, figure } = SolveRequestSchema.omit({ method: true }).parse(
      await body(req, SOLVE_BODY_BYTES.promptWithFigure),
    );
    try {
      const type = questionType === "auto" ? detectQuestionType(prompt) : questionType;
      if (type && type !== "essay") throw Error("Assessment uses AI analysis, not equation-only parsing");
      return NextResponse.json({ problem: analyzeSolveProblem(prompt) });
    } catch {
      return NextResponse.json({
        problem: await analyzeGuidedProblem(prompt, req.signal, questionType, figure),
      });
    }
  }, req);
}
