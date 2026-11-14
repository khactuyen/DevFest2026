"use client";
import type { AgentResult, VisualSpec } from "@/lib/contracts";
import { validateVisual } from "@/lib/validation";
import {
  emptyExploreDocument,
  exploreDocumentReducer,
  projectResult,
} from "@/lib/workspace/explore-document";
import { useMemo, useReducer } from "react";
type Scene = VisualSpec | null;
type Update<T> = T | ((value: T) => T);
export function useExploreDocument(initialVisual: Scene = null) {
  const [document, dispatch] = useReducer(
    exploreDocumentReducer,
    { ...emptyExploreDocument, visual: initialVisual },
  );
  const result = useMemo(
    () => projectResult(document, "result"),
    [document.visual, document.result],
  );
  const analysisResult = useMemo(
    () => projectResult(document, "analysis"),
    [document.visual, document.analysis],
  );
  return {
    visual: document.visual,
    result,
    analysisResult,
    setVisual: (value: Update<Scene>) => dispatch({ type: "scene", value }),
    setResult: (value: Update<AgentResult | null>) =>
      dispatch({ type: "metadata", channel: "result", value }),
    setAnalysisResult: (value: Update<AgentResult | null>) =>
      dispatch({ type: "metadata", channel: "analysis", value }),
    rememberGeometry: (before: Scene) => dispatch({ type: "remember", before }),
    commitScene: (visual: Scene, before: Scene) =>
      dispatch({ type: "commit", visual, before }),
    canUndo: document.past.length > 0,
    canRedo: document.future.length > 0,
    travelHistory(
      direction: "undo" | "redo",
      current: Scene,
    ): Scene | undefined {
      const from = direction === "undo" ? document.past : document.future;
      if (!from.length) return undefined;
      const target = from[from.length - 1],
        checked = target ? validateVisual(target) : null;
      dispatch({ type: "travel", direction, current });
      return checked;
    },
    resetHistory: () => dispatch({ type: "reset-history" }),
  };
}
