import { ownsMaterial } from "@/lib/auth/types";
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { api, HttpError } from "../../../../../lib/http";
import { getMaterial } from "../../../../../lib/store";
import { getAuthContext } from "@/lib/auth/server";
import { getCurriculumMaterial } from "@/lib/curriculum-store";

export const runtime = "nodejs";

const extensions: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function GET(req: Request, { params }: { params: Promise<{ materialId: string; name: string }> }) {
  return api(async () => {
    const { materialId, name } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(materialId) || !/^[0-9a-f-]{36}\.(png|jpg|webp)$/i.test(name))
      throw new HttpError(404, "Ảnh không tồn tại.");
    const query = new URL(req.url).searchParams;
    const material = query.get("curriculum") && query.get("lesson") ? await getCurriculumMaterial(query.get("curriculum")!, query.get("lesson")!) : await getMaterial(materialId);
    if (!material || material.id !== materialId) throw new HttpError(404, "Ảnh không tồn tại.");
    const { user } = await getAuthContext(req);
    const author = ownsMaterial(user, material.ownerId);
    const url = `/api/material-assets/${materialId}/${name}`;
    const boardVisualIds = new Set(material.blocks.filter((block) => block.board).map((block) => block.visualId));
    const boardImage = boardVisualIds.size > 0 && material.visuals.some((visual) => boardVisualIds.has(visual.id) &&
      visual.boardItems?.some((item) => item.visible && item.kind === "image" && item.assetUrl === url));
    const questionImage = material.blocks.some((block) => block.examQuestion?.useSourceLayout !== false && block.examQuestion?.sourceImages?.includes(url));
    if (!author && !boardImage && !questionImage && !material.blocks.some((block) => block.authorKind === "image" && block.content.split("?")[0] === url))
      throw new HttpError(404, "Ảnh không thuộc bài giảng.");
    const mime = extensions[name.split(".").at(-1)!.toLowerCase()];
    let bytes: Uint8Array;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { data, error } = await supabase.storage.from("material-assets").download(`${materialId}/${name}`);
      if (error || !data) throw new HttpError(404, "Ảnh không tồn tại.");
      bytes = new Uint8Array(await data.arrayBuffer());
    } else if (!process.env.SUPABASE_URL && process.env.NODE_ENV !== "production") {
      try {
        bytes = await fs.readFile(path.join(process.env.MATH_STUDIO_DATA_DIR || path.join(process.cwd(), "data"), "material-assets", materialId, name));
      } catch { throw new HttpError(404, "Ảnh không tồn tại."); }
    } else throw new HttpError(503, "Kho ảnh production chưa được cấu hình.");
    const responseBytes = new Uint8Array(bytes.byteLength);
    responseBytes.set(bytes);
    return new NextResponse(responseBytes.buffer, { headers: {
      "Content-Type": mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff",
    } });
  }, req);
}
