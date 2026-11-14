import { NextResponse } from "next/server";
import { SOLVE_BODY_BYTES } from "@/lib/solve-limits";
import { api, body, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { SolveRequestSchema } from "@/lib/solve-contracts";
import { makeSolveMaterial } from "@/lib/solve-material";
import { saveMaterial } from "@/lib/store";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const input = SolveRequestSchema.parse(await body(req, SOLVE_BODY_BYTES.prompt));
    if (!input.method)
      throw new HttpError(422, "Chọn phương pháp trước khi tạo bản nháp.");
    return NextResponse.json(
      await saveMaterial(makeSolveMaterial(input.prompt, input.method, input.solveMode), null),
      { status: 201 },
    );
  }, req);
}
