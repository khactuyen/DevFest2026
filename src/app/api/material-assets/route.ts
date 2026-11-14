import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { api, HttpError } from "../../../lib/http";
import { getMaterial } from "../../../lib/store";
import { requireUser, userDatabase } from "@/lib/auth/server";

export const runtime = "nodejs";

const imageTypes = new Map([
  ["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"],
]);
const maxImageBytes = 2_000_000;

export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const materialId = req.headers.get("x-material-id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(materialId) || !await getMaterial(materialId, { edit: true }))
      throw new HttpError(404, "Hãy lưu bản nháp trước khi tải ảnh lên.");
    const mime = req.headers.get("content-type")?.split(";")[0] || "";
    const extension = imageTypes.get(mime);
    if (!extension) throw new HttpError(415, "Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP.");
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxImageBytes)
      throw new HttpError(413, "Ảnh vượt giới hạn 2 MB.");
    if (!req.body) throw new HttpError(400, "Chưa chọn ảnh.");
    const reader = req.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxImageBytes) { await reader.cancel(); throw new HttpError(413, "Ảnh vượt giới hạn 2 MB."); }
      parts.push(value);
    }
    if (!size) throw new HttpError(400, "Ảnh trống.");
    const bytes = Buffer.concat(parts.map((part) => Buffer.from(part)));
    const signature = extension === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : extension === "jpg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!signature) throw new HttpError(415, "Tệp không khớp định dạng ảnh đã khai báo.");
    const name = `${crypto.randomUUID()}.${extension}`;
    const key = `${materialId}/${name}`;
    const supabase = await userDatabase();
    if (supabase) {
      const { error } = await supabase.storage.from("material-assets").upload(key, bytes, { contentType: mime, upsert: false });
      if (error) throw new HttpError(503, `Không lưu được ảnh: ${error.message}`);
    } else if (process.env.NODE_ENV !== "production") {
      const directory = path.join(process.env.MATH_STUDIO_DATA_DIR || path.join(process.cwd(), "data"), "material-assets", materialId);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, name), bytes, { flag: "wx" });
    } else throw new HttpError(503, "Kho ảnh production chưa được cấu hình.");
    return NextResponse.json({ url: `/api/material-assets/${materialId}/${name}` }, { status: 201 });
  }, req);
}
