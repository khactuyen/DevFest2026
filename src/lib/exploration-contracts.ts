import { z } from "zod";
import { AgentResultSchema, VisualSpecSchema, type VisualStateSummary, type VisualSpec } from "./contracts";
import { GraphInkDraftSchema } from "./graph-ink-draft";
import { HandwritingDraftSchema, HandwritingUndoSchema } from "./handwriting-draft";

const eventTypes = ["problem-submitted", "scene-generated", "pattern-selected", "object-selected", "interaction", "lesson-step", "question-asked", "assistant-answered", "material-created", "session-reset"] as const;

const VisualStateSchema = z.object({
  visualId: z.string().min(1).max(80),
  parameters: z.record(z.string().max(64), z.number().finite()),
  objects: z.record(z.string().max(64), z.object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    z: z.number().finite().optional(),
    visible: z.boolean().optional(),
  }).strict()),
}).strict().superRefine((state, context) => {
  if (Object.keys(state.parameters).length > 12) context.addIssue({ code: "custom", message: "Phiên có quá nhiều tham số." });
  if (Object.keys(state.objects).length > 120) context.addIssue({ code: "custom", message: "Phiên có quá nhiều đối tượng." });
});

export const ExplorationEventSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(eventTypes),
  label: z.string().max(180),
  targetId: z.string().max(80).optional(),
  payload: z.record(z.string().max(80), z.unknown()).default({}),
  occurredAt: z.string().datetime(),
}).strict();

export const ExplorationSessionSchema = z.object({
  id: z.string().uuid(),
  ownerKey: z.string().regex(/^[a-zA-Z][\w-]{0,63}$/),
  revision: z.number().int().min(0).default(0),
  title: z.string().max(200).default("Phiên khám phá"),
  prompt: z.string().max(8000).default(""),
  reflectionPrompt: z.string().max(2000).default(""),
  patternKey: z.string().max(64).default("quadratic-roots"),
  visual: VisualSpecSchema.nullable().default(null),
  result: AgentResultSchema.nullable().default(null),
  visualState: VisualStateSchema.nullable().default(null),
  inkDraft: GraphInkDraftSchema.nullable().default(null),
  handwritingDraft: HandwritingDraftSchema.optional(),
  handwritingUndo: HandwritingUndoSchema.optional(),
  inputTab: z.enum(["text", "photo", "handwriting", "latex"]).optional(),
  latexDraft: z.string().max(8000).optional(),
  boardOptions: z.object({ axes: z.boolean(), grid: z.boolean(), snap: z.boolean(), labels: z.boolean() }).strict().optional(),
  assistantAnswer: z.object({
    answer: z.string().max(1400),
    evidence: z.string().max(700),
    nextQuestion: z.string().max(500).optional(),
  }).strict().nullable().default(null),
  activeStep: z.enum(["choose", "observe", "explain", "apply"]).default("choose"),
  completedSteps: z.array(z.enum(["choose", "observe", "explain", "apply"])).max(4).default([]),
  learningTab: z.enum(["Giới thiệu", "Tính chất", "Ứng dụng", "Thử ví dụ"]).default("Giới thiệu"),
  events: z.array(ExplorationEventSchema).max(30).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((session, context) => {
  if (session.visual) VisualSpecSchema.parse(session.visual);
  if (session.result?.visual && session.visual && session.result.visual.id !== session.visual.id) {
    context.addIssue({ code: "custom", path: ["result", "visual"], message: "Kết quả không khớp cảnh đang lưu." });
  }
});

export type ExplorationEvent = z.infer<typeof ExplorationEventSchema>;
export type ExplorationSession = z.infer<typeof ExplorationSessionSchema> & { visualState: VisualStateSummary | null };

export function validateExplorationSession(raw: unknown): ExplorationSession {
  const parsed = ExplorationSessionSchema.parse(raw);
  return { ...parsed, visualState: parsed.visualState as VisualStateSummary | null };
}

/** A generic provenance key is not the identity of a constructed scene. */
export function sceneForExplorationSave(scene:VisualSpec|null,snapshot:VisualSpec|null|undefined) {
  if(!scene)return null;
  return snapshot?.id===scene.id && snapshot.dimension===scene.dimension ? snapshot : scene;
}

export function resultForExplorationScene(scene:VisualSpec,candidates:unknown[]) {
  for(const candidate of candidates) {
    const result=AgentResultSchema.safeParse(candidate);
    if(result.success && result.data.visual.id===scene.id)return {...result.data,visual:scene};
  }
  return null;
}
