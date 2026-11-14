import { NextResponse } from "next/server";
import { validateVisual } from "@/lib/validation";
import { api, body } from "@/lib/http";
export async function POST(req: Request) {
  return api(async () =>
    NextResponse.json({ visual: validateVisual(await body(req)) }),
  req);
}
