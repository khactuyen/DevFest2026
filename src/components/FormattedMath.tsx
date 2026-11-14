"use client";
import { Fragment, useEffect, useRef } from "react";

type Part =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };
export function splitFormattedMath(text: string): Part[] {
  const parts: Part[] = [];
  const math =
    /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$((?:\\.|[^$\n])+?)\$/g;
  let cursor = 0;
  for (const match of text.matchAll(math)) {
    const index = match.index ?? 0;
    if (index > cursor)
      parts.push({ type: "text", value: text.slice(cursor, index) });
    parts.push({
      type: "math",
      value: (match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").trim(),
      display: match[1] !== undefined || match[3] !== undefined,
    });
    cursor = index + match[0].length;
  }
  if (cursor < text.length)
    parts.push({ type: "text", value: text.slice(cursor) });
  return parts.length ? parts : [{ type: "text", value: text }];
}
/** Shared read-only renderer; source text is never injected as HTML. */
export function FormattedAIAnswer({
  text,
  compactDisplaySpacing = false,
  as: Tag = "div",
  className = "",
}: {
  text: string;
  compactDisplaySpacing?: boolean;
  as?: "div" | "span" | "p";
  className?: string;
}) {
  const parts = splitFormattedMath(text);
  const displayedText = (value: string, index: number) => {
    if (!compactDisplaySpacing) return value;
    const before = parts[index - 1],
      after = parts[index + 1];
    // Display equations already start/end a block. Source newlines next to
    // them otherwise create empty anonymous lines in pre-wrapped documents.
    if (before?.type === "math" && before.display)
      value = value.replace(/^[\t \r\n]+/, "");
    if (after?.type === "math" && after.display)
      value = value.replace(/[\t \r\n]+$/, "");
    return value;
  };
  return (
    <Tag className={`formatted-ai-answer ${className}`}>
      {parts.map((part, index) =>
        part.type === "text" ? (
          <Fragment key={index}>{displayedText(part.value, index)}</Fragment>
        ) : part.display ? (
          <span className="formatted-ai-display-math" key={index}>
            <InlineMath latex={part.value} />
          </span>
        ) : (
          <InlineMath key={index} latex={part.value} />
        ),
      )}
    </Tag>
  );
}
/** Read-only display for the validated arithmetic syntax used by graph expressions. */
export function FormattedExpression({ expression }: { expression: string }) {
  return (
    <div className="formatted-ai-answer">
      <InlineMath latex={`y=${expression}`} ascii />
    </div>
  );
}
export function InlineMath({ latex, ascii = false }: { latex: string; ascii?: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let disposed = false,
      field: (HTMLElement & { value: string; readOnly: boolean }) | undefined;
    import("mathlive")
      .then(({ MathfieldElement, convertAsciiMathToLatex }) => {
        if (disposed) return;
        MathfieldElement.fontsDirectory = "/mathlive/fonts";
        field = new MathfieldElement();
        field.value = ascii ? convertAsciiMathToLatex(latex) : latex;
        field.readOnly = true;
        field.setAttribute("aria-label", `Công thức ${latex}`);
        field.classList.add("formatted-ai-math-field");
        host.current?.replaceChildren(field);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      field?.remove();
    };
  }, [latex, ascii]);
  return (
    <span className="formatted-ai-math" ref={host}>
      {latex}
    </span>
  );
}
