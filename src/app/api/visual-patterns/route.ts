import { NextResponse } from "next/server";
import { api } from "@/lib/http";
import { listVisualPatterns } from "@/lib/visual-patterns";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return api(async () => {
    const params = new URL(req.url).searchParams;
    return NextResponse.json(
      listVisualPatterns({
        dimension: params.get("dimension"),
        topic: params.get("topic"),
        q: params.get("q"),
      }),
    );
  }, req);
}

