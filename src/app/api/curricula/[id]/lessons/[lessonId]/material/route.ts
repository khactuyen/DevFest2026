import { NextResponse } from "next/server";
import { api, HttpError } from "@/lib/http";
import { getCurriculumMaterial } from "@/lib/curriculum-store";
export async function GET(req: Request, { params }: { params: Promise<{ id: string; lessonId: string }> }) {
  return api(async () => {
    const { id, lessonId } = await params;
    const material = await getCurriculumMaterial(id, lessonId);
    if (!material) throw new HttpError(404, "Bài học chưa sẵn sàng hoặc đã được thu hồi.");
    return NextResponse.json(material);
  }, req);
}
