"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { request } from "@/lib/client";
const roleNames = { learner: "Người học", author: "Tác giả / Giảng viên", admin: "Quản trị viên" };
export function AccountPage() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const user = useAuth(); const [name, setName] = useState(user?.displayName || ""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  if (!user) return <main className="auth-page"><section className="auth-card"><h1>Tài khoản của bạn</h1><p>Đăng nhập để quản lý hồ sơ.</p><Link href="/login?next=/account" className="primary">Đăng nhập</Link></section></main>;
  async function update(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await request("/api/auth/profile", { method: "POST", body: JSON.stringify({ displayName: name }) }); window.location.reload(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Không lưu được hồ sơ."); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await request("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Không đăng xuất được."); setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">HỒ SƠ</span><h1>Tài khoản của bạn</h1>
    <p>{user.email}</p><p><strong>{roleNames[user.role]}</strong> · {user.status === "active" ? "Đang hoạt động" : "Đã bị khóa"}</p>
    <form data-hydrated={hydrated} onSubmit={update}><label>Họ tên<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><button className="primary" disabled={busy}>Lưu hồ sơ</button></form>
    <p>Quyền tác giả và quản trị viên do quản trị viên cấp.</p>
    {message && <p role="alert">{message}</p>}
    <div className="auth-links">{user.role === "admin" && <Link href="/admin/users">Quản lý tài khoản</Link>}<button type="button" disabled={busy} onClick={() => void logout()}>Đăng xuất</button></div>
  </section></main>;
}
