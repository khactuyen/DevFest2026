import { requireUser } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { recognizeProblemImage } from "@/lib/problem-recognition";
import { api, body, } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    return NextResponse.json(await recognizeProblemImage(await body(req, 4_800_000), req.signal));
  }, req);
}
