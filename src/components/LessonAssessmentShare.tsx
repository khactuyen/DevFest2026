"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { request } from "@/lib/client";
import type { AssessmentSummary } from "@/lib/lesson-assessment";

export const lessonAssessmentPath = (id: string) => `/phieu-kiem-tra/${encodeURIComponent(id)}`;

export function LessonAssessmentLink({ assessmentId }: { assessmentId: string }) {
  const field = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const path = lessonAssessmentPath(assessmentId);
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const url = origin ? new URL(path, origin).href : path;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Đã sao chép link làm phiếu.");
    } catch {
      field.current?.focus();
      field.current?.select();
      setMessage("Hãy sao chép thủ công link làm phiếu đã chọn.");
    }
  }

  return <div className="lesson-assessment-share-link">
    <label className="lesson-check-field">Link làm phiếu cho học sinh
      <input ref={field} readOnly value={url} onFocus={(event) => event.target.select()} />
    </label>
    <div className="lesson-check-actions">
      <button className="gs-primary" type="button" disabled={!origin} onClick={() => void copyLink()}>
        <Copy size={15} /> Sao chép link làm phiếu
      </button>
      <a className="gs-secondary" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Mở trang làm bài</a>
    </div>
    {message && <p role="status">{message}</p>}
  </div>;
}

export function LessonAssessmentShare({ lessonId, onPrepare }: { lessonId: string; onPrepare: () => void }) {
  const [history, setHistory] = useState<AssessmentSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setHistory([]); setSelected(""); setFailed(false); setLoading(true);
    void request<AssessmentSummary[]>(`/api/lesson-assessments?lesson=${encodeURIComponent(lessonId)}`, { signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) return;
        setHistory(items);
        setSelected(items[0]?.id ?? "");
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [lessonId]);

  return <section className="material-share" aria-label="Chia sẻ phiếu kiểm tra">
    <h3>Chia sẻ phiếu kiểm tra</h3>
    {loading ? <p role="status">Đang tải các đợt phiếu online…</p>
      : failed ? <p role="status">Chưa tải được link làm phiếu. Tải lại trang để thử lại.</p>
      : !selected ? <>
        <p>Chưa phát phiếu online cho bản bài giảng này. Sau khi phát, link nhập mã học sinh sẽ xuất hiện ở đây.</p>
        <div className="lesson-check-actions"><button className="gs-primary" type="button" onClick={onPrepare}>Chuẩn bị phát phiếu online</button></div>
      </> : <>
    {history.length > 1 && <label>Đợt kiểm tra<select value={selected} onChange={(event) => setSelected(event.target.value)}>
      {history.map((item) => <option key={item.id} value={item.id}>{item.title} · {new Date(item.createdAt).toLocaleString("vi-VN")}</option>)}
    </select></label>}
    <p>Link mở màn hình nhập mã học sinh và mã làm bài trước khi hiện câu hỏi.</p>
    <LessonAssessmentLink key={selected} assessmentId={selected} />
    </>}
  </section>;
}
