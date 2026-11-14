"use client";

import { unresolvedSourceMarks } from "@/lib/solve-source";
import { SOLVE_MODES } from "@/lib/solve-mode";
import { QUESTION_TYPES, type QuestionPreference } from "@/lib/solve-question";
import {
  ArrowRight,
  Check,
  FileImage,
  Keyboard,
  Sigma,
  PenLine,
  ImagePlus,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { FormattedAIAnswer } from "../FormattedMath";
import { TunnelSourceCorrection } from "../TunnelSourceCorrection";
import { SolveStartGuide } from "./SolveStartGuide";
import { tabDestination } from "./shared";
import type { SolveInputProps as Props } from "./view-contracts";
const HandwritingInputPad = dynamic(
  () => import("../HandwritingInputPad").then((m) => m.HandwritingInputPad),
  { ssr: false },
);
const FormulaDialog = dynamic(
  () => import("../ExamFormulaDialog").then((module) => module.ExamFormulaDialog),
  { ssr: false },
);
const sourceLimit = 8000;

export function SolveInputPanel(model: Props) {
  const {
    analyze,
    sourceConfirmed,
    confirmSource,
    busy,
    changeSolveMode,
    edit,
    handwritingDraft,
    handwritingHistory,
    hydrated,
    inputRevision,
    loadFailed,
    phase,
    prompt,
    questionType,
    recognition,
    recognize,
    chooseInputTab,
    changeHandwritingDraft,
    getSourceRevision,
    acceptHandwritingResult,
    clearSourceImage,
    confirmSourceCorrection,
    chooseQuestionType,
    useExample,
    solveMode,
    sourceLines,
    tab,
  } = model;
  const sourceInput = useRef<HTMLTextAreaElement>(null);
  const [formula, setFormula] = useState<{ start: number; end: number; latex: string } | null>(null);
  const sourceMarks = unresolvedSourceMarks(prompt);
  const acceptsFormula = tab === "text" || tab === "math";

  function openFormula() {
    const input = sourceInput.current;
    if (!input || !hydrated || busy) return;
    setFormula({ start: input.selectionStart, end: input.selectionEnd, latex: "" });
  }

  function closeFormula(start: number, end = start) {
    setFormula(null);
    requestAnimationFrame(() => {
      sourceInput.current?.focus();
      sourceInput.current?.setSelectionRange(start, end);
    });
  }

  function insertFormula() {
    if (!formula || !formula.latex.trim()) return;
    const { start, end, latex } = formula;
    const notation = "\\(" + latex.trim() + "\\)";
    const next = prompt.slice(0, start) + notation + prompt.slice(end);
    if (next.length > sourceLimit) return;
    edit(next);
    closeFormula(start + notation.length);
  }

  return (
    <>
      {!loadFailed && phase === "input" && (
        <div className="solve-input-layout">
          <section className="solve-input-card">
            <div className="solve-card-heading">
              <span className="solve-step-number">1</span>
              <div>
                <h2>Bạn muốn giải bài nào?</h2>
                <p>
                  Nhập một câu. Với đề dài, chọn và kiểm tra riêng câu cần giải.
                </p>
              </div>
            </div>
            <div
              className="solve-input-tabs"
              role="tablist"
              aria-label="Cách nhập đề"
            >
              {[
                ["text", "Gõ đề"],
                ["math", "Công thức / LaTeX"],
                ["hand", "Viết tay"],
                ["photo", "Ảnh đề"],
              ].map(([id, label]) => (
                <button
                  role="tab"
                  aria-selected={tab === id}
                  tabIndex={tab === id ? 0 : -1}
                  onKeyDown={(e) => {
                    const ids = ["text", "math", "hand", "photo"];
                    const next = tabDestination(e.key, ids, id);
                    if (next) {
                      e.preventDefault();
                      setFormula(null);
                      chooseInputTab(next);
                      document.getElementById(`solve-tab-${next}`)?.focus();
                    }
                  }}
                  aria-controls="solve-input-panel"
                  id={`solve-tab-${id}`}
                  key={id}
                  onClick={() => {
                    chooseInputTab(id);
                    if (id === "math") openFormula();
                    else setFormula(null);
                  }}
                >
                  {id === "text" ? (
                    <Keyboard size={17} aria-hidden="true" />
                  ) : id === "math" ? (
                    <Sigma size={17} aria-hidden="true" />
                  ) : id === "hand" ? (
                    <PenLine size={17} aria-hidden="true" />
                  ) : (
                    <ImagePlus size={17} aria-hidden="true" />
                  )}
                  {label}
                </button>
              ))}
            </div>
            <div
              id="solve-input-panel"
              role="tabpanel"
              aria-labelledby={`solve-tab-${tab}`}
            >
              <div hidden={tab !== "hand"}>
                <HandwritingInputPad
                  draft={handwritingDraft}
                  onDraftChange={changeHandwritingDraft}
                  history={handwritingHistory}
                  sourceRevision={inputRevision}
                  getSourceRevision={getSourceRevision}
                  active={tab === "hand"}
                  onRecognized={acceptHandwritingResult}
                />
              </div>
              {tab === "photo" && (
                <label className="solve-upload">
                  <FileImage size={24} />
                  <strong>Chọn ảnh đề toán</strong>
                  <span>
                    PNG, JPEG, WebP · tối đa 12 MB · ảnh được tối ưu trước khi
                    gửi
                  </span>
                  <input
                    aria-label="Tải ảnh đề"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!!busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void recognize(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {recognition && (
                <div className="solve-recognition">
                  <img
                    src={recognition.imageDataUrl}
                    alt="Nguồn đề cần kiểm tra"
                  />
                  <div className="solve-recognition-details">
                    <strong>Đọc từ nguồn · cần bạn kiểm tra</strong>
                    {recognition.ambiguities.length ? (
                      <div
                        className="solve-recognition-warnings"
                        tabIndex={0}
                        role="region"
                        aria-label="Những chỗ đọc chưa chắc chắn"
                      >
                        <ul>
                          {recognition.ambiguities.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p>
                        Kiểm tra dấu, hệ số và số mũ. AI nhận dạng có thể sai.
                      </p>
                    )}
                    {sourceLines.length > 1 && (
                      <label>
                        Chọn dòng từ ảnh để giải
                        <select
                          aria-label="Chọn câu từ ảnh"
                          defaultValue=""
                          onChange={(e) => edit(e.target.value)}
                        >
                          <option value="" disabled>
                            Chọn một câu…
                          </option>
                          {sourceLines.map((s, i) => (
                            <option value={s} key={i}>
                              {s.slice(0, 140)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <button onClick={clearSourceImage} aria-label="Ẩn ảnh nguồn">
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="solve-source-heading">
                <label className="solve-source-label" htmlFor="solve-source">
                  {acceptsFormula
                    ? "Đề bài cần giải"
                    : "Nội dung sẽ được phân tích (có thể sửa)"}
                </label>
                {acceptsFormula && (
                  <button type="button" className="solve-insert-formula" aria-haspopup="dialog"
                    disabled={!hydrated || !!busy}
                    onClick={openFormula}>
                    <Keyboard size={16} aria-hidden="true" />
                    Chèn công thức
                  </button>
                )}
              </div>
              <textarea
                ref={sourceInput}
                id="solve-source"
                maxLength={sourceLimit}
                disabled={!hydrated}
                value={prompt}
                onChange={(e) => edit(e.target.value)}
                placeholder="Ví dụ: x² − 5x + 6 = 0 hoặc 2x + 3 ≥ 7"
                rows={5}
                aria-describedby="solve-editor-help"
              />
              <div className="solve-editor-meta" id="solve-editor-help">
                <span>{tab === "math" ? "Gõ chữ trong ô đề và dùng Chèn công thức cho phần toán." : "Nhập một bài toán hoặc chọn một bài mẫu."}</span>
                <span>{prompt.length.toLocaleString("vi-VN")} / {sourceLimit.toLocaleString("vi-VN")}</span>
              </div>
              {acceptsFormula && /\\\([\s\S]+?\\\)/.test(prompt) && (
                <div className="solve-formula-preview" role="region" aria-label="Xem trước đề có công thức">
                  <strong>Xem trước đề</strong>
                  <FormattedAIAnswer text={prompt} />
                </div>
              )}
              {acceptsFormula && formula && (
                <FormulaDialog
                  value={formula.latex}
                  editing={false}
                  showInspection={tab === "math"}
                  maxLength={Math.max(0, Math.min(2000, sourceLimit - prompt.length + formula.end - formula.start - 4))}
                  onChange={(latex) => setFormula({ ...formula, latex })}
                  onInsert={insertFormula}
                  onClose={() => closeFormula(formula.start, formula.end)}
                />
              )}
              {(sourceMarks.length > 0 || recognition?.needsReview) && (
                <section
                  className="solve-source-gate"
                  aria-label="Kiểm tra dữ kiện chưa rõ"
                >
                  <strong>Kiểm tra dữ kiện trước khi giải</strong>
                  {!!sourceMarks.length && (
                    <>
                      <p>
                        Đề còn ký hiệu chưa đọc được. Chọn vị trí để sửa; hệ
                        thống không tự điền dữ kiện.
                      </p>
                      <ul>
                        {sourceMarks.map((mark, i) => (
                          <li key={i}>
                            <button
                              onClick={() => {
                                const input = document.getElementById(
                                  "solve-source",
                                ) as HTMLTextAreaElement | null;
                                input?.focus();
                                input?.setSelectionRange(mark.start, mark.end);
                              }}
                            >
                              Sửa chỗ “{mark.text}”
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {!!recognition?.ambiguities.length && (
                    <ul>
                      {recognition.ambiguities.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  {recognition?.needsReview && (
                    <label>
                      <input
                        type="checkbox"
                        checked={sourceConfirmed}
                        disabled={!!busy || sourceMarks.length > 0}
                        onChange={(event) =>
                          confirmSource(event.target.checked)
                        }
                      />
                      Tôi đã đối chiếu và sửa đúng nội dung, ký hiệu và dữ kiện
                      từ ảnh/nét viết.
                    </label>
                  )}
                </section>
              )}
              <TunnelSourceCorrection
                source={prompt}
                disabled={!hydrated || !!busy}
                onConfirm={confirmSourceCorrection}
              />
            </div>
            <div className="solve-options-row">
              <label className="solve-question-picker">
                Loại câu hỏi
                <select
                  aria-label="Loại câu hỏi"
                  value={questionType}
                  disabled={!hydrated || !!busy}
                  onChange={(event) => {
                    chooseQuestionType(
                      event.target.value as QuestionPreference,
                    );
                  }}
                >
                  {QUESTION_TYPES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <small>Chọn lại nếu hệ thống nhận diện chưa đúng.</small>
              </label>
              <fieldset
                className="solve-mode-picker"
                disabled={!hydrated || !!busy}
              >
                <legend>Cách trình bày lời giải</legend>
                {SOLVE_MODES.map((item) => (
                  <label
                    key={item.id}
                    className={solveMode === item.id ? "is-selected" : ""}
                  >
                    <input
                      type="radio"
                      name="solve-mode"
                      value={item.id}
                      checked={solveMode === item.id}
                      onChange={() => changeSolveMode(item.id)}
                    />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
            <footer className="solve-input-footer">
              <p>
                <Check size={15} /> Bạn được kiểm tra và chỉnh lại đề trước khi
                chọn cách giải.
              </p>
              <button
                className="solve-primary"
                disabled={
                  !prompt.trim() ||
                  !!busy ||
                  !hydrated ||
                  sourceMarks.length > 0 ||
                  (!!recognition?.needsReview && !sourceConfirmed)
                }
                onClick={() => void analyze()}
              >
                {busy === "analyze"
                  ? "Đang kiểm tra…"
                  : busy === "photo"
                    ? "Đang đọc ảnh…"
                    : "Phân tích & kiểm tra đề"}
                <ArrowRight size={16} />
              </button>
            </footer>
          </section>
          <SolveStartGuide useExample={useExample} />
        </div>
      )}
    </>
  );
}
