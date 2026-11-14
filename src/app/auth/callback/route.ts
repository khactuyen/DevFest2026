import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient, type EmailOtpType } from "@supabase/supabase-js";
import { authConfiguration } from "@/lib/auth/server";
import { writeSession } from "@/lib/auth/cookies";
import { safeReturnTo } from "@/lib/auth/types";
export async function GET(req: Request) {
  const url = new URL(req.url), config = authConfiguration();
  if (!config) return NextResponse.redirect(new URL("/login", url));
  const jar = await cookies();
  const client = createClient(config.url, config.key, { auth: { flowType: "pkce", autoRefreshToken: false, persistSession: true, storage: {
    getItem: key => key.endsWith("-code-verifier") ? jar.get("mv_pkce")?.value || null : null,
    setItem: () => {}, removeItem: key => { if (key.endsWith("-code-verifier")) jar.delete("mv_pkce"); },
  } } });
  const code = url.searchParams.get("code"), tokenHash = url.searchParams.get("token_hash"), type = url.searchParams.get("type");
  const result = code ? await client.auth.exchangeCodeForSession(code)
    : tokenHash && ["signup", "recovery", "email"].includes(type || "") ? await client.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType }) : null;
  if (!result || result.error || !result.data.session) return NextResponse.redirect(new URL("/login?error=confirmation", url));
  await writeSession(result.data.session.access_token, result.data.session.refresh_token);
  const response = NextResponse.redirect(new URL(type === "recovery" ? "/reset-password" : safeReturnTo(url.searchParams.get("next")), url));
  response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
