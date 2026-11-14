import type { AgentResult, VisualSpec } from "../contracts";
export type Scene = VisualSpec | null;
type Metadata = Omit<AgentResult, "visual">;
export type ExploreDocument = {
  visual: Scene;
  result: Metadata | null;
  analysis: Metadata | null;
  past: Scene[];
  future: Scene[];
};
export const emptyExploreDocument: ExploreDocument = {
  visual: null,
  result: null,
  analysis: null,
  past: [],
  future: [],
};
type Value<T> = T | ((current: T) => T);
export type ExploreDocumentEvent =
  | { type: "scene"; value: Value<Scene> }
  | {
      type: "metadata";
      channel: "result" | "analysis";
      value: Value<AgentResult | null>;
    }
  | { type: "remember"; before: Scene }
  | { type: "commit"; visual: Scene; before: Scene }
  | { type: "travel"; direction: "undo" | "redo"; current: Scene }
  | { type: "reset-history" };
export function projectResult(
  state: ExploreDocument,
  channel: "result" | "analysis",
): AgentResult | null {
  const metadata = state[channel];
  return metadata && state.visual
    ? { ...metadata, visual: state.visual }
    : null;
}
const snapshot = (value: Scene) => (value ? structuredClone(value) : null);
const remember = (state: ExploreDocument, before: Scene) => ({
  ...state,
  past: [...state.past.slice(-19), snapshot(before)],
  future: [],
});
/** Scene is stored once. Result/readout projections always reference that scene. */
export function exploreDocumentReducer(
  state: ExploreDocument,
  event: ExploreDocumentEvent,
): ExploreDocument {
  switch (event.type) {
    case "scene":
      return {
        ...state,
        visual:
          typeof event.value === "function"
            ? event.value(state.visual)
            : event.value,
      };
    case "metadata": {
      const current = projectResult(state, event.channel),
        value =
          typeof event.value === "function"
            ? event.value(current)
            : event.value;
      if (!value) return { ...state, [event.channel]: null };
      const { visual: _scene, ...metadata } = value;
      return { ...state, [event.channel]: metadata };
    }
    case "remember":
      return remember(state, event.before);
    case "commit":
      return { ...remember(state, event.before), visual: event.visual };
    case "reset-history":
      return { ...state, past: [], future: [] };
    case "travel": {
      const from = event.direction === "undo" ? state.past : state.future,
        to = event.direction === "undo" ? state.future : state.past;
      if (!from.length) return state;
      const target = snapshot(from[from.length - 1]),
        rest = from.slice(0, -1),
        next = [...to.slice(-19), snapshot(event.current)];
      return {
        ...state,
        visual: target,
        past: event.direction === "undo" ? rest : next,
        future: event.direction === "undo" ? next : rest,
      };
    }
  }
}
