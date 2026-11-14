import { NextResponse } from "next/server";
import { z } from "zod";
import { api, body, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { createMaterialLink, revokeMaterialLinks } from "@/lib/store";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    await requireUser(req);
    const input = z.object({ expiresAt: z.string().datetime().nullable().default(null) }).strict().parse(await body(req, 1000));
    if (input.expiresAt && Date.parse(input.expiresAt) <= Date.now()) throw new HttpError(400, "Hạn dùng phải ở tương lai.");
    return NextResponse.json(await createMaterialLink((await params).id, input.expiresAt), { status: 201 });
  }, req);
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => { await requireUser(req); await revokeMaterialLinks((await params).id); return NextResponse.json({ ok: true }); }, req);
}
