import { NextResponse } from "next/server";
import { createLessonDraft } from "@/lib/material-defaults";
import { saveMaterial } from "@/lib/store";
import { api, body } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const input = await body(req);
    const title = typeof input.title === "string" ? input.title.trim().slice(0, 200) : "";
    const draft = createLessonDraft(title || "Bài học mới");
    return NextResponse.json(await saveMaterial(draft, null), { status: 201 });
  }, req);
}
