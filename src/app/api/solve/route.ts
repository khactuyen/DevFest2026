import { requireUser } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { SOLVE_BODY_BYTES } from "@/lib/solve-limits";
import { api, body, } from "@/lib/http";
import { SolveRequestSchema } from "@/lib/solve-contracts";
import { analyzeSolveProblem, solveProblem } from "@/lib/solve-engine";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const input = SolveRequestSchema.parse(await body(req, SOLVE_BODY_BYTES.prompt));
    return NextResponse.json(
      input.method
        ? { solution: solveProblem(input.prompt, input.method, input.solveMode) }
        : { problem: analyzeSolveProblem(input.prompt) },
    );
  }, req);
}
