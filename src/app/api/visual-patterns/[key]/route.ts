import { NextResponse } from "next/server";
import { api, HttpError } from "@/lib/http";
import { getVisualPattern, instantiateVisualPattern } from "@/lib/visual-patterns";

type Context = { params: Promise<{ key: string }> };

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: Context) {
  return api(async () => {
    const key = (await params).key;
    const pattern = getVisualPattern(key);
    if (!pattern) throw new HttpError(404, "Không tìm thấy mẫu mô hình");
    return NextResponse.json({ pattern, spec: instantiateVisualPattern(key) });
  });
}

