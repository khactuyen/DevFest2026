"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import type { Material } from "@/lib/contracts";
import { publicMaterial } from "@/lib/public-material";
import { examQuestions, examSourceFigures } from "@/lib/exam-document";
import type { ExploreRuntime } from "./explore/shared";
import { ExamSheet } from "./ExamSheet";
import { buildExamVariants, examAnswerKeyCsv } from "@/lib/exam-variants";

export function ExamPreview({ material, canShowAnswers = false }: { material: Material; canShowAnswers?: boolean }) {
  const [teacher, setTeacher] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [variantCount, setVariantCount] = useState(0);
  const [variantCode, setVariantCode] = useState("");
  const paper = useRef<HTMLDivElement>(null);
  const runtimes = useRef(new Map<string, ExploreRuntime>());
  const showAnswers = canShowAnswers && teacher;
  const { variants, repeated } = useMemo(() => buildExamVariants(material, canShowAnswers ? variantCount : 0), [material, canShowAnswers, variantCount]);
  const variant = variants.find((entry) => entry.exam?.code === variantCode) ?? material;
  const edition = showAnswers ? variant : publicMaterial(variant);
  const rows = examQuestions(edition).map((row) => ({ ...row, sourceFigures: examSourceFigures(row.question) }));
  const sourceQuestionNumbers = rows.filter((row) => row.sourceFigures.length > 0).map(({ number }) => number);
  const figures = rows.flatMap((row) => [...row.sourceFigures, ...row.figures]);
  const hasSourceLayout = sourceQuestionNumbers.length > 0;
  const wordRequiresExtraction = canShowAnswers && material.status === "draft" && hasSourceLayout;

  async function exportExam(format: "word" | "pdf") {
    if (busy || !paper.current) return;
    if (format === "word" && wordRequiresExtraction) return;
    setBusy(true);
    setError("");
    try {
      const root = paper.current;
      const started = performance.now();
      while (root.querySelector(".exam-figure .visual-shell .muted") ||
        root.querySelectorAll(".exam-figure > img").length < figures.filter((figure) => figure.authorKind === "image").length ||
        [...root.querySelectorAll(".formatted-ai-math")].some((host) => !host.querySelector("math-field"))) {
        if (performance.now() - started > 4500) throw Error("Hình hoặc công thức đang tải. Hãy thử lại.");
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      await Promise.all([...root.querySelectorAll("img")].map((image) => image.decode()));
      await document.fonts.ready;
      if (format === "pdf") {
        window.print();
        return;
      }
      const [{ examWordFile }, { exportBoardCanvas }] = await Promise.all([import("@/lib/exam-word"), import("@/lib/board-export")]);
      const images = [];
      for (const figure of figures) {
        const element = root.querySelector<HTMLElement>(`[data-exam-figure="${CSS.escape(figure.id)}"]`);
        if (!element) throw Error("Thiếu hình minh họa trong đề.");
        let canvas: HTMLCanvasElement;
        if (figure.authorKind === "image") {
          const image = element.querySelector("img");
          if (!image) throw Error("Không đọc được ảnh minh họa.");
          canvas = document.createElement("canvas");
          const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
        } else {
          const stage = element.querySelector<HTMLElement>(".math-board-stage");
          const runtime = runtimes.current.get(figure.id);
          if (!stage || !runtime) throw Error("Bảng vẽ chưa sẵn sàng.");
          canvas = await exportBoardCanvas(stage, runtime, { transparent: !figure.examFigure?.keepBackground });
        }
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) =>
          result ? resolve(result) : reject(Error("Không chuyển được hình sang ảnh PNG.")), "image/png"));
        images.push({ id: figure.id, bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
      }
      const bytes = await examWordFile(edition, showAnswers, images);
      const file = new Blob([new Uint8Array(bytes).buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${material.title.replace(/[<>:"/\\|?*]/g, "-").trim() || "MathCos"}${variant !== material ? `-${variantCode}` : ""}-${showAnswers ? "giao-vien" : "hoc-sinh"}.docx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không xuất được đề.");
    } finally {
      setBusy(false);
    }
  }

  function downloadAnswerKeys() {
    const csv = examAnswerKeyCsv(variants);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "dap-an-cac-ma-de.csv"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  return <section className="exam-preview">
    <div className="exam-preview-tools">
      {canShowAnswers && <label>Bản xem và xuất<select disabled={busy} value={showAnswers ? "teacher" : "student"} onChange={(event) => setTeacher(event.target.value === "teacher")}>
        <option value="student">Bản học sinh</option><option value="teacher">Bản giáo viên</option>
      </select></label>}
      {canShowAnswers && <label>Số mã đề xáo trộn<select disabled={busy || hasSourceLayout} value={variantCount} onChange={(event) => { setVariantCount(+event.target.value); setVariantCode(""); }}>
        {[0, 2, 3, 4, 5, 6].map((number) => <option key={number} value={number}>{number || "Đề gốc"}</option>)}
      </select></label>}
      {!!variants.length && canShowAnswers && <>
        <label>Mã đang xem<select disabled={busy} value={variantCode} onChange={(event) => setVariantCode(event.target.value)}>
          <option value="">Đề gốc</option>{variants.map((entry) => <option key={entry.exam?.code}>{entry.exam?.code}</option>)}
        </select></label>
        <button type="button" disabled={busy} onClick={downloadAnswerKeys}><Download size={16} /> Bảng đáp án các mã</button>
        {!!repeated && <small>{repeated} mã trùng bố cục vì số câu hoặc phương án có thể xáo trộn còn ít.</small>}
      </>}
      <button type="button" disabled={busy || wordRequiresExtraction} aria-describedby={wordRequiresExtraction ? "exam-pdf-source-note" : undefined}
        onClick={() => void exportExam("word")}><Download size={16} /> Tải Word (.docx)</button>
      <button type="button" disabled={busy} onClick={() => void exportExam("pdf")}><Printer size={16} /> In / Lưu PDF</button>
      {busy && <span role="status">Đang chuẩn bị tệp…</span>}
      {canShowAnswers && hasSourceLayout && <small className="exam-source-layout-note" id="exam-pdf-source-note">
        {sourceQuestionNumbers.length} câu dùng ảnh gốc ({sourceQuestionNumbers.join(", ")}). Bản PDF in nguyên các ảnh này, gồm cả dấu đánh đáp án nếu có.
        {wordRequiresExtraction && " Để tải Word, hãy chuyển các câu này thành nội dung chỉnh sửa."}
      </small>}
      {error && <p role="alert">{error}</p>}
    </div>
    <div ref={paper} className="exam-print-surface">
      <ExamSheet key={variantCode} material={edition} teacher={showAnswers} onFigureReady={(id, runtime) => runtimes.current.set(id, runtime)} />
    </div>
  </section>;
}
