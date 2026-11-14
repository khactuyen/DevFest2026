"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { request } from "@/lib/client";
import type { AuthUser } from "@/lib/auth/types";
type Row = AuthUser & { quota: number };
type Audit = { actorId: string; action: string; targetId: string; at: string };
type MaterialRow = { id: string; title: string; withdrawn: boolean };
export function AdminUsers() {
  const actor = useAuth(), [users, setUsers] = useState<Row[]>([]), [audit, setAudit] = useState<Audit[]>([]), [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState<string | null>(null), [loading, setLoading] = useState(true);
  async function load() {
    const [data, content] = await Promise.all([request<{ users: Row[]; audit: Audit[] }>("/api/admin/users"), request<MaterialRow[]>("/api/admin/materials")]);
    setUsers(data.users); setAudit(data.audit); setMaterials(content);
  }
  useEffect(() => { if (actor?.role === "admin") void load().catch(e => setMessage(e.message)).finally(() => setLoading(false)); }, [actor?.id, actor?.role]);
  if (actor?.role !== "admin") return <main className="auth-page"><section className="auth-card"><h1>Quản trị tài khoản</h1><p>Cần quyền quản trị viên để truy cập.</p><Link href="/account">Về tài khoản</Link></section></main>;
  async function save(user: Row) {
    setBusy(user.id); setMessage("");
    try { const { displayName, email, ...payload } = user; await request("/api/admin/users", { method: "PATCH", body: JSON.stringify(payload) }); if (user.id === actor!.id) window.location.reload(); else { await load(); setMessage("Đã cập nhật quyền và hạn mức."); } }
    catch (e) { setMessage(e instanceof Error ? e.message : "Không cập nhật được."); } finally { setBusy(null); }
  }
  function update(id: string, patch: Partial<Row>) { setUsers(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row)); }
  async function moderate(row: MaterialRow) {
    const reason = window.prompt(row.withdrawn ? "Lý do cho phép hiển thị lại học liệu:" : "Lý do gỡ học liệu khỏi phạm vi chia sẻ:");
    if (!reason) return; setBusy(row.id);
    try { await request("/api/admin/materials", { method: "PATCH", body: JSON.stringify({ id: row.id, withdrawn: !row.withdrawn, reason }) }); await load(); setMessage("Đã cập nhật trạng thái nội dung."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Không cập nhật được."); } finally { setBusy(null); }
  }
  return <main className="admin-page"><span className="eyebrow">QUẢN TRỊ</span><h1>Tài khoản và quyền truy cập</h1><p>Mọi tài khoản đang hoạt động có thể dùng Soạn bài. Cấp vai trò, khóa tài khoản và đặt hạn mức xử lý mỗi ngày theo UTC.</p>
    {message && <p role="status" className="admin-message">{message}</p>}
    {loading ? <p>Đang tải…</p> : <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Trạng thái</th><th>Lượt/ngày</th><th>Quyền soạn lộ trình</th><th>Thao tác</th></tr></thead><tbody>{users.map(user => <tr key={user.id}>
      <td><strong>{user.displayName || "Chưa đặt tên"}</strong><small>{user.email}</small></td>
      <td><select aria-label={`Vai trò ${user.email}`} value={user.role} onChange={e => update(user.id, { role: e.target.value as Row["role"] })}><option value="learner">Người học</option><option value="author">Tác giả</option><option value="admin">Quản trị viên</option></select></td>
      <td><select aria-label={`Trạng thái ${user.email}`} value={user.status} onChange={e => update(user.id, { status: e.target.value as Row["status"] })}><option value="active">Hoạt động</option><option value="suspended">Khóa</option></select></td>
      <td><input aria-label={`Hạn mức ${user.email}`} type="number" min={0} max={10000} value={user.quota} onChange={e => update(user.id, { quota: Number(e.target.value) })} /></td>
      <td>{user.role === "admin" ? <label><input type="checkbox" checked={!!user.canAuthor} onChange={e => update(user.id, { canAuthor: e.target.checked })} /> Lộ trình của mình</label> : user.role === "author" ? "Có" : "Không"}</td>
      <td><button className="outline" disabled={busy !== null} onClick={() => void save(user)}>{busy === user.id ? "Đang lưu…" : "Lưu"}</button></td>
    </tr>)}</tbody></table></div>}
    <section className="admin-section"><h2>Nội dung đã xuất bản</h2>{!materials.length && <p>Chưa có nội dung xuất bản.</p>}{materials.map(row => <div className="admin-content-row" key={row.id}><span>{row.title}<small>{row.withdrawn ? "Đang bị gỡ" : "Theo quyền chia sẻ của tác giả"}</small></span><button disabled={busy !== null} onClick={() => void moderate(row)}>{row.withdrawn ? "Cho phép hiển thị lại" : "Gỡ khỏi chia sẻ"}</button></div>)}</section>
    <section className="admin-section"><h2>Nhật ký quản trị</h2>{!audit.length && <p>Chưa có sự kiện.</p>}<ul className="admin-audit">{audit.map((event, index) => <li key={`${event.at}-${index}`}><strong>{event.action}</strong><time>{new Date(event.at).toLocaleString("vi-VN")}</time><small>{users.find(user => user.id === event.actorId)?.email || "Hệ thống"} · {users.find(user => user.id === event.targetId)?.email || event.targetId}</small></li>)}</ul></section>
  </main>;
}
