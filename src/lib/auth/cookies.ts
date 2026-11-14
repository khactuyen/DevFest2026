import { cookies } from "next/headers";
import { REFRESH_COOKIE, SESSION_COOKIE } from "./types";
export async function writeSession(access: string, refresh = "") {
  const jar = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 7 * 86400 };
  jar.set(SESSION_COOKIE, access, options);
  if (refresh) jar.set(REFRESH_COOKIE, refresh, options);
  else jar.delete(REFRESH_COOKIE);
}
export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE); jar.delete(REFRESH_COOKIE); jar.delete("mv_pkce");
}
