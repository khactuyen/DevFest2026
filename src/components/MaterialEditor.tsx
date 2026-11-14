"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  EditorContent,
  useEditor,
  ReactNodeViewRenderer,
  NodeViewWrapper,
} from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import { Visual } from "./Visual";
import type { Material } from "@/lib/contracts";
import { request } from "@/lib/client";
import {
  Save,
  Globe,
  Eye,
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  Plus,
  Printer,
} from "lucide-react";
import { MaterialShare } from "./MaterialShare";
import { MaterialReader } from "./MaterialReader";
import { pattern, patternNames } from "@/lib/patterns";
import { validateVisual } from "@/lib/validation";
const VisualContext = createContext<Material["visuals"]>([]);
function toEditor(material: Material): JSONContent {
  return {
    type: "doc",
    content: material.blocks.map((b) =>
      b.type === "visual"
        ? {
            type: "visualBlock",
            attrs: { visualId: b.visualId, caption: b.content, blockId: b.id },
          }
        : {
            type: b.type === "heading" ? "heading" : "paragraph",
            attrs: {
              ...(b.type === "heading" ? { level: 2 } : {}),
              blockType: b.type,
              blockId: b.id,
            },
            content: b.content ? [{ type: "text", text: b.content }] : [],
          },
    ),
  };
}
function textOf(node: JSONContent): string {
  return (
    (node.text || "") +
    (node.content?.map(textOf).join(node.type === "doc" ? "\n" : "") || "")
  );
}
export function MaterialEditor({ id }: { id: string }) {
  const [material, setMaterial] = useState<Material | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    request<Material>(`/api/materials/${id}?edit=1`)
      .then(setMaterial)
      .catch((e) => setError(e.message));
  }, [id]);
  return error ? (
    <p className="error">{error}</p>
  ) : material ? (
    <Editor material={material} />
  ) : (
    <p className="empty">Đang mở bản nháp…</p>
  );
}
function Editor({ material: initial }: { material: Material }) {
  const router = useRouter(),
    [material, setMaterial] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(false),
    [dirty, setDirty] = useState(false),
    [visualId, setVisualId] = useState(initial.visuals[0]?.id || ""),
    [json, setJson] = useState("");
  const visualStore = useRef(material.visuals);
  visualStore.current = material.visuals;
  const extension = useMemo(
    () =>
      Node.create({
        name: "visualBlock",
        group: "block",
        atom: true,
        draggable: true,
        addAttributes() {
          return {
            visualId: { default: "" },
            caption: { default: "" },
            blockId: { default: "" },
          };
        },
        parseHTML() {
          return [{ tag: "div[data-visual-id]" }];
        },
        renderHTML({ HTMLAttributes }) {
          return [
            "div",
            mergeAttributes(
              { "data-visual-id": HTMLAttributes.visualId },
              HTMLAttributes,
            ),
          ];
        },
        addNodeView() {
          return ReactNodeViewRenderer(function VisualNode({ node }) {
            const visuals = useContext(VisualContext);
            const spec = visuals.find((v) => v.id === node.attrs.visualId);
            return (
              <NodeViewWrapper className="editor-visual" data-drag-handle>
                <div className="visual-reference">
                  VisualBlock · {node.attrs.visualId}
                </div>
                {spec ? (
                  <Visual spec={spec} compact />
                ) : (
                  <p role="alert">Visual bị thiếu</p>
                )}
                <small>{node.attrs.caption}</small>
              </NodeViewWrapper>
            );
          });
        },
      }),
    [],
  );
  const semantic = useMemo(
    () =>
      Node.create({
        name: "blockSemantics",
        addGlobalAttributes() {
          return [
            {
              types: ["paragraph", "heading"],
              attributes: {
                blockType: { default: null },
                blockId: { default: null },
              },
            },
          ];
        },
      }),
    [],
  );
  const editor = useEditor(
    {
      extensions: [StarterKit, extension, semantic],
      content: toEditor(initial),
      immediatelyRender: false,
      onUpdate() {
        setDirty(true);
      },
    },
    [extension, semantic],
  );
  const build = useCallback(() => {
    const content = editor?.getJSON().content || [];
    const blocks: Material["blocks"] = content.map((n, i) => {
      const id = String(n.attrs?.blockId || `editor_block_${i}`);
      if (n.type === "visualBlock")
        return {
          id,
          type: "visual",
          content: n.attrs?.caption || "",
          visualId: n.attrs?.visualId,
        };
      return {
        id,
        type:
          n.type === "heading"
            ? "heading"
            : ["math", "exercise", "callout"].includes(n.attrs?.blockType)
              ? n.attrs?.blockType
              : "paragraph",
        content: textOf(n),
      };
    });
    return { ...material, blocks };
  }, [editor, material]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  async function save() {
    const next = await request<Material>(`/api/materials/${material.id}`, {
      method: "PATCH",
      body: JSON.stringify(build()),
    });
    setMaterial(next);
    setDirty(false);
    return next;
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function update(patch: Partial<Material>) {
    setMaterial((m) => ({ ...m, ...patch }));
    setDirty(true);
  }
  function move(direction: number) {
    if (!editor) return;
    const content = [...(editor.getJSON().content || [])];
    const index = editor.state.selection.$from.index(0),
      target = index + direction;
    if (target < 0 || target >= content.length) return;
    [content[index], content[target]] = [content[target], content[index]];
    editor.commands.setContent({ type: "doc", content });
    setDirty(true);
  }
  return (
    <>
      <header className="topbar">
        <span>
          Học liệu <span className="slash">/</span>{" "}
          <strong>{preview ? "Xem trước" : "Biên soạn"}</strong>{" "}
          <span className="tag">
            {dirty
              ? "Chưa lưu"
              : material.status === "published"
                ? "Đã xuất bản"
                : "Bản nháp"}
          </span>
        </span>
        <div className="actions">
          <button className="outline" onClick={() => setPreview(!preview)}>
            <Eye size={15} />
            {preview ? "Chỉnh sửa" : "Xem trước"}
          </button>
          <button
            className="outline"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await save();
                setMessage("Đã lưu bản nháp.");
              })
            }
          >
            <Save size={15} /> Lưu
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await save();
                const next = await request<Material>(
                  `/api/materials/${material.id}/publish`,
                  {
                    method: "POST",
                    body: JSON.stringify({
                      published: material.status !== "published",
                    }),
                  },
                );
                setMaterial(next);
                setMessage(
                  next.status === "published"
                    ? "Đã xuất bản. Mở trang học liệu bên dưới."
                    : "Đã gỡ xuất bản.",
                );
              })
            }
          >
            <Globe size={15} />
            {material.status === "published" ? "Gỡ xuất bản" : "Xuất bản"}
          </button>
        </div>
      </header>
      <div className="editor-page">
        {message && (
          <div className="success" role="status">
            {message}{" "}
            {material.status === "published" && (
              <a href={`/material/${material.slug}`}>Mở trang học liệu ↗</a>
            )}
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {preview ? (
          <MaterialReader material={build()} />
        ) : (
          <div className="editor-layout">
            <section className="editor-paper">
              <input
                className="title-input"
                aria-label="Tiêu đề học liệu"
                value={material.title}
                onChange={(e) => update({ title: e.target.value })}
              />
              <textarea
                className="summary-input"
                aria-label="Mô tả học liệu"
                value={material.summary}
                onChange={(e) => update({ summary: e.target.value })}
              />
              <div className="editor-toolbar">
                <button
                  onClick={() =>
                    editor?.chain().focus().toggleHeading({ level: 2 }).run()
                  }
                >
                  H2
                </button>
                <button
                  onClick={() => {
                    editor
                      ?.chain()
                      .focus()
                      .insertContent({
                        type: "paragraph",
                        content: [{ type: "text", text: "Nội dung mới" }],
                      })
                      .run();
                  }}
                >
                  + Văn bản
                </button>
                <button title="Di chuyển block lên" onClick={() => move(-1)}>
                  <ArrowUp size={15} />
                </button>
                <button title="Di chuyển block xuống" onClick={() => move(1)}>
                  <ArrowDown size={15} />
                </button>
                {["math", "exercise", "callout"].map((type) => (
                  <button
                    key={type}
                    onClick={() =>
                      editor
                        ?.chain()
                        .focus()
                        .insertContent({
                          type: "paragraph",
                          attrs: { blockType: type },
                          content: [
                            {
                              type: "text",
                              text:
                                type === "math"
                                  ? "x^2 + y^2 = r^2"
                                  : type === "exercise"
                                    ? "Bài tập: "
                                    : "Ghi nhớ: ",
                            },
                          ],
                        })
                        .run()
                    }
                  >
                    {type === "math"
                      ? "ƒx"
                      : type === "exercise"
                        ? "Bài tập"
                        : "Ghi chú"}
                  </button>
                ))}
              </div>
              <VisualContext.Provider value={material.visuals}>
                <EditorContent editor={editor} />
              </VisualContext.Provider>
            </section>
            <aside className="metadata">
              <MaterialShare material={material} onUpdate={next => setMaterial(current => current ? { ...current, visibility: next.visibility, revision: next.revision } : next)} />
              <h3>Thông tin học liệu</h3>
              <label>
                Cấp học
                <input
                  value={material.metadata.grade}
                  onChange={(e) =>
                    update({
                      metadata: { ...material.metadata, grade: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Chủ đề
                <input
                  value={material.metadata.topic}
                  onChange={(e) =>
                    update({
                      metadata: { ...material.metadata, topic: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Loại
                <select
                  value={material.metadata.type}
                  onChange={(e) =>
                    update({
                      metadata: {
                        ...material.metadata,
                        type: e.target.value as Material["metadata"]["type"],
                      },
                    })
                  }
                >
                  <option value="lesson">Bài giảng</option>
                  <option value="exploration">Khám phá</option>
                  <option value="problem">Bài giải</option>
                  <option value="exercise">Bài tập</option>
                </select>
              </label>
              <label>
                Thẻ (phân cách bằng dấu phẩy)
                <input
                  value={material.metadata.tags.join(", ")}
                  onChange={(e) =>
                    update({
                      metadata: {
                        ...material.metadata,
                        tags: e.target.value.split(",").map((s) => s.trim()),
                      },
                    })
                  }
                />
              </label>
              <div className="section-divider" />
              <h3>Visual của bài học</h3>
              <select
                aria-label="Chọn visual"
                value={visualId}
                onChange={(e) => {
                  setVisualId(e.target.value);
                  setJson("");
                }}
              >
                {material.visuals.map((v) => (
                  <option key={v.id}>{v.id}</option>
                ))}
              </select>
              <button
                className="outline"
                onClick={() => {
                  const v = material.visuals.find((v) => v.id === visualId);
                  setJson(JSON.stringify(v, null, 2));
                }}
              >
                Chỉnh tham số / viewport / nhãn
              </button>
              {json && (
                <>
                  <textarea
                    className="json-editor"
                    aria-label="VisualSpec JSON"
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      try {
                        const spec = validateVisual({
                          ...JSON.parse(json),
                          id: visualId,
                        });
                        update({
                          visuals: material.visuals.map((v) =>
                            v.id === visualId ? spec : v,
                          ),
                        });
                        setJson("");
                        setMessage(
                          "Đã cập nhật visual. Xem trước để kiểm tra.",
                        );
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    Áp dụng VisualSpec
                  </button>
                </>
              )}
              <button
                className="outline"
                onClick={() => {
                  const source = material.visuals.find(
                    (v) => v.id === visualId,
                  );
                  if (!source) return;
                  const id = "visual_" + crypto.randomUUID().replace(/-/g, "");
                  update({
                    visuals: [
                      ...material.visuals,
                      { ...structuredClone(source), id },
                    ],
                  });
                  editor
                    ?.chain()
                    .focus()
                    .insertContent({
                      type: "visualBlock",
                      attrs: { visualId: id, caption: "Bản sao visual" },
                    })
                    .run();
                  setVisualId(id);
                }}
              >
                <Copy size={14} /> Nhân bản visual
              </button>
              <select
                aria-label="Thêm mẫu visual"
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  const spec = pattern(e.target.value);
                  spec.id = "visual_" + crypto.randomUUID().replace(/-/g, "");
                  update({ visuals: [...material.visuals, spec] });
                  editor
                    ?.chain()
                    .focus()
                    .insertContent({
                      type: "visualBlock",
                      attrs: {
                        visualId: spec.id,
                        caption: patternNames[e.target.value],
                      },
                    })
                    .run();
                  setVisualId(spec.id);
                  e.target.value = "";
                }}
              >
                <option value="">+ Thêm visual từ mẫu</option>
                {Object.entries(patternNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <div className="section-divider" />
              <button
                className="outline"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await save();
                    const out = await request<{ url: string }>(
                      `/api/materials/${material.id}/export`,
                      { method: "POST" },
                    );
                    router.push(out.url);
                  })
                }
              >
                <Printer size={15} /> Bản in / Lưu PDF
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Xóa vĩnh viễn học liệu này?"))
                    act(async () => {
                      await request(`/api/materials/${material.id}`, {
                        method: "DELETE",
                      });
                      router.push("/");
                    });
                }}
              >
                <Trash2 size={15} /> Xóa học liệu
              </button>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
