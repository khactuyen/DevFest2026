import type { Material } from "./contracts";

export function createLessonDraft(title = "Bài học mới"): Material {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    summary: "",
    status: "draft",
    visibility: "private",
    metadata: { grade: "", topic: "", type: "lesson", tags: [] },
    blocks: [
      {
        id: "block_warmup",
        type: "paragraph",
        authorKind: "text",
        title: "Khởi động",
        content: "",
      },
      {
        id: "block_explore",
        type: "paragraph",
        authorKind: "text",
        title: "Khám phá",
        content: "",
      },
      {
        id: "block_concept",
        type: "paragraph",
        authorKind: "text",
        title: "Hình thành kiến thức",
        content: "",
      },
      {
        id: "block_assess",
        type: "exercise",
        authorKind: "question",
        title: "Luyện tập và kiểm tra",
        content: "",
      },
    ],
    visuals: [],
    learningSteps: [
      { id: "step_warmup", title: "Khởi động", description: "", phase: "warmup", objective: "", estimatedMinutes: 0, blockIds: ["block_warmup"], actionLabels: [], visualActions: [] },
      { id: "step_explore", title: "Khám phá", description: "", phase: "explore", objective: "", estimatedMinutes: 0, blockIds: ["block_explore"], actionLabels: [], visualActions: [] },
      { id: "step_concept", title: "Hình thành kiến thức", description: "", phase: "concept", objective: "", estimatedMinutes: 0, blockIds: ["block_concept"], actionLabels: [], visualActions: [] },
      { id: "step_assess", title: "Luyện tập và kiểm tra", description: "", phase: "assess", objective: "", estimatedMinutes: 0, blockIds: ["block_assess"], actionLabels: [], visualActions: [] },
    ],
    revision: 1,
    slug: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
