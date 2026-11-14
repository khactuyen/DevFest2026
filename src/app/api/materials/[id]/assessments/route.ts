import { NextResponse } from "next/server";
import { api, HttpError } from "@/lib/http";
import { assessmentHistory } from "@/lib/lesson-assessment-store";
import { getMaterial } from "@/lib/store";

export function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const token = new URL(req.url).searchParams.get("share") || undefined;
    const lesson = await getMaterial((await params).id, { publishedOnly: true, token });
    if (!lesson) throw new HttpError(404, "Không tìm thấy bài giảng đã chia sẻ.");
    const assessments = !lesson.exam && lesson.ownerId ? await assessmentHistory(lesson.ownerId, lesson.id) : [];
    return NextResponse.json(assessments);
  }, req);
}
