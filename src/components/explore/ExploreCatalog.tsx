"use client";

import {
  BookOpen,
  Box,
  CheckCircle2,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";

import type { ExploreCatalogProps as Props } from "./view-contracts";
export function ExploreCatalog(model: Props) {
  const {
    assistantOpen,
    hasPreviousSession,
    busy,
    catalogBusy,
    choosePattern,
    filtered,
    informationOpen,
    moveToStudio,
    query,
    resumePreviousSession,
    selected,
    changeQuery,
    chooseTopic,
    showSelectedOnly,
    toggleSelectionOnly,
    toggleInformation,
    openTextInput,
    topic,
    topics,
    hasVisual,
  } = model;
  return (
    <section
      className="legacy-model-rail explore-v2-catalog"
      aria-label="Danh mục chủ đề và mô hình"
    >
      <div className="legacy-topic-tabs">
        <button
          type="button"
          className={topic === "Tất cả" && !showSelectedOnly ? "active" : ""}
          onClick={() => {
            chooseTopic("Tất cả");
          }}
        >
          Tất cả
        </button>
        <button
          type="button"
          className={showSelectedOnly ? "active" : ""}
          onClick={toggleSelectionOnly}
        >
          Bảng chọn
        </button>
        {topics
          .filter((item) => item !== "Tất cả")
          .map((item) => (
            <button
              type="button"
              key={item}
              className={topic === item ? "active" : ""}
              onClick={() => {
                chooseTopic(item);
              }}
            >
              {item}
            </button>
          ))}
        <label>
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="Tìm mô hình…"
          />
        </label>
      </div>
      <div className="legacy-rail-status">
        <span>
          <Sparkles size={13} /> Không gian khám phá động
        </span>
        <b>
          {catalogBusy
            ? "Đang tải thư viện…"
            : `${filtered.length} mô hình trực quan`}
        </b>
        <div className="explore-v2-rail-actions">
          {hasPreviousSession && (
            <button type="button" onClick={resumePreviousSession}>
              <RotateCcw size={14} />
              Tiếp tục phiên đã lưu
            </button>
          )}
          {hasVisual && (
            <button
              type="button"
              className="explore-information-trigger"
              title="Thông tin hình"
              aria-pressed={informationOpen && !assistantOpen}
              onClick={toggleInformation}
            >
              <BookOpen size={14} />
              Thông tin hình
            </button>
          )}
          <button
            className="explore-v2-start"
            type="button"
            onClick={openTextInput}
          >
            <Sparkles size={14} />
            Nhập đề
          </button>
          <button
            className="explore-v2-compose"
            type="button"
            disabled={busy || !hasVisual}
            onClick={moveToStudio}
          >
            <Box size={14} />
            Soạn bài
          </button>
        </div>
      </div>
      <div className="legacy-model-pills">
        <em>MÔ HÌNH:</em>
        <button
          type="button"
          className={!selected ? "active" : ""}
          onClick={() => choosePattern("")}
        >
          <i />
          Bảng trắng
        </button>
        {filtered.map((item) => (
          <button
            type="button"
            key={item.key}
            className={selected === item.key ? "active" : ""}
            onClick={() => choosePattern(item.key)}
          >
            <i />
            <span>{item.title}</span>
            {selected === item.key && <CheckCircle2 size={16} />}
          </button>
        ))}
      </div>
    </section>
  );
}
