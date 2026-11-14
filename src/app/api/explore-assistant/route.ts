import { requireUser } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { answerExploreQuestion } from "@/lib/explore-assistant";
import { api, body, } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const answer = await answerExploreQuestion(await body(req, 5_200_000), req.signal);
    return NextResponse.json(answer);
  }, req);
}
