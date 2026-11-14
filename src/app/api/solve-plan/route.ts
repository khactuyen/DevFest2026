import { NextResponse } from "next/server";
import { api, body } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { SolveRequestSchema } from "@/lib/solve-contracts";
import { SourceReviewSchema } from "@/lib/solve-source";
import { prepareSolvePlan } from "@/lib/solve-plan";
import { SOLVE_BODY_BYTES } from "@/lib/solve-limits";
export const runtime = "nodejs";
export const maxDuration = 180;
const Input = SolveRequestSchema.omit({ method: true }).extend({
  sourceReview: SourceReviewSchema.optional(),
});
export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const input = Input.parse(
      await body(req, SOLVE_BODY_BYTES.promptWithFigure),
    );
    return NextResponse.json(
      await prepareSolvePlan(
        input.prompt,
        input.questionType,
        input.sourceReview,
        req.signal,
        input.figure,
      ),
    );
  }, req);
}
