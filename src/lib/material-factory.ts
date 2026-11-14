import type { AgentResult,Material,VisualSpec } from "./contracts";

export function makeMaterial(
  result: AgentResult,
  visual: VisualSpec = result.visual,
): Material {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: result.title,
    summary: result.explanation,
    blocks: [
      { id: "heading", type: "heading", content: result.title },
      { id: "intro", type: "paragraph", content: result.explanation },
      {
        id: "visual_block",
        type: "visual",
        content: "Tương tác với hình để khám phá.",
        visualId: visual.id,
      },
      ...result.steps.map((s) => ({
        id: s.id,
        type: "paragraph" as const,
        content: `${s.title}\n${s.content}`,
      })),
    ],
    visuals: [visual],
    metadata: {
      grade: "10",
      topic: result.title,
      type: result.steps.length ? "problem" : "exploration",
      tags: [],
    },
    status: "draft",
    visibility: "private",
    learningSteps: (result.steps.length ? result.steps : [{
      id: "explore_step", title: "Khám phá mô hình", content: result.explanation,
      visualActions: [], visualId: visual.id,
    }]).map((step, index) => ({
      id: step.id,
      title: step.title,
      description: step.content,
      phase: "explore" as const,
      objective: "Hoàn thành hoạt động học tập theo hướng dẫn.",
      estimatedMinutes: 5,
      blockIds: [...(index === 0 ? ["heading", "intro", "visual_block"] : []),
        ...(result.steps.length ? [step.id] : [])],
      actionLabels: [],
      visualId: index === 0 || step.visualActions.length ? visual.id : step.visualId,
      visualActions: step.visualActions,
    })),
    revision: 1,
    slug: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
