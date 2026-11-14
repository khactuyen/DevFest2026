"use client";
import { useEffect, useRef, useState } from "react";
export function MathInput({
  onChange,
  value: controlledValue,
  onReady,
  equationOnly = false,
}: {
  onChange: (latex: string) => void;
  value?: string;
  onReady?: (field: HTMLElement) => void;
  equationOnly?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef(onChange);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const fieldRef = useRef<(HTMLElement & { value: string }) | null>(null);
  const controlledRef = useRef(controlledValue);
  controlledRef.current = controlledValue;
  const [value, setValue] = useState(""),
    [result, setResult] = useState("");
  cb.current = onChange;
  useEffect(() => {
    let disposed = false;
    let field: (HTMLElement & { value: string }) | undefined;
    import("mathlive").then(({ MathfieldElement }) => {
      if (disposed) return;
      MathfieldElement.fontsDirectory = "/mathlive/fonts";
      field = new MathfieldElement();
      fieldRef.current = field;
      field.value = controlledRef.current ?? "";
      setValue(field.value);
      field.setAttribute("aria-label", "Nhập công thức toán");
      field.setAttribute("math-virtual-keyboard-policy", "manual");
      field.addEventListener("input", () => {
        setValue(field!.value);
        cb.current(field!.value);
      });
      host.current?.appendChild(field);
      readyRef.current?.(field);
    });
    return () => {
      disposed = true;
      field?.remove();
      fieldRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (controlledValue === undefined) return;
    if (fieldRef.current && fieldRef.current.value !== controlledValue)
      fieldRef.current.value = controlledValue;
    setValue(controlledValue);
    setResult("");
  }, [controlledValue]);
  return (
    <div>
      <div className="math-input" ref={host} />
      {!equationOnly && <button
        className="subtle"
        disabled={!value}
        onClick={async () => {
          try {
            const { inspectMath } = await import("@/lib/math");
            const r = await inspectMath(value);
            setResult(`Rút gọn: ${r.simplified} · Giá trị: ${r.numeric}`);
          } catch (e) {
            setResult((e as Error).message);
          }
        }}
      >
        Kiểm tra / rút gọn công thức
      </button>}
      {result && <p className="muted">{result}</p>}
    </div>
  );
}
