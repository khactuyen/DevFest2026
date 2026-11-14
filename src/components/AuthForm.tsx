"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { request } from "@/lib/client";
import { safeReturnTo } from "@/lib/auth/types";
type Kind = "login" | "register" | "forgot-password" | "reset-password";
const titles: Record<Kind, string> = { login: "Chào mừng bạn trở lại", register: "Tạo tài khoản", "forgot-password": "Khôi phục mật khẩu", "reset-password": "Đặt mật khẩu mới" };
export function AuthForm({ kind }: { kind: Kind }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [displayName, setDisplayName] = useState("");
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const payload = kind === "register" ? { email, password, displayName } : kind === "login" ? { email, password } : kind === "forgot-password" ? { email } : { password, token: new URLSearchParams(window.location.search).get("token") || undefined };
      const result = await request<{ message?: string }>(`/api/auth/${kind}`, { method: "POST", body: JSON.stringify(payload) });
      setPassword("");
      if (kind === "login") window.location.assign(safeReturnTo(new URLSearchParams(window.location.search).get("next")));
      else setMessage(result.message || "Đã hoàn thành.");
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể xử lý yêu cầu."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card">
    <span className="eyebrow">MATH VISION AI</span><h1>{titles[kind]}</h1>
    <p>{kind === "login" ? "Tiếp tục bài học, bài giải và những khám phá của bạn." : kind === "register" ? "Lưu tiến độ học tập và mở lại bài giải trên tài khoản của bạn." : "Sử dụng email đã đăng ký để bảo vệ tài khoản của bạn."}</p>
    <form data-hydrated={hydrated} onSubmit={submit}>
      {kind === "register" && <label>Họ tên<input autoComplete="name" maxLength={100} required value={displayName} onChange={e => setDisplayName(e.target.value)} /></label>}
      {kind !== "reset-password" && <label>Email<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {kind !== "forgot-password" && <label>Mật khẩu<input type="password" autoComplete={kind === "login" ? "current-password" : "new-password"} minLength={kind === "login" ? 1 : 10} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} />{kind !== "login" && <small>Ít nhất 10 ký tự.</small>}</label>}
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="auth-success">{message}</p>}
      <button className="primary" disabled={busy}>{busy ? "Đang xử lý…" : kind === "login" ? "Đăng nhập" : kind === "register" ? "Đăng ký" : kind === "forgot-password" ? "Gửi hướng dẫn khôi phục" : "Lưu mật khẩu mới"}</button>
    </form>
    <div className="auth-links">{kind === "login" ? <><Link href="/register">Tạo tài khoản</Link><Link href="/forgot-password">Quên mật khẩu?</Link></> : <Link href="/login">Quay lại đăng nhập</Link>}</div>
  </section></main>;
}
