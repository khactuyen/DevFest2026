"use client";

import { useRef, useState } from "react";
import { Crop } from "lucide-react";
import { examReviewFlags } from "@/lib/exam-document";
import { MaterialImage } from "./MaterialImage";
import { ExamPromptDisplay } from "./ExamPromptEditor";
import { FormattedAIAnswer } from "./FormattedMath";
import type { ExamBlock } from "./ExamSheet";

type Rectangle = [number, number, number, number];
const initial: Rectangle = [15, 15, 85, 85];

export function ExamPdfReview({ question, figures, onFlags, onNote, onCrop }: {
  question: ExamBlock;
  figures: ExamBlock[];
  onFlags: (flags: NonNullable<NonNullable<ExamBlock["examQuestion"]>["reviewFlags"]>) => void;
  onNote: (note: string) => void;
  onCrop: (file: File, replaceId?: string) => Promise<boolean>;
}) {
  const config = question.examQuestion!;
  const [page, setPage] = useState(0);
  const [region, setRegion] = useState<Rectangle>(initial);
  const [crop, setCrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [replaceId, setReplaceId] = useState("");
  const image = useRef<HTMLDivElement>(null);
  const start = useRef<[number, number] | null>(null);
  const sources = config.sourceImages || [];
  const flags = config.reviewFlags || [];
  const [left, top, right, bottom] = region;
  async function saveCrop() {
    const img = image.current?.querySelector("img");
    if (!img?.naturalWidth || right - left < 2 || bottom - top < 2) {
      setMessage("Chọn một vùng hình đủ lớn trong ảnh gốc."); return;
    }
    setBusy(true); setMessage("");
    try {
      const canvas = document.createElement("canvas");
      const sx = Math.floor(img.naturalWidth * left / 100), sy = Math.floor(img.naturalHeight * top / 100);
      const width = Math.ceil(img.naturalWidth * right / 100) - sx, height = Math.ceil(img.naturalHeight * bottom / 100) - sy;
      const scale = Math.min(1, 1800 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Không mở được công cụ cắt hình.");
      ctx.drawImage(img, sx, sy, width, height, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .87));
      if (!blob) throw Error("Không tạo được ảnh đã cắt.");
      if (!await onCrop(new File([blob], "hinh-tu-pdf.jpg", { type: "image/jpeg" }), replaceId || undefined)) throw Error("Chưa lưu được hình cắt.");
      setCrop(false); setMessage("Đã lưu hình cắt vào câu này.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Chưa cắt được hình."); }
    finally { setBusy(false); }
  }
  return <div className="exam-pdf-review">
    <div className="exam-pdf-compare">
      <section><strong>Ảnh câu gốc</strong>
        {sources.length > 1 && <label>Phần ảnh<select value={page} disabled={busy} onChange={(event) => { setPage(Number(event.target.value)); setRegion(initial); }}>
          {sources.map((src, index) => <option key={src} value={index}>Phần {index + 1}</option>)}</select></label>}
        <div className="exam-crop-image" ref={image}>
          <MaterialImage key={sources[page]} src={sources[page]} alt="Ảnh câu hỏi trong PDF gốc" />
          {crop && <div className="exam-crop-overlay"
            onPointerDown={(event) => {
              if (busy || !image.current?.querySelector("img")) return;
              const rect = event.currentTarget.getBoundingClientRect();
              start.current = [(event.clientX - rect.left) / rect.width * 100, (event.clientY - rect.top) / rect.height * 100];
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!start.current) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
              const y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100));
              const [a, b] = start.current;
              setRegion([Math.min(a, x), Math.min(b, y), Math.max(a, x), Math.max(b, y)]);
            }}
            onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}>
            <span style={{ left: `${left}%`, top: `${top}%`, width: `${right - left}%`, height: `${bottom - top}%` }} />
          </div>}
        </div>
      </section>
      <section><strong>Nội dung đang soạn</strong>
        <ExamPromptDisplay prompt={config.prompt} content={question.content} />
        {!!question.assessment?.options?.length && <ol type={config.kind === "true-false" ? "a" : "A"}>
          {question.assessment.options.map((option, index) => <li key={index}><FormattedAIAnswer text={option} /></li>)}
        </ol>}
        {!!config.sourceWarnings?.length && <ul className="exam-source-layout-note">{config.sourceWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
        <div className="exam-pdf-flags" aria-label="Đánh dấu cần kiểm tra">
          {examReviewFlags.map((flag) => <label key={flag}><input type="checkbox" checked={flags.includes(flag)}
            onChange={(event) => onFlags(event.target.checked ? [...flags, flag] : flags.filter((item) => item !== flag))} />{flag}</label>)}
        </div>
        <label className="exam-pdf-review-note">Ghi chú vị trí cần đối chiếu
          <textarea maxLength={500} rows={2} value={config.reviewNote || ""} onChange={(event) => onNote(event.target.value)}
            placeholder="Ví dụ: kiểm tra dấu âm ở phương án B" />
        </label>
      </section>
    </div>
    <div className="exam-inline-tools"><button type="button" disabled={busy} onClick={() => { setCrop(!crop); setMessage(""); }}><Crop size={14} />{crop ? "Hủy cắt" : "Cắt lại hình"}</button>
      {crop && <button type="button" disabled={busy} onClick={() => void saveCrop()}>{busy ? "Đang lưu…" : "Lưu vùng đã chọn"}</button>}
    </div>
    {crop && <div className="exam-crop-bounds">
      <label>Lưu hình<select value={replaceId} disabled={busy} onChange={(event) => setReplaceId(event.target.value)}>
        <option value="">Thêm hình mới</option>
        {figures.filter((figure) => figure.authorKind === "image").map((figure, index) => <option key={figure.id} value={figure.id}>Thay hình ảnh {index + 1}</option>)}
      </select></label>
      {["Trái", "Trên", "Phải", "Dưới"].map((label, index) => <label key={label}>{label} (%)
        <input type="number" min={0} max={100} step={1} value={Math.round(region[index])} disabled={busy}
          onChange={(event) => setRegion((current) => current.map((value, i) => i === index ? Math.max(0, Math.min(100, Number(event.target.value))) : value) as Rectangle)} />
      </label>)}
    </div>}
    {message && <p role="status">{message}</p>}
  </div>;
}
