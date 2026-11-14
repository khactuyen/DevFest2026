"use client";
import { useState } from "react";
import type { Material } from "@/lib/contracts";
import { request } from "@/lib/client";
export function MaterialShare({ material, onUpdate }: { material: Material; onUpdate: (m: Material) => void }) {
  const destination = material.exam ? "đề kiểm tra" : "bài giảng";
  const [expires, setExpires] = useState(""), [url, setUrl] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function audience(visibility: Material["visibility"]) {
    setBusy(true); setMessage(""); setUrl("");
    try { const m = await request<Material>(`/api/materials/${material.id}`, { method: "PATCH", body: JSON.stringify({ revision: material.revision, visibility }) }); onUpdate(m); setMessage("Đã cập nhật phạm vi truy cập."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Không đổi được phạm vi."); } finally { setBusy(false); }
  }
  async function share() {
    setBusy(true); setMessage("");
    try {
      let target = `/material/${material.id}`;
      if (material.visibility === "link") { const result = await request<{ url: string }>(`/api/materials/${material.id}/share`, { method: "POST", body: JSON.stringify({ expiresAt: expires ? new Date(expires).toISOString() : null }) }); target = result.url; }
      const value = `${window.location.origin}${target}`; setUrl(value);
      try { await navigator.clipboard.writeText(value); setMessage(`Đã sao chép link xem ${destination}.`); } catch { setMessage("Liên kết đã sẵn sàng. Bạn có thể sao chép bên dưới."); }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Không tạo được liên kết."); } finally { setBusy(false); }
  }
  async function revoke() {
    setBusy(true); setMessage("");
    try { await request(`/api/materials/${material.id}/share`, { method: "DELETE" }); setUrl(""); setMessage("Đã thu hồi toàn bộ liên kết đã tạo."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Không thu hồi được."); } finally { setBusy(false); }
  }
  return <section className="material-share" aria-label={`Chia sẻ ${destination}`}><h3>Chia sẻ {destination}</h3><label>Ai được xem?<select disabled={busy} value={material.visibility} onChange={e => void audience(e.target.value as Material["visibility"])}><option value="private">Chỉ mình tôi</option><option value="link">Người có liên kết được cấp</option><option value="public">Công khai trong thư viện</option></select></label>
    {material.visibility === "link" && <label>Hạn dùng liên kết (không bắt buộc)<input type="datetime-local" value={expires} onChange={e => setExpires(e.target.value)} /></label>}
    {material.visibility === "private" ? <p>Học liệu chỉ tài khoản của bạn được xem.</p> : <button className="outline" disabled={busy} onClick={() => void share()}>{busy ? "Đang xử lý…" : `Sao chép link xem ${destination}`}</button>}
    {material.visibility === "link" && <button className="outline" disabled={busy} onClick={() => void revoke()}>Thu hồi các liên kết</button>}
    {url && <label>Link xem {destination}<input readOnly value={url} onFocus={e => e.target.select()} /></label>}{message && <p role="status">{message}</p>}
  </section>;
}
