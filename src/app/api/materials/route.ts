import { NextResponse } from "next/server";
import { listMaterials, saveMaterial, getMaterial } from "@/lib/store";
import { api, body, HttpError } from "@/lib/http";
import { publicMaterial } from "@/lib/public-material";
import { getAuthContext, requireUser } from "@/lib/auth/server";
import { ownsMaterial } from "@/lib/auth/types";
export const runtime = "nodejs";
export async function GET(req: Request) {
  return api(async () => {
    const q = new URL(req.url).searchParams;
    const { user } = await getAuthContext(req);
    let all = await listMaterials();
    if (q.get("scope") === "mine") all = all.filter(m => ownsMaterial(user, m.ownerId));
    for (const key of ["grade", "topic", "type"] as const) {
      const value = q.get(key);
      if (value) all = all.filter((m) => m.metadata[key] === value);
    }
    const query = q.get("q")?.toLowerCase();
    if (query)
      all = all.filter((m) =>
        (m.title + " " + m.summary + " " + m.metadata.tags.join(" "))
          .toLowerCase()
          .includes(query),
      );
    return NextResponse.json(all.map(m => ownsMaterial(user, m.ownerId) ? m : publicMaterial(m)));
  }, req);
}
export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const raw = await body(req);
    if (await getMaterial(raw.id)) throw new HttpError(409, "ID đã tồn tại");
    return NextResponse.json(
      await saveMaterial({
        ...raw,
        status: "draft",
        slug: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, null),
      { status: 201 },
    );
  }, req);
}
