"use client";

import { useId, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Keyboard, X } from "lucide-react";
import { MathInput } from "./MathInput";
import { useDockedMathKeyboard } from "./useDockedMathKeyboard";

const shortcuts = [
  ["Phân số", "\\frac{a}{b}"],
  ["Căn thức", "\\sqrt{x}"],
  ["Hệ phương trình", "\\begin{cases}x+y=3\\\\x-y=1\\end{cases}"],
  ["Tích phân", "\\int_0^1 f(x)\\,dx"],
  ["Giới hạn", "\\lim_{x\\to0} f(x)"],
] as const;

export function ExamFormulaDialog({ value, editing, maxLength = 2000, showInspection = false, onChange, onInsert, onClose }: {
  value: string;
  editing: boolean;
  maxLength?: number;
  showInspection?: boolean;
  onChange: (value: string) => void;
  onInsert: () => void;
  onClose: () => void;
}) {
  const titleId = useId(), keyboardId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const { keyboardHost, keyboardHeight, connectKeyboard, showKeyboard } = useDockedMathKeyboard();
  const valid = Boolean(value.trim()) && value.length <= maxLength;
  return createPortal(
    <div className={`exam-formula-backdrop${keyboardHeight ? " is-keyboard-open" : ""}`}
      style={{ "--exam-keyboard-height": `${keyboardHeight}px` } as CSSProperties}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key === "Tab") {
          const targets = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, math-field") ?? [])]
            .filter((item) => item.getClientRects().length);
          const first = targets[0], last = targets.at(-1);
          if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          }
        }
      }}>
      <div ref={dialog} className="exam-formula-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-owns={keyboardId}>
        <header>
          <h2 id={titleId}>{editing ? "Sửa công thức" : "Chèn công thức"}</h2>
          <button type="button" aria-label="Đóng công thức" autoFocus onClick={onClose}><X size={17} /></button>
        </header>
        <div className="exam-formula-panel">
          <MathInput equationOnly={!showInspection} value={value} onChange={onChange} onReady={connectKeyboard} />
          <label>Mã LaTeX<input value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} /></label>
          {value.length > maxLength && <p role="status">Công thức vượt quá số ký tự còn lại.</p>}
          <div className="exam-rich-toolbar exam-formula-shortcuts">
            {shortcuts.map(([label, latex]) => <button key={label} type="button" onClick={() => onChange(latex)}>{label}</button>)}
          </div>
        </div>
        <footer>
          {!keyboardHeight && <button type="button" onClick={showKeyboard}><Keyboard size={16} /> Bàn phím</button>}
          <button type="button" className="exam-formula-apply" disabled={!valid} onClick={onInsert}>
            {editing ? "Cập nhật công thức" : "Chèn công thức"}
          </button>
        </footer>
      </div>
      <div id={keyboardId} ref={keyboardHost} className="math-keyboard-host" role="group" aria-label="Bàn phím công thức" />
    </div>,
    document.body,
  );
}
