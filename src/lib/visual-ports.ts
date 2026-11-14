import type { VisualAction, VisualSpec, VisualStateSummary } from "./contracts";
import type { VisualSelection, VertexHit } from "./runtime";
export interface VisualCorePort {
  serialized(): VisualSpec | null;
  setParameter(id: string, value: number): void;
  actions(actions: VisualAction[]): void;
  stop(): void;
  reset(): void;
  destroy(): void;
  zoomIn(): void;
  zoomOut(): void;
  fitView(): void;
}
export interface CoordinatePort {
  screenToUser(x: number, y: number): { x: number; y: number } | null;
  boundingBox(): [number, number, number, number];
}
export interface SelectionPort {
  pickObjectAt(x: number, y: number): VisualSelection | null;
  pickVertexAt(x: number, y: number): VertexHit | null;
}
export interface StatePort {
  state(): VisualStateSummary;
}
