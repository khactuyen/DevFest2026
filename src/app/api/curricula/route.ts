import { NextResponse } from "next/server";
import { getCurriculum, listCurricula, saveCurriculum } from "@/lib/curriculum-store";
import { api, body, isAuthor, requireAuthor, HttpError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return api(async () => NextResponse.json(await listCurricula(await isAuthor(req))), req);
}

export async function POST(req: Request) {
  return api(async () => {
    await requireAuthor(req);
    const input = await body(req);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Chương trình học mới";
    if (await getCurriculum(id, true)) throw new HttpError(409, "ID chương trình đã tồn tại");
    const curriculum = await saveCurriculum({
      id,
      ownerId: "local-teacher",
      title,
      description: "",
      subject: "Toán học",
      gradeBand: "THPT",
      objectives: [],
      status: "draft",
      revision: 1,
      courses: [],
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    });
    return NextResponse.json(curriculum, { status: 201 });
  }, req);
}
