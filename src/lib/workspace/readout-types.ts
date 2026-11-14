import type {
  AgentResult,
  TwoDVisualSpec,
  VisualObject,
  VisualSpec,
  VisualStateSummary,
} from "../contracts";
import type { VisualSelection } from "../runtime";
export type ReadoutContext = {
  visual: VisualSpec | null;
  visualState: VisualStateSummary | undefined;
  analysisResult: AgentResult | null;
  selectedObject: VisualSelection | null;
  selectedSourceObject: VisualObject | undefined;
  selectedCircle: boolean | undefined;
  selectedPolygon: boolean | undefined;
  source2d: TwoDVisualSpec | undefined;
  sourceGraph: VisualObject | undefined;
  values: Record<string, number>;
  activeModelKey: string;
};
export type SelectedObjectDetails = {
  title: string;
  kind: string;
  details: string[];
  position: { x: number; y: number } | null;
  editable: boolean;
};
export type RecognizedVisualSummary = {
  entities: Array<{ id?: string; kind: string; label: string }>;
  objectCount: number;
  freePointCount: number;
  parameterCount: number;
};
