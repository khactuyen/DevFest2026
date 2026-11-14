import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { api, body, HttpError } from "@/lib/http";
import { authConfiguration, assertMutationOrigin, getAuthContext, requireUser } from "@/lib/auth/server";
import { loginLocal, logoutLocal, registerLocal, requestLocalRecovery, resetLocalPassword, updateLocalProfile } from "@/lib/auth/local";
import { clearSession, writeSession } from "@/lib/auth/cookies";
import { limitAuth } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
const email = z.string().trim().email().max(254).transform(s => s.toLowerCase());
const password = z.string().min(10, "Mật khẩu cần ít nhất 10 ký tự").max(128);
const displayName = z.string().trim().min(1).max(100);

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  return api(async () => {
    assertMutationOrigin(req);
    const { action } = await params;
    const config = authConfiguration();
    const input = action === "logout" ? {} : await body(req, 4000);
    if (action !== "profile") limitAuth(req, typeof input.email === "string" ? input.email.toLowerCase() : "");
    const jar = await cookies();
    const supabase = config ? createClient(config.url, config.key, { auth: {
      autoRefreshToken: false, persistSession: true, flowType: "pkce",
      storage: {
        getItem: key => key.endsWith("-code-verifier") ? jar.get("mv_pkce")?.value || null : null,
        setItem: (key, value) => { if (key.endsWith("-code-verifier")) jar.set("mv_pkce", value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 3600 }); },
        removeItem: key => { if (key.endsWith("-code-verifier")) jar.delete("mv_pkce"); },
      },
    } }) : null;
    if (action === "register") {
      const data = z.object({ email, password, displayName }).strict().parse(input);
      if (supabase) {
        const { data: result, error } = await supabase.auth.signUp({ email: data.email, password: data.password, options: { data: { display_name: data.displayName }, emailRedirectTo: `${new URL(req.url).origin}/auth/callback` } });
        if (error) throw new HttpError(400, "Không thể đăng ký. Kiểm tra thông tin hoặc thử lại sau.");
        return NextResponse.json({
          message: result.session
            ? "Tài khoản đã được tạo. Bạn có thể đăng nhập ngay."
            : "Kiểm tra email để xác nhận tài khoản rồi đăng nhập.",
        }, { status: result.session ? 201 : 200 });
      }
      await registerLocal(data.email, data.password, data.displayName);
      return NextResponse.json({ message: "Tài khoản đã được tạo. Bạn có thể đăng nhập." }, { status: 201 });
    }
    if (action === "login") {
      const data = z.object({ email, password: z.string().min(1).max(128) }).strict().parse(input);
      if (supabase) {
        const { data: result, error } = await supabase.auth.signInWithPassword(data);
        if (error || !result.session) throw new HttpError(401, "Email hoặc mật khẩu không hợp lệ, hoặc email chưa được xác minh.");
        const accessClient = createClient(config!.url, config!.key, { global: { headers: { Authorization: `Bearer ${result.session.access_token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
        const { data: access } = await accessClient.from("user_access").select("status").eq("user_id", result.user.id).single();
        if (access?.status !== "active") throw new HttpError(403, "Tài khoản chưa được cấp quyền hoặc đã bị khóa.");
        await writeSession(result.session.access_token, result.session.refresh_token);
      } else {
        const result = await loginLocal(data.email, data.password);
        await writeSession(result.token);
      }
      return NextResponse.json({ ok: true });
    }
    if (action === "logout") {
      const context = await getAuthContext(req);
      if (supabase && context.token) {
        const { error } = await supabase.auth.admin.signOut(context.token, "local");
        if (error) throw new HttpError(503, "Chưa thu hồi được phiên đăng nhập. Vui lòng thử lại.");
      }
      else if (context.token) await logoutLocal(context.token);
      await clearSession();
      return NextResponse.json({ ok: true });
    }
    if (action === "forgot-password") {
      const data = z.object({ email }).strict().parse(input);
      if (supabase) await supabase.auth.resetPasswordForEmail(data.email, { redirectTo: `${new URL(req.url).origin}/auth/callback?next=/reset-password` });
      else await requestLocalRecovery(data.email, new URL(req.url).origin);
      return NextResponse.json({ message: config ? "Nếu email có tài khoản, hướng dẫn khôi phục đã được gửi." : "Chế độ phát triển: hướng dẫn khôi phục được ghi vào hộp thư cục bộ nếu tài khoản tồn tại." });
    }
    if (action === "reset-password") {
      const data = z.object({ password, token: z.string().max(200).optional() }).strict().parse(input);
      if (supabase) {
        await requireUser(req);
        const context = await getAuthContext(req);
        const passwordClient = createClient(config!.url, config!.key, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error: sessionError } = await passwordClient.auth.setSession({ access_token: context.token!, refresh_token: jar.get("mv_refresh")?.value || "" });
        if (sessionError) throw new HttpError(401, "Vui lòng mở lại liên kết khôi phục.");
        const { error } = await passwordClient.auth.updateUser({ password: data.password });
        if (error) throw new HttpError(400, "Không đổi được mật khẩu. Vui lòng mở lại liên kết khôi phục.");
        const { error: signOutError } = await passwordClient.auth.signOut({ scope: "global" });
        if (signOutError) throw new HttpError(503, "Mật khẩu đã đổi nhưng chưa thu hồi được toàn bộ phiên. Vui lòng đăng xuất và thử lại.");
      } else await resetLocalPassword(data.token || "", data.password);
      await clearSession();
      return NextResponse.json({ message: "Đã đổi mật khẩu. Vui lòng đăng nhập lại." });
    }
    if (action === "profile") {
      const user = await requireUser(req), data = z.object({ displayName }).strict().parse(input);
      const context = await getAuthContext(req);
      if (context.db) {
        const { error } = await context.db.from("profiles").update({ display_name: data.displayName }).eq("user_id", user.id);
        if (error) throw new HttpError(400, "Không cập nhật được hồ sơ.");
      } else await updateLocalProfile(user.id, data.displayName);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(404, "Không tìm thấy chức năng.");
  }, req);
}
