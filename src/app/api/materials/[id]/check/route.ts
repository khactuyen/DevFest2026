import { NextResponse } from "next/server";
import { z } from "zod";
import { api, body, HttpError } from "../../../../../lib/http";
import { gradeMaterial } from "../../../../../lib/store";

export const runtime = "nodejs";
const InputSchema = z.object({ blockId: z.string().min(1).max(100), answer: z.string().max(400) }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const input = InputSchema.parse(await body(req, 2_000));
    return NextResponse.json(await gradeMaterial((await params).id, input.blockId, input.answer, new URL(req.url).searchParams.get("share") || undefined));
  }, req);
}
