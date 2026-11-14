"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Sigma, X } from "lucide-react";
import { MathInput } from "./MathInput";
import { useDockedMathKeyboard } from "./useDockedMathKeyboard";

export function BoardNoteEditor({
  value,
  onChange,
  fontSize,
  onSave,
  onClose,
}: {
  value: string;
  onChange: (text: string) => void;
  fontSize: number;
  onSave: (size: number) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState(fontSize),
    [showMath, setShowMath] = useState(false),
    [equation, setEquation] = useState("");
  const { keyboardHost, keyboardHeight, connectKeyboard } = useDockedMathKeyboard(showMath);
  function focusEquation(field: HTMLElement) {
    connectKeyboard(field);
    requestAnimationFrame(() =>
      field
        .closest(".board-note-equation")
        ?.scrollIntoView({ block: "nearest" }),
    );
  }
  const dialog = useRef<HTMLDivElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null),
    selection = useRef({ start: value.length, end: value.length });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    textarea.current?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, []);
  function insert() {
    const { start, end } = selection.current,
      text = `${start > 0 && !/\s/.test(value[start - 1]) ? " " : ""}$${equation}$${end < value.length && !/\s/.test(value[end]) ? " " : ""}`,
      next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    selection.current = {
      start: start + text.length,
      end: start + text.length,
    };
    setEquation("");
    setShowMath(false);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(
        selection.current.start,
        selection.current.end,
      );
    });
  }
  return createPortal(
    <div
      className={`board-note-backdrop ${keyboardHeight > 0 ? "is-keyboard-open" : ""}`}
      style={
        {
          "--board-keyboard-height": `${keyboardHeight}px`,
        } as React.CSSProperties
      }
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-note-title"
        aria-owns={showMath ? "board-note-keyboard" : undefined}
        className="board-note-dialog"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            onSave(size);
          }
          if (e.key === "Tab") {
            const nodes = Array.from(
              dialog.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled),textarea,input,math-field,[tabindex="0"]',
              ) || [],
            ).filter((n) => n.getClientRects().length);
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <span className="board-note-editor-icon">
            <Sigma size={20} />
          </span>
          <div>
            <h2 id="board-note-title">Chữ & công thức</h2>
            <p>Thêm lời giải thích ngay bên cạnh hình vẽ.</p>
          </div>
          <button aria-label="Đóng sửa nội dung" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="board-note-editor-body">
          <label htmlFor="board-note-text">Nội dung</label>
          <textarea
            id="board-note-text"
            ref={textarea}
            aria-label="Sửa chữ và công thức"
            value={value}
            rows={5}
            onChange={(e) => onChange(e.target.value)}
            onSelect={(e) => {
              selection.current = {
                start: e.currentTarget.selectionStart,
                end: e.currentTarget.selectionEnd,
              };
            }}
            placeholder="Ví dụ: Tam giác ABC cân tại A. $AB = AC$"
          />
          <div className="board-note-editor-options">
            <button
              onClick={() => setShowMath(!showMath)}
              aria-expanded={showMath}
            >
              <Plus size={15} />
              Chèn công thức
            </button>
            <label>
              Cỡ chữ
              <select
                aria-label="Cỡ chữ nội dung"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              >
                {[...new Set([14, 16, 18, 20, 24, 28, 32, fontSize])]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {showMath && (
            <div className="board-note-equation">
              <MathInput
                value={equation}
                onChange={setEquation}
                onReady={focusEquation}
              />
              <button disabled={!equation.trim()} onClick={insert}>
                <Plus size={14} />
                Chèn vào nội dung
              </button>
            </div>
          )}
          <p className="board-note-editor-help">
            Chèn công thức tại vị trí con trỏ. Có thể viết LaTeX trong $…$.
          </p>
        </div>
        <footer>
          <span>Ctrl + Enter để lưu</span>
          <button onClick={onClose}>Hủy</button>
          <button className="board-note-save" onClick={() => onSave(size)}>
            <Check size={15} />
            Xong
          </button>
        </footer>
      </div>
      <div
        id="board-note-keyboard"
        ref={keyboardHost}
        className="math-keyboard-host"
        role="group"
        aria-label="Bàn phím công thức"
      />
    </div>,
    document.body,
  );
}
