"use client";

import { type LearningTab } from "@/lib/model-learning";
import {
  ArrowRight,
  BookOpen,
  Box,
  CheckCircle2,
  PenLine,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { FormattedAIAnswer, FormattedExpression } from "../FormattedMath";
import { FloatingAiHeader } from "../FloatingAi";

import type { ExploreContextProps as Props } from "./view-contracts";
export function ExploreContextPanel(model: Props) {
  const {
    analysisResult,
    applySelectedCoordinates,
    askExploreAssistant,
    assistantAnswer,
    assistantBusy,
    assistantOpen,
    busy,
    coordinateDraft,
    displayGraphExpression,
    editSelectedCoordinate,
    informationOpen,
    lassoContext,
    learning,
    learningTab,
    lessonTitle,
    liveMetricChips,
    liveObservation,
    markStep,
    moveToStudio,
    objectLabelDraft,
    objectNoteDraft,
    parameterDetails,
    readout,
    reflectionPrompt,
    reset,
    saveSelectedAnnotation,
    selectedDetails,
    selectedObject,
    selectedPattern,
    closeAssistant,
    clearSelection,
    onCoordinateEditingChange,
    clearAssistantSelection,
    focusReadout,
    closeInformation,
    onLearningTabChange,
    onObjectLabelChange,
    onObjectNoteChange,
    changeReflectionPrompt,
    visual,
  } = model;
  return (
    <>
      {(assistantOpen || (informationOpen && visual)) && (
        <aside
          className={`legacy-guide-column legacy-context-sidebar explore-floating-panel floating-ai-panel ${assistantOpen ? "is-assistant-open" : ""} ${visual?.source?.key === "geometry-problem" ? "is-geometry-problem" : ""}`}
          role={assistantOpen ? "dialog" : undefined}
          aria-label={assistantOpen ? "Trợ giảng AI" : "Thông tin hình"}
        >
          <section className="context-knowledge-card">
            <button
              type="button"
              className="explore-information-close"
              aria-label="Đóng thông tin hình"
              onClick={closeInformation}
            >
              <X size={15} />
            </button>
            <header className="context-lesson-header">
              <span>
                <BookOpen size={16} /> Khám phá ·{" "}
                {analysisResult?.program
                  ? "Mô hình AI"
                  : selectedPattern?.topic ||
                    (visual ? "Toán học" : "Bảng trắng")}
              </span>
              <b>
                <i />
                {visual ? "Đang thực hành" : "Sẵn sàng"}
              </b>
            </header>
            <h2>{lessonTitle}</h2>
            {visual && analysisResult?.explanation && (
              <section
                className="explore-result-explanation"
                aria-label="Giải thích và giới hạn mô hình"
              >
                <b>
                  {analysisResult.source === "llm"
                    ? "AI đề xuất · cần đối chiếu dữ kiện"
                    : "Mô hình dựng theo dữ kiện"}
                </b>
                <FormattedAIAnswer text={analysisResult.explanation} />
                <small>
                  Kiểm tra cấu trúc dữ liệu không thay thế kiểm chứng mọi giả
                  thiết toán học. Số đo điều chỉnh/minh họa không tự trở thành
                  dữ kiện của đề.
                </small>
              </section>
            )}
            {visual ? (
              <>
                <div
                  className="context-tabs"
                  role="tablist"
                  aria-label="Thông tin mô hình"
                >
                  {(
                    [
                      { value: "Giới thiệu", label: "Tổng quan" },
                      { value: "Tính chất", label: "Tính chất" },
                      { value: "Ứng dụng", label: "Ứng dụng" },
                      { value: "Thử ví dụ", label: "Ví dụ" },
                    ] as Array<{ value: LearningTab; label: string }>
                  ).map((tab) => (
                    <button
                      key={tab.value}
                      role="tab"
                      id={`explore-tab-${tab.value}`}
                      aria-selected={learningTab === tab.value}
                      aria-controls="explore-learning-panel"
                      className={learningTab === tab.value ? "active" : ""}
                      onClick={() => {
                        markStep(
                          tab.value === "Thử ví dụ" || tab.value === "Ứng dụng"
                            ? "apply"
                            : tab.value === "Tính chất"
                              ? "observe"
                              : "explain",
                        );
                        onLearningTabChange(tab.value);
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div
                  className="context-learning-content"
                  id="explore-learning-panel"
                  role="tabpanel"
                  aria-labelledby={`explore-tab-${learningTab}`}
                >
                  <h3>{learning.title}</h3>
                  {learningTab === "Giới thiệu" && readout.formula && (
                    <div className="context-formula">
                      {visual?.source?.key === "geometry-problem" ? (
                        <div className="geometry-facts">
                          {readout.formula.split(" · ").map((fact, index) => (
                            <span key={`${fact}-${index}`}>{fact}</span>
                          ))}
                        </div>
                      ) : displayGraphExpression ? (
                        <FormattedExpression
                          expression={displayGraphExpression}
                        />
                      ) : (
                        <FormattedAIAnswer
                          text={
                            /\\(?:frac|sqrt|sin|cos|left|right|widehat)/.test(
                              readout.formula,
                            ) && !/[\$]|\\[([]/.test(readout.formula)
                              ? `$${readout.formula}$`
                              : readout.formula
                          }
                        />
                      )}
                    </div>
                  )}
                  <FormattedAIAnswer text={learning.lead} />
                  {readout.note && (
                    <p className="context-model-warning" role="status">
                      {readout.note}
                    </p>
                  )}
                  {learning.groups.map((group) => (
                    <div className="context-knowledge-group" key={group.label}>
                      <b>{group.label}</b>
                      <ul>
                        {group.items.map((item) => (
                          <li key={item}>
                            <FormattedAIAnswer text={item} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {visual?.source?.key === "geometry-problem" && (
                    <div className="geometry-derived-results">
                      <b>Kết quả suy ra từ hình hiện tại</b>
                      <div>
                        {readout.metrics
                          .filter(
                            (metric) =>
                              metric.label.includes("suy ra") ||
                              metric.label.includes("Kết quả ở"),
                          )
                          .map((metric) => (
                            <span key={metric.label}>
                              <small>{metric.label}</small>
                              <strong>{metric.value}</strong>
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {learningTab === "Giới thiệu" &&
                    parameterDetails.length > 0 && (
                      <div className="context-parameter-roles">
                        {parameterDetails.map((parameter) => (
                          <div key={parameter.id}>
                            <b>{parameter.label}</b>
                            <span>{parameter.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
                {(liveMetricChips.length > 0 || selectedDetails) && (
                  <div className="context-live-state">
                    <header>
                      <span>
                        <SlidersHorizontal size={15} /> Trạng thái hiện tại
                      </span>
                    </header>
                    <div>
                      {liveMetricChips.map((metric) => (
                        <b key={metric.label}>
                          {metric.label} ={" "}
                          {typeof metric.value === "number"
                            ? new Intl.NumberFormat("vi-VN", {
                                maximumFractionDigits: 2,
                              }).format(metric.value)
                            : metric.value}
                        </b>
                      ))}
                    </div>
                    <p>
                      <Sparkles size={14} />
                      {liveObservation}
                    </p>
                    {selectedDetails && (
                      <section className="explore-v2-selected-object">
                        <header>
                          <b>{selectedDetails.title}</b>
                          <button
                            type="button"
                            aria-label="Bỏ chọn đối tượng"
                            onClick={clearSelection}
                          >
                            <X size={13} />
                          </button>
                        </header>
                        <small>{selectedDetails.kind}</small>
                        {selectedDetails.details.map((detail) => (
                          <span key={detail}>{detail}</span>
                        ))}
                        {visual?.dimension === "2d" && selectedObject && (
                          <div className="selected-annotation-editor">
                            <label>
                              {selectedObject.type === "point"
                                ? "Tên đỉnh / đối tượng"
                                : selectedObject.type === "segment"
                                  ? "Tên cạnh / độ dài"
                                  : selectedObject.type === "angle"
                                    ? "Tên góc"
                                    : "Nhãn"}
                              <input
                                value={objectLabelDraft}
                                maxLength={100}
                                onChange={(event) =>
                                  onObjectLabelChange(event.target.value)
                                }
                                placeholder="Ví dụ: A, AB = 5 cm"
                              />
                            </label>
                            <label>
                              Ghi chú
                              <textarea
                                value={objectNoteDraft}
                                maxLength={200}
                                rows={2}
                                onChange={(event) =>
                                  onObjectNoteChange(event.target.value)
                                }
                                placeholder="Thêm thông tin cho đối tượng này"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={saveSelectedAnnotation}
                            >
                              <CheckCircle2 size={13} /> Lưu thông tin
                            </button>
                          </div>
                        )}
                        {selectedDetails.editable &&
                          selectedDetails.position && (
                            <div className="selected-coordinate-editor">
                              <label>
                                x
                                <input
                                  aria-label="Tọa độ x"
                                  type="number"
                                  step="0.1"
                                  value={
                                    coordinateDraft &&
                                    coordinateDraft.id === selectedObject?.id
                                      ? coordinateDraft.x
                                      : selectedDetails.position.x
                                  }
                                  onFocus={() => {
                                    onCoordinateEditingChange(true);
                                  }}
                                  onBlur={() => {
                                    onCoordinateEditingChange(false);
                                  }}
                                  onChange={(event) =>
                                    editSelectedCoordinate(
                                      "x",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              <label>
                                y
                                <input
                                  aria-label="Tọa độ y"
                                  type="number"
                                  step="0.1"
                                  value={
                                    coordinateDraft &&
                                    coordinateDraft.id === selectedObject?.id
                                      ? coordinateDraft.y
                                      : selectedDetails.position.y
                                  }
                                  onFocus={() => {
                                    onCoordinateEditingChange(true);
                                  }}
                                  onBlur={() => {
                                    onCoordinateEditingChange(false);
                                  }}
                                  onChange={(event) =>
                                    editSelectedCoordinate(
                                      "y",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                onClick={applySelectedCoordinates}
                              >
                                <PenLine size={13} /> Cập nhật
                              </button>
                            </div>
                          )}
                      </section>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </section>
          <section className="context-assistant-card">
            <FloatingAiHeader title="Trợ giảng Toán AI" onClose={closeAssistant} />
            <div className="explore-v2-ai-conversation">
              <div className="explore-v2-ai-context">
                <b>
                  <Sparkles size={13} />{" "}
                  {lassoContext
                    ? "Ngữ cảnh vùng đã khoanh"
                    : "Phân tích tức thì mô hình"}
                </b>
                {lassoContext && (
                  <>
                    <img
                      className="explore-ai-selection-image"
                      src={lassoContext.imageDataUrl}
                      alt="Vùng đồ thị được gửi làm ngữ cảnh cho câu hỏi"
                    />
                    <p>{lassoContext.region}</p>
                    <small>
                      {lassoContext.inkStrokeCount} nét phác ·{" "}
                      {lassoContext.objects.length} đối tượng được chọn
                    </small>
                    <button
                      type="button"
                      className="explore-clear-ai-selection"
                      onClick={clearAssistantSelection}
                    >
                      Bỏ vùng chọn khỏi câu hỏi
                    </button>
                  </>
                )}
                {!lassoContext && (
                  <>
                    <p>
                      {visual
                        ? liveObservation
                        : "Chưa có mô hình. Bạn có thể khoanh một phần bảng để hỏi AI về nét vẽ."}
                    </p>
                    <small>
                      {visual ? readout.formula : "Bảng trắng · JSXGraph"}
                    </small>
                  </>
                )}
              </div>
              <p>
                Hỏi về công thức, tính chất hoặc điều bạn đang quan sát trên
                hình.
              </p>
              <div className="explore-v2-ai-suggestions">
                <span>GỢI Ý CÂU HỎI NHANH:</span>
                {[
                  "Tìm nghiệm (giao điểm Ox)",
                  "Khảo sát tính đồng biến / nghịch biến",
                  "Điều gì xảy ra khi thay đổi tham số?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => changeReflectionPrompt(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {assistantAnswer && (
                <div className="context-ai-answer">
                  <span>
                    <Sparkles size={14} /> PHẢN HỒI AI
                  </span>
                  <FormattedAIAnswer text={assistantAnswer.answer} />
                  <div>
                    <b>Bằng chứng</b>
                    <FormattedAIAnswer text={assistantAnswer.evidence} />
                  </div>
                  {assistantAnswer.nextQuestion && (
                    <button
                      onClick={() =>
                        changeReflectionPrompt(
                          assistantAnswer.nextQuestion || "",
                        )
                      }
                    >
                      {assistantAnswer.nextQuestion}
                      <ArrowRight size={14} />
                    </button>
                  )}
                  <button
                    className="context-focus-model"
                    disabled={!readout.focus.length}
                    onClick={focusReadout}
                  >
                    Xem trên mô hình <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="explore-v2-ai-compose">
              <label htmlFor="explore-question">Câu hỏi của bạn</label>
              <textarea
                id="explore-question"
                value={reflectionPrompt}
                onChange={(event) => {
                  changeReflectionPrompt(event.target.value);
                }}
                rows={2}
                maxLength={2000}
                placeholder={
                  lassoContext
                    ? "Hỏi về phần bạn vừa khoanh…"
                    : "Hỏi AI bất kỳ điều gì về mô hình này…"
                }
              />
              <button
                className="legacy-primary"
                disabled={
                  assistantBusy ||
                  (!visual && !lassoContext) ||
                  !reflectionPrompt.trim()
                }
                onClick={askExploreAssistant}
              >
                {assistantBusy ? "Đang trả lời…" : "Gửi"}
                <Send size={15} />
              </button>
            </div>
          </section>
          <div className="legacy-bottom-actions">
            <button
              className="legacy-primary"
              disabled={busy || !visual}
              onClick={moveToStudio}
            >
              <Box size={16} /> Chuyển sang Soạn bài
            </button>
            <button onClick={reset}>
              <RotateCcw size={16} /> Đặt lại
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
