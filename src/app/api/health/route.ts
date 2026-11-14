import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness probe: storage is required in production, AI is not. */
export async function GET() {
  const headers = { "cache-control": "no-store" };
  if (process.env.NODE_ENV !== "production")
    return NextResponse.json({ status: "ok", storage: "local-dev" }, { headers });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY))
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const checks = await Promise.all([ ["materials", "id"], ["curricula", "id"], ["exploration_sessions", "id"], ["solve_sessions", "id"], ["profiles", "user_id"], ["user_access", "user_id"], ["ai_runs", "id"], ["material_revisions", "material_id"], ["curriculum_revision_materials", "curriculum_id"] ].map(([table, column]) =>
      client.from(table).select(column).limit(1).abortSignal(controller.signal),
    ));
    if (checks.some((check) => check.error))
      return NextResponse.json({ status: "unavailable" }, { status: 503, headers });
    return NextResponse.json({ status: "ok", storage: "supabase" }, { headers });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers });
  } finally {
    clearTimeout(timer);
  }
}
