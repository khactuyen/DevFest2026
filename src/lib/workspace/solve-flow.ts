import type { SolveProblem, SolveSolution } from "../solve-engine";
import type { GuidedProblem, GuidedSolution } from "../solve-guided-contracts";
export type SolveAnalysis = SolveProblem | GuidedProblem;
export type SolvedProblem = SolveSolution | GuidedSolution;
export type SolveFlow =
  | {
      phase: "input";
      prompt: string;
      problem: SolveAnalysis | null;
      solution: null;
    }
  | { phase: "review"; prompt: string; problem: SolveAnalysis; solution: null }
  | {
      phase: "solution";
      prompt: string;
      problem: SolveAnalysis;
      solution: SolvedProblem;
    };
export const initialSolveFlow: SolveFlow = {
  phase: "input",
  prompt: "",
  problem: null,
  solution: null,
};
export type SolveFlowEvent =
  | { type: "edit"; prompt: string }
  | { type: "analyzed"; problem: SolveAnalysis }
  | { type: "show-review" }
  | { type: "back" }
  | { type: "input" }
  | { type: "mode-changed" }
  | { type: "solved"; solution: SolvedProblem }
  | {
      type: "replace-solution";
      expected: SolvedProblem;
      solution: SolvedProblem;
    }
  | { type: "restore"; value: SolveFlow };
/** State transitions preserve the invariant that a visible result has its analysis. */
export function solveFlowReducer(
  state: SolveFlow,
  event: SolveFlowEvent,
): SolveFlow {
  switch (event.type) {
    case "edit":
      return {
        phase: "input",
        prompt: event.prompt,
        problem: null,
        solution: null,
      };
    case "analyzed":
      return {
        ...state,
        phase: "review",
        problem: event.problem,
        solution: null,
      };
    case "show-review":
      return state.problem
        ? { ...state, phase: "review", problem: state.problem, solution: null }
        : state;
    case "mode-changed":
      return state.phase === "solution"
        ? { ...state, phase: "review", solution: null }
        : state;
    case "back":
      return state.phase === "solution"
        ? { ...state, phase: "review", solution: null }
        : { ...state, phase: "input", solution: null };
    case "input":
      return { ...state, phase: "input", solution: null };
    case "solved":
      return {
        ...state,
        phase: "solution",
        problem: event.solution.problem,
        solution: event.solution,
      };
    case "replace-solution":
      return state.phase === "solution" && state.solution === event.expected
        ? { ...state, solution: event.solution }
        : state;
    case "restore":
      return event.value;
  }
}
export function restoredSolveFlow(
  prompt: string,
  phase: SolveFlow["phase"],
  problem: SolveAnalysis | null,
  solution: SolvedProblem | null,
): SolveFlow {
  if (phase === "solution" && solution)
    return { prompt, phase, problem: solution.problem, solution };
  if (phase === "review" && problem)
    return { prompt, phase, problem, solution: null };
  return { prompt, phase: "input", problem, solution: null };
}
