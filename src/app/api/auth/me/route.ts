import { NextResponse } from "next/server";
import { api } from "@/lib/http";
import { getAuthContext } from "@/lib/auth/server";
import { ownerKeyFor } from "@/lib/auth/types";
export async function GET(req: Request) {
  return api(async () => {
    const { user, db } = await getAuthContext(req);
    return NextResponse.json({ user, ownerKey: user ? ownerKeyFor(user.id) : null, mode: db ? "supabase" : "local" });
  }, req);
}
