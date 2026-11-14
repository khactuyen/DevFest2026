"use client";

import {
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  PenLine,
  Sparkles,
  X,
} from "lucide-react";
import { HandwritingInputPad } from "../HandwritingInputPad";
import { TunnelSourceCorrection } from "../TunnelSourceCorrection";
import { recognitionHasDiagram } from "./shared";

import type { ExploreInputProps as Props } from "./view-contracts";
export function ExploreInputPanel(model: Props) {
  const {
    analysisError,
    analysisStatus,
    askAgent,
    busy,
    changeProblem,
    editRecognition,
    handwritingDraft,
    handwritingHistory,
    inputDockOpen,
    inputTab,
    latexDraft,
    problemPrompt,
    rebuildRecognizedSketch,
    recognition,
    recognitionDraft,
    recognizeUploadedImage,
    recognizingImage,
    replaySessionEvent,
    onInputDockOpenChange,
    onInputTabChange,
    onLatexChange,
    onRecognitionChange,
    correctProblemSource,
    correctRecognitionSource,
    onHandwritingChange,
    explainDrawing,
    sessionHistory,
    sketchTitle,
    visual,
  } = model;
  return (
    <aside
      className={`explore-analysis-sidebar explore-v2-input ${inputDockOpen ? "open" : ""}`}
      aria-label="Nhập đề và tải ảnh"
    >
      <div
        className="explore-v2-dock-tabs"
        role="tablist"
        aria-label="Cách nhập đề"
      >
        <button
          type="button"
          role="tab"
          aria-selected={inputTab === "text"}
          onClick={() => onInputTabChange("text")}
        >
          Gõ đề
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={inputTab === "photo"}
          onClick={() => onInputTabChange("photo")}
        >
          Tải ảnh
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={inputTab === "handwriting"}
          onClick={() => onInputTabChange("handwriting")}
        >
          Viết tay
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={inputTab === "latex"}
          onClick={() => onInputTabChange("latex")}
        >
          LaTeX
        </button>
        <button
          type="button"
          className="explore-v2-draw-tab"
          onClick={explainDrawing}
        >
          Vẽ trên biểu đồ
        </button>
        <button
          type="button"
          className="explore-v2-dock-close"
          aria-label="Đóng bảng nhập"
          onClick={() => onInputDockOpenChange(false)}
        >
          <X size={15} />
        </button>
      </div>
      <section className="explore-analysis-card">
        <div className="explore-v2-text-panel" hidden={inputTab !== "text"}>
          <label htmlFor="explore-problem">
            Nhập bài toán hoặc yêu cầu dựng hình
          </label>
          <textarea
            id="explore-problem"
            value={problemPrompt}
            onChange={(event) => changeProblem(event.target.value)}
            maxLength={8000}
            rows={5}
            placeholder="Ví dụ: Vẽ đồ thị y = x² − 2 và xác định đỉnh…"
          />
          <small>{problemPrompt.length}/8000</small>
          <TunnelSourceCorrection
            source={problemPrompt}
            disabled={busy}
            onConfirm={correctProblemSource}
          />
        </div>
        <div className="explore-image-actions" hidden={inputTab !== "photo"}>
          <label
            className="explore-image-button"
            htmlFor="explore-problem-image"
          >
            <ImagePlus size={15} />
            {recognizingImage ? "Đang đọc ảnh…" : "Đọc đề từ ảnh"}
          </label>
          <input
            id="explore-problem-image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={recognizingImage}
            onChange={(event) => {
              void recognizeUploadedImage(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <small>
            Chọn ảnh chụp bài toán. AI sẽ nhận dạng nội dung để bạn kiểm tra
            trước khi dựng hình.
          </small>
        </div>
        <div hidden={inputTab !== "handwriting"}>
          <HandwritingInputPad
            active={inputTab === "handwriting"}
            draft={handwritingDraft}
            history={handwritingHistory}
            onDraftChange={onHandwritingChange}
            onRecognized={(data) =>
              onRecognitionChange({ ...data, mode: "handwriting" })
            }
          />
        </div>
        <div className="explore-v2-latex-panel" hidden={inputTab !== "latex"}>
          <label htmlFor="explore-latex">Nhập công thức LaTeX</label>
          <textarea
            id="explore-latex"
            value={latexDraft}
            onChange={(event) => onLatexChange(event.target.value)}
            rows={4}
            placeholder="y = x^{2} - 2"
          />
          <button
            type="button"
            onClick={() => {
              changeProblem(latexDraft);
              onInputTabChange("text");
            }}
          >
            Dùng công thức này làm đề bài
          </button>
        </div>
        {recognitionDraft && (
          <section
            className="explore-recognition-draft"
            aria-label="Xác nhận đề đã nhận diện"
          >
            <header>
              <b>
                {recognitionDraft.mode === "handwriting"
                  ? "Kiểm tra chữ viết tay đã nhận diện"
                  : "Kiểm tra nội dung đọc từ ảnh"}
              </b>
              <button
                type="button"
                aria-label="Bỏ kết quả nhận diện"
                onClick={() => onRecognitionChange(null)}
              >
                <X size={15} />
              </button>
            </header>
            <img
              src={recognitionDraft.imageDataUrl}
              alt={
                recognitionDraft.mode === "handwriting"
                  ? "Nét viết tay vừa nhận diện"
                  : "Ảnh đề toán vừa tải lên"
              }
            />
            <label
              className="explore-recognition-label"
              htmlFor="explore-recognized-text"
            >
              Chữ và công thức nhận diện
            </label>
            <textarea
              id="explore-recognized-text"
              aria-label="Nội dung AI đọc được"
              value={recognitionDraft.transcription}
              maxLength={8000}
              onChange={(event) =>
                onRecognitionChange({
                  ...recognitionDraft,
                  transcription: event.target.value,
                })
              }
              rows={3}
            />
            <TunnelSourceCorrection
              source={recognitionDraft.transcription}
              disabled={busy}
              onConfirm={correctRecognitionSource}
            />
            <label
              className="explore-recognition-label"
              htmlFor="explore-recognized-figure"
            >
              Mô tả sơ đồ AI nhận diện
            </label>
            <textarea
              id="explore-recognized-figure"
              aria-label="Mô tả sơ đồ nhận diện"
              value={recognitionDraft.figureDescription}
              maxLength={1200}
              onChange={(event) =>
                onRecognitionChange({
                  ...recognitionDraft,
                  figureDescription: event.target.value,
                })
              }
              rows={3}
              placeholder="AI sẽ mô tả các điểm, cạnh, đường và quan hệ nhìn thấy…"
            />
            {recognitionDraft.ambiguities.length > 0 && (
              <p className="explore-recognition-warning">
                <b>Cần kiểm tra:</b> {recognitionDraft.ambiguities.join(" · ")}
              </p>
            )}
            <div className="explore-recognition-actions">
              <button
                type="button"
                onClick={() => {
                  changeProblem(recognitionDraft.transcription);
                  onRecognitionChange(null);
                  onInputTabChange("text");
                }}
              >
                Dùng phần chữ
              </button>
              <button
                type="button"
                className="rebuild"
                disabled={busy}
                onClick={rebuildRecognizedSketch}
              >
                <Sparkles size={14} />
                {busy
                  ? "Đang dựng lại…"
                  : recognitionHasDiagram(recognitionDraft)
                    ? "AI dựng hình từ ảnh"
                    : "Dựng hình từ dữ kiện"}
              </button>
            </div>
          </section>
        )}
        {inputTab === "text" && (
          <button
            className="explore-analyze-button"
            disabled={busy || !problemPrompt.trim()}
            onClick={() => askAgent()}
          >
            <Sparkles size={16} />
            {busy ? "Đang phân tích…" : "Phân tích đề bài"}
          </button>
        )}
      </section>
      {inputTab === "text" && (
        <details className="explore-v2-diagnostics">
          <summary>
            Nhận diện, kiểm tra &amp; lịch sử phiên <ChevronDown size={14} />
          </summary>
          <section className="explore-recognition-card">
            <header>
              <h3>
                {visual?.dimension === "3d" ? "Mô hình 3D" : "Đã nhận diện"}
              </h3>
              {recognition && (
                <span>
                  {sketchTitle ? "Dựng theo nét vẽ" : "Đã kiểm tra cấu trúc"}
                </span>
              )}
            </header>
            {recognition ? (
              <>
                <div className="explore-entity-list">
                  {recognition.entities.map((item, index) => (
                    <div
                      key={
                        "id" in item ? String(item.id) : `${item.kind}-${index}`
                      }
                      className={`entity-${item.kind}`}
                    >
                      <i />
                      {item.label}
                    </div>
                  ))}
                </div>
                <button
                  className="explore-edit-recognition"
                  onClick={editRecognition}
                >
                  <PenLine size={14} />
                  Chỉnh sửa nhận diện
                </button>
              </>
            ) : analysisStatus === "analyzing" ? (
              <p role="status">
                Đang phân tích đề, lập kế hoạch dựng hình và kiểm tra các quan
                hệ…
              </p>
            ) : analysisStatus === "error" ? (
              <p className="explore-analysis-error" role="alert">
                {analysisError}
              </p>
            ) : (
              <p>
                Phân tích đề bài để xem các đối tượng, quan hệ và ràng buộc mà
                hệ thống nhận diện.
              </p>
            )}
          </section>
          <section
            className={`explore-program-card ${recognition ? "valid" : analysisStatus === "error" ? "invalid" : ""}`}
          >
            <CheckCircle2 size={27} />
            <div>
              <b>
                {recognition
                  ? visual?.dimension === "3d"
                    ? "Mô hình 3D hợp lệ"
                    : "VisualProgram hợp lệ"
                  : analysisStatus === "analyzing"
                    ? "Đang kiểm tra cấu trúc"
                    : analysisStatus === "error"
                      ? visual?.dimension === "3d"
                        ? "Mô hình 3D chưa hợp lệ"
                        : "Chưa tạo được VisualProgram"
                      : visual?.dimension === "3d"
                        ? "Mô hình 3D sẵn sàng"
                        : "Chưa có VisualProgram"}
              </b>
              <span>
                {recognition
                  ? visual?.dimension === "3d"
                    ? `${recognition.objectCount} khối/mặt phẳng · ${recognition.parameterCount} tham số điều khiển`
                    : `${recognition.objectCount} đối tượng · ${recognition.freePointCount ? `${recognition.freePointCount} điểm kéo được` : `${recognition.parameterCount} tham số điều khiển`}`
                  : analysisStatus === "analyzing"
                    ? "Đang xác minh cấu trúc mô hình trước khi hiển thị."
                    : analysisStatus === "error"
                      ? "Mô hình cũ đã được gỡ; không hiển thị kết quả sai đề."
                      : visual?.dimension === "3d"
                        ? "Mẫu dựng đã được kiểm tra schema; có thể chọn đỉnh, cạnh, mặt và thay đổi tham số."
                        : "Mô hình chỉ được dựng sau khi cấu trúc được kiểm tra."}
              </span>
            </div>
          </section>
          {sessionHistory.length > 0 && (
            <section
              className="explore-session-history"
              aria-label="Lịch sử thao tác của phiên"
            >
              <header>
                <b>Lịch sử phiên này</b>
                <small>{sessionHistory.length} sự kiện</small>
              </header>
              <ol>
                {sessionHistory
                  .slice(-8)
                  .reverse()
                  .map(({ event, restorable }) => {
                    return (
                      <li key={event.id}>
                        <button
                          disabled={!restorable}
                          onClick={() => replaySessionEvent(event)}
                        >
                          <span>{event.label}</span>
                          <time>
                            {new Date(event.occurredAt).toLocaleTimeString(
                              "vi-VN",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </time>
                        </button>
                      </li>
                    );
                  })}
              </ol>
              <p>Chọn một mốc để khôi phục mô hình và thông số lúc đó.</p>
            </section>
          )}
        </details>
      )}
    </aside>
  );
}
