import { NextResponse } from "next/server";
import { getMaterial } from "@/lib/store";
import { api, isAuthor, HttpError } from "@/lib/http";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const m = await getMaterial((await params).id, { token: new URL(req.url).searchParams.get("share") || undefined });
    if (!m)
      throw new HttpError(404, "Không tìm thấy tài liệu");
    return NextResponse.json({
      url: `/material/${m.id}/print`,
      format: "static-html",
      pdf: "browser-print",
    });
  }, req);
}
