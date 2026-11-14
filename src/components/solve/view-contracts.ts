import type { ThreeVisualSpec, VisualSpec } from "@/lib/contracts";
import type { HandwritingDraft } from "@/lib/handwriting-draft";
import type { ProblemRecognition } from "@/lib/problem-recognition";
import type { VisualRuntime } from "@/lib/runtime";
import type { SolveSession } from "@/lib/solve-contracts";
import type { SolveSolution } from "@/lib/solve-engine";
import type { SolveMode } from "@/lib/solve-mode";
import type { QuestionPreference } from "@/lib/solve-question";
import type { ThreeVisualRuntime } from "@/lib/three-runtime";
import type {
  SolveAnalysis,
  SolvedProblem,
  SolveFlow,
} from "@/lib/workspace/solve-flow";
import type { RefObject } from "react";
export type RecognizedSource = ProblemRecognition & { imageDataUrl: string };
export type SolveScreen = {
  phase: SolveFlow["phase"];
  hydrated: boolean;
  loadFailed: boolean;
  busy: string;
  prompt: string;
};
export type ChooseMethod = (
  method: SolvedProblem["method"],
  mode?: "quick" | "deep",
) => Promise<void>;
export type SolveHeaderProps = Pick<SolveScreen, "busy" | "phase"> & {
  diagramBusy: boolean;
  goBack(): void;
  newProblem(): void;
  closeMoreMenu(): void;
  moreMenu: RefObject<HTMLDetailsElement | null>;
  save(copy?: boolean): Promise<void>;
  saved: SolveSession[];
  printSolution(): void;
  openSavedSession(session: SolveSession): void;
  solution: SolvedProblem | null;
  toStudio(): Promise<void>;
  toggleDiagram(): Promise<void>;
  visualOpen: boolean;
};
export type SolveInputProps = SolveScreen & {
  analyze(): Promise<void>;
  sourceConfirmed: boolean;
  confirmSource(confirmed: boolean): void;
  changeSolveMode(mode: SolveMode): void;
  edit(source: string): void;
  handwritingDraft: HandwritingDraft;
  handwritingHistory: RefObject<HandwritingDraft[]>;
  inputRevision: number;
  questionType: QuestionPreference;
  recognition: RecognizedSource | null;
  recognize(file: File): Promise<void>;
  solveMode: SolveMode;
  sourceLines: string[];
  tab: string;
  chooseInputTab(tab: string): void;
  changeHandwritingDraft(strokes: HandwritingDraft): void;
  getSourceRevision(): number;
  acceptHandwritingResult(result: RecognizedSource, revision?: number): void;
  clearSourceImage(): void;
  confirmSourceCorrection(source: string): void;
  chooseQuestionType(type: QuestionPreference): void;
  useExample(source: string): void;
};
export type SolveReviewProps = SolveScreen & {
  quickAnswer: SolveSolution | null;
  revealQuickAnswer(): void;
  questionType: QuestionPreference;
  chooseMethod: ChooseMethod;
  goBack(): void;
  problem: SolveAnalysis | null;
  recognition: RecognizedSource | null;
  solveMode: SolveMode;
};
export type SolveSolutionProps = SolveScreen & {
  activeStep: number;
  ask(mode?: "hint" | "detail" | "free", stepIndex?: number): Promise<void>;
  askBusy: boolean;
  askError: string;
  askOpen: boolean;
  canFill: boolean | undefined;
  cancelAI(): void;
  captureSelection(): void;
  chatLauncher: RefObject<HTMLButtonElement | null>;
  chooseMethod: ChooseMethod;
  contentsMenu: RefObject<HTMLDetailsElement | null>;
  currentMessages: SolveSession["messages"];
  displayVisual: VisualSpec | null | undefined;
  displaying3d: boolean;
  edit(source: string): void;
  goBack(): void;
  hint: "hint" | "explanation" | null;
  jumpToStep(index: number): void;
  mobileTab: string;
  move(index: number): void;
  question: string;
  selected: string;
  showAll: boolean;
  solution: SolvedProblem | null;
  spatialView: { spec: ThreeVisualSpec | null; error: string };
  step: SolvedProblem["steps"][number] | undefined;
  visualOpen: boolean;
  visualSurfaceFill: boolean;
  onAssistantOpenChange(open: boolean): void;
  onHintChange(hint: "hint" | "explanation" | null): void;
  onMobileTabChange(tab: string): void;
  onQuestionChange(question: string): void;
  setView(all: boolean): void;
  chooseVisualDimension(dimension: "2d" | "3d"): void;
  onVisualOpenChange(open: boolean): void;
  onSurfaceFillChange(fill: boolean): void;
  useExample(source: string): void;
  zoomVisual(direction: "in" | "out" | "fit"): void;
  onVisualReady(runtime: VisualRuntime | ThreeVisualRuntime): void;
};
