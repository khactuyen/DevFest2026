"use client";

import { Node, type JSONContent } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef, useState } from "react";
import { ExamPromptSchema, type ExamPrompt } from "@/lib/exam-document";
import { FormattedAIAnswer, InlineMath, splitFormattedMath } from "./FormattedMath";
import { ExamFormulaDialog } from "./ExamFormulaDialog";

const marks = { bold: "bold", italic: "italic", underline: "underline" } as const;
const Formula = Node.create({
  name: "examFormula",
  inline: true,
  group: "inline",
  atom: true,
  addAttributes: () => ({ latex: { default: "" } }),
  parseHTML: () => [{ tag: "span[data-exam-formula]", getAttrs: (node) => ({ latex: (node as HTMLElement).dataset.examFormula || "" }) }],
  renderHTML: ({ node }) => ["span", { "data-exam-formula": node.attrs.latex }, node.attrs.latex],
  addNodeView: () => ReactNodeViewRenderer(({ node }) => (
      <NodeViewWrapper as="span" className="exam-equation-node" contentEditable={false}>
        <InlineMath latex={node.attrs.latex} />
      </NodeViewWrapper>
  ), { as: "span" }),
});

function toEditor(prompt: ExamPrompt): JSONContent {
  return { type: "doc", content: prompt.map((paragraph) => ({
    type: "paragraph",
    content: paragraph.filter((run) => run.type !== "text" || run.text.length).map((run) => run.type === "formula"
      ? { type: "examFormula", attrs: { latex: run.latex } }
      : { type: "text", text: run.text, marks: run.marks?.map((mark) => ({ type: marks[mark] })) }),
  })) };
}

function readEditor(doc: JSONContent): ExamPrompt {
  return (doc.content || []).map((paragraph) => (paragraph.content || []).flatMap<ExamPrompt[number][number]>((run) => {
    if (run.type === "examFormula") return [{ type: "formula", latex: String(run.attrs?.latex || "") }];
    if (run.type === "hardBreak") return [{ type: "text", text: "\n" }];
    if (!run.text) return [];
    return [{ type: "text", text: run.text, marks: run.marks?.flatMap(({ type }) => type in marks ? [type as keyof typeof marks] : []) }];
  }));
}

export function ExamPromptDisplay({ prompt, content }: { prompt?: ExamPrompt; content: string }) {
  if (!prompt) return <FormattedAIAnswer text={content} />;
  return <div className="exam-rich-prompt">{prompt.map((paragraph, index) => <p key={index}>
    {paragraph.length ? paragraph.map((run, key) => run.type === "formula" ? <InlineMath key={key} latex={run.latex} />
      : <span key={key} style={{ fontWeight: run.marks?.includes("bold") ? "bold" : undefined,
        fontStyle: run.marks?.includes("italic") ? "italic" : undefined,
        textDecoration: run.marks?.includes("underline") ? "underline" : undefined }}>
        {splitFormattedMath(run.text).map((part, index) => part.type === "math"
          ? <InlineMath key={index} latex={part.value} /> : part.value)}
      </span>) : <br />}
  </p>)}</div>;
}

export function ExamPromptEditor({ prompt, content, label, onChange }: {
  prompt?: ExamPrompt;
  content: string;
  label: string;
  onChange: (prompt: ExamPrompt) => void;
}) {
  const [formula, setFormula] = useState<string | null>(null);
  const [formulaPosition, setFormulaPosition] = useState<number | null>(null);
  const [error, setError] = useState("");
  const formulaOpener = useRef<HTMLElement | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    autofocus: "end",
    extensions: [StarterKit.configure({
      heading: false, bulletList: false, orderedList: false, blockquote: false, codeBlock: false,
      code: false, strike: false, horizontalRule: false, link: false,
    }), Formula],
    content: toEditor(prompt || content.split("\n").map((line) => splitFormattedMath(line).map((part) =>
      part.type === "math" && part.value && part.value.length <= 2000
        ? { type: "formula", latex: part.value }
        : { type: "text", text: part.type === "math" ? `$${part.value}$` : part.value }))),
    editorProps: { attributes: { "aria-label": label, role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor: active }) => {
      const next = ExamPromptSchema.safeParse(readEditor(active.getJSON()));
      if (next.success) { setError(""); onChange(next.data); }
      else setError("Nội dung câu hỏi vượt giới hạn. Hãy rút gọn để lưu thay đổi.");
    },
  });
  const activeMarks = useEditorState({
    editor,
    selector: ({ editor: active }) => {
      const formulas: { latex: string; position: number }[] = [];
      active?.state.doc.descendants((node, position) => {
        if (node.type.name === "examFormula") formulas.push({ latex: node.attrs.latex, position });
      });
      return { bold: active?.isActive("bold"), italic: active?.isActive("italic"), underline: active?.isActive("underline"), formulas };
    },
  });
  return <div className="exam-prompt-editor">
    <div className="exam-rich-toolbar" role="group" aria-label="Định dạng nội dung câu">
      <button type="button" aria-label="In đậm" aria-pressed={activeMarks?.bold || false} onClick={() => editor?.chain().focus().toggleBold().run()}><b>B</b></button>
      <button type="button" aria-label="In nghiêng" aria-pressed={activeMarks?.italic || false} onClick={() => editor?.chain().focus().toggleItalic().run()}><i>I</i></button>
      <button type="button" aria-label="Gạch chân" aria-pressed={activeMarks?.underline || false} onClick={() => editor?.chain().focus().toggleUnderline().run()}><u>U</u></button>
      <button type="button" onClick={() => editor?.chain().focus().undo().run()}>Hoàn tác</button>
      <button type="button" onClick={() => editor?.chain().focus().redo().run()}>Làm lại</button>
      <button type="button" onClick={(event) => {
        formulaOpener.current = event.currentTarget;
        setFormula(formula === null ? "" : null);
        setFormulaPosition(null);
      }}>ƒx Công thức</button>
      {!!activeMarks?.formulas.length && <select aria-label="Sửa công thức" value={formulaPosition ?? ""} onChange={(event) => {
        formulaOpener.current = event.currentTarget;
        const selected = activeMarks.formulas.find((item) => String(item.position) === event.target.value);
        setFormula(selected?.latex ?? null);
        setFormulaPosition(selected?.position ?? null);
      }}>
        <option value="">Sửa công thức…</option>
        {activeMarks.formulas.map((item, index) => <option key={item.position} value={item.position}>Công thức {index + 1} · {item.latex.slice(0, 35)}</option>)}
      </select>}
    </div>
    <EditorContent editor={editor} />
    {formula !== null && <ExamFormulaDialog value={formula} editing={formulaPosition !== null} onChange={setFormula}
      onClose={() => {
        setFormula(null);
        setFormulaPosition(null);
        formulaOpener.current?.focus();
      }}
      onInsert={() => {
          const node = { type: "examFormula", attrs: { latex: formula.trim() } };
          if (formulaPosition !== null) {
            if (editor?.state.doc.nodeAt(formulaPosition)?.type.name !== "examFormula") {
              setError("Vị trí công thức đã thay đổi. Chọn lại công thức để sửa.");
              setFormula(null);
              setFormulaPosition(null);
              return;
            }
            editor.chain().focus().insertContentAt({ from: formulaPosition, to: formulaPosition + 1 }, node).run();
          } else editor?.chain().focus().insertContent(node).run();
          setFormula(null);
          setFormulaPosition(null);
      }} />}
    {error && <p role="alert">{error}</p>}
  </div>;
}
