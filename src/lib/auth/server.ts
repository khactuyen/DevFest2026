import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../app-error";
import { localUser } from "./local";
import { SESSION_COOKIE, canAuthor, type AuthUser } from "./types";

type Scope = { request: Request; context?: Promise<AuthContext> };
export type AuthContext = { user: AuthUser | null; token?: string; db: SupabaseClient | null };
const scope = new AsyncLocalStorage<Scope>();
export const withAuthRequest = <T>(request: Request, fn: () => T) => scope.run({ request }, fn);
export function authConfiguration() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) return { url, key };
  if (url || key || process.env.NODE_ENV === "production") throw new AppError(503, "Cần cấu hình SUPABASE_URL và SUPABASE_ANON_KEY.", "auth_unavailable");
  return null;
}
export async function readCookie(name: string, request?: Request): Promise<string | undefined> {
  const req = request || scope.getStore()?.request;
  if (req) {
    const entry = req.headers.get("cookie")?.split(";").map(p => p.trim()).find(p => p.startsWith(`${name}=`));
    if (!entry) return undefined;
    try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return undefined; }
  }
  try { return (await cookies()).get(name)?.value; }
  catch (e) {
    // Standalone store tests/scripts have no Next request. Never invent an identity.
    if (String(e).includes("request scope")) return undefined;
    throw e;
  }
}
async function resolveAuth(request?: Request): Promise<AuthContext> {
  const config = authConfiguration(), token = await readCookie(SESSION_COOKIE, request);
  if (!config) return { user: await localUser(token), token, db: null };
  const db = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false }, ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}) });
  if (!token) return { user: null, db };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { user: null, db };
  const { data: validSession, error: sessionError } = await db.rpc("auth_session_valid");
  if (sessionError) throw new AppError(503, "Kho phân quyền chưa sẵn sàng.", "access_store_unavailable");
  if (!validSession) return { user: null, db };
  const [{ data: access, error: accessError }, { data: profile }] = await Promise.all([
    db.from("user_access").select("role,status,can_author").eq("user_id", data.user.id).maybeSingle(),
    db.from("profiles").select("display_name").eq("user_id", data.user.id).maybeSingle(),
  ]);
  if (accessError || !access) throw new AppError(503, "Kho phân quyền chưa sẵn sàng. Cần áp dụng migration tài khoản.", "access_store_unavailable");
  return { token, db, user: { id: data.user.id, email: data.user.email || "", displayName: profile?.display_name || "", role: access.role, status: access.status, canAuthor: access.can_author } };
}
export function getAuthContext(request?: Request): Promise<AuthContext> {
  const current = scope.getStore();
  if (current && (!request || request === current.request)) return current.context ||= resolveAuth(current.request);
  return resolveAuth(request);
}
export async function requireUser(request?: Request) {
  const context = await getAuthContext(request);
  if (!context.user) throw new AppError(401, "Vui lòng đăng nhập để tiếp tục.", "authentication_required");
  if (context.user.status !== "active") throw new AppError(403, "Tài khoản đã bị khóa.", "account_suspended");
  return context.user;
}
export async function requireRole(role: "author" | "admin", request?: Request) {
  const user = await requireUser(request);
  if (role === "author" ? !canAuthor(user) : user.role !== role) throw new AppError(403, role === "author" ? "Cần quyền tác giả để thực hiện thao tác này." : "Cần quyền quản trị viên.", "permission_denied");
  return user;
}
export async function requireOwner(ownerId?: string | null) {
  const user = await requireUser();
  if (user.id !== ownerId) throw new AppError(404, "Không tìm thấy tài nguyên.");
  return user;
}
export async function userDatabase() { return (await getAuthContext()).db; }
export function assertMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url), host = request.headers.get("host");
  // Next may expose its internal hostname in request.url. A browser supplies
  // Host itself; use the configured public origin behind a reverse proxy.
  const expected = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : host ? `${requestUrl.protocol}//${host}` : requestUrl.origin;
  if (origin && origin !== expected) throw new AppError(403, "Origin không hợp lệ.");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new AppError(403, "Yêu cầu không hợp lệ.");
}
