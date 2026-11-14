import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { REFRESH_COOKIE, SESSION_COOKIE } from "./lib/auth/types";
export async function middleware(req: NextRequest) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const access = req.cookies.get(SESSION_COOKIE)?.value, refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!url || !key || !refresh) return NextResponse.next();
  let expires = 0;
  try { expires = JSON.parse(Buffer.from(access?.split(".")[1] || "", "base64url").toString()).exp * 1000; } catch { /* unverified value used only as a refresh hint */ }
  if (expires > Date.now() + 60000) return NextResponse.next();
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.refreshSession({ refresh_token: refresh });
  if (error || !data.session) {
    req.cookies.delete(SESSION_COOKIE); req.cookies.delete(REFRESH_COOKIE);
    const response = NextResponse.next({ request: { headers: req.headers } });
    response.cookies.delete(SESSION_COOKIE); response.cookies.delete(REFRESH_COOKIE);
    response.headers.set("Cache-Control", "no-store"); return response;
  }
  req.cookies.set(SESSION_COOKIE, data.session.access_token); req.cookies.set(REFRESH_COOKIE, data.session.refresh_token);
  const response = NextResponse.next({ request: { headers: req.headers } });
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 7 * 86400 };
  response.cookies.set(SESSION_COOKIE, data.session.access_token, options); response.cookies.set(REFRESH_COOKIE, data.session.refresh_token, options);
  response.headers.set("Cache-Control", "no-store"); return response;
}
// Refresh before every server-rendered page resolves AuthProvider/AccessGate.
// API assets also need refresh; static files and Next's own assets do not.
export const config = { runtime: "nodejs", matcher: ["/api/:path*", "/((?!_next/|.*\\.[^/]+$).*)"] };
