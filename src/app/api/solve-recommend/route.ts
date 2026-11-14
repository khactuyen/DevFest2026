import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { api, body } from "@/lib/http";
import { SolveRequestSchema } from "@/lib/solve-contracts";
import { SOLVE_BODY_BYTES } from "@/lib/solve-limits";
import { recommendSolveMethods } from "@/lib/gemini-decisions";

export const runtime = "nodejs";
export const maxDuration = 15;
export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const input = SolveRequestSchema.omit({ method: true }).parse(
      await body(req, SOLVE_BODY_BYTES.promptWithFigure),
    );
    return NextResponse.json(
      await recommendSolveMethods(
        input.prompt,
        input.questionType,
        req.signal,
        input.figure,
      ),
    );
  }, req);
}
