import { NextResponse } from "next/server";
import { getMaterial, saveMaterial, slugify } from "@/lib/store";
import { api, body, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { validateMaterialForPublish } from "@/lib/validation";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    await requireUser(req);
    const m = await getMaterial((await params).id, { edit: true });
    if (!m) throw new HttpError(404, "Không tìm thấy tài liệu");
    const input = await body(req);
    if (typeof input.published !== "boolean")
      throw new HttpError(400, "published phải là boolean");
    if (input.published) validateMaterialForPublish(m);
    return NextResponse.json(
      await saveMaterial({
        ...m,
        status: input.published ? "published" : "draft",
        slug: m.slug || slugify(m.title, m.id),
        publishedAt: input.published ? new Date().toISOString() : null,
        revision: m.revision + 1,
        updatedAt: new Date().toISOString(),
      }, m.revision, input.published ? "publish" : "unpublish"),
    );
  }, req);
}
