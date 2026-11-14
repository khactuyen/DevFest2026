import { requireUser } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { SOLVE_BODY_BYTES } from "@/lib/solve-limits";
import { z } from "zod";
import { api, body, } from "@/lib/http";
import { GuidedProblemSchema } from "@/lib/solve-guided-contracts";
import { drawSolveVisual } from "@/lib/solve-visual";

export const runtime = "nodejs";
export const maxDuration = 60;
const Input = z
  .object({
    prompt: z.string().trim().min(1).max(8000),
    analysis: GuidedProblemSchema,
  })
  .strict();

export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const { prompt, analysis } = Input.parse(await body(req, SOLVE_BODY_BYTES.guided));
    return NextResponse.json(
      await drawSolveVisual(prompt, analysis, req.signal),
    );
  }, req);
}
