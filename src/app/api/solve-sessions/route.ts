import { NextResponse } from "next/server";
import { SOLVE_BODY_BYTES } from "@/lib/solve-limits";
import { api, body, HttpError, requireAuthor } from "@/lib/http";
import { listSolveSessions, saveSolveSession } from "@/lib/solve-store";
import { deleteSolveSession } from "@/lib/solve-store";
import { z } from "zod";
import { requireUser } from "@/lib/auth/server";
import { ownerKeyFor } from "@/lib/auth/types";
export const runtime = "nodejs";
export async function GET(req: Request) {
  return api(async () => {
    const ownerKey = ownerKeyFor((await requireUser(req)).id);
    return NextResponse.json(await listSolveSessions(ownerKey), {
      headers: { "cache-control": "no-store" },
    });
  }, req);
}
export async function POST(req: Request) {
  return api(async () => {
    const user = await requireUser(req);
    // Up to eight valid 7,000-character AI answers can exceed 80 kB in UTF-8.
    // This bounded ceiling also covers worst-case JSON escaping in the contract.
    return NextResponse.json(await saveSolveSession({ ...await body(req, SOLVE_BODY_BYTES.session), ownerKey: ownerKeyFor(user.id) }));
  }, req);
}
export async function DELETE(req: Request) {
  return api(async () => {
    const user = await requireUser(req);
    const input = z
      .object({
        id: z.string().uuid(),
        ownerKey: z.string().max(100).optional(),
      })
      .strict()
      .parse(await body(req, 1000));
    await deleteSolveSession(input.id, ownerKeyFor(user.id));
    return NextResponse.json({ ok: true });
  }, req);
}
