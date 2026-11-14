"use client";

import type { VisualRuntime } from "@/lib/runtime";
import { type SolveSolution } from "@/lib/solve-engine";
import {
  isGuidedSolution,
  type GuidedSolution,
} from "@/lib/solve-guided-contracts";
import { solveVisualTo3d } from "@/lib/solve-visual-3d";
import type { ThreeVisualRuntime } from "@/lib/three-runtime";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { message } from "./shared";
type Input = {
  solution: SolveSolution | GuidedSolution | null;
  activeStep: number;
  showAll: boolean;
  visualOpen: boolean;
  visualDimension: "2d" | "3d";
  visualSurfaceFill: boolean;
};
export function useSolveVisual({
  solution,
  activeStep,
  showAll,
  visualOpen,
  visualDimension,
  visualSurfaceFill,
}: Input) {
  const runtime = useRef<VisualRuntime | ThreeVisualRuntime | null>(null);
  const view = useRef({ solution, activeStep, showAll });
  view.current = { solution, activeStep, showAll };
  const spatialView = useMemo(() => {
    if (!solution?.visual) return { spec: null, error: "" };
    if (isGuidedSolution(solution) && solution.visual3d)
      return { spec: solution.visual3d, error: "" };
    try {
      return { spec: solveVisualTo3d(solution.visual), error: "" };
    } catch (error) {
      return { spec: null, error: message(error) };
    }
  }, [solution]);
  const displaying3d = visualDimension === "3d" && !!spatialView.spec;
  const displayVisual = displaying3d ? spatialView.spec : solution?.visual;
  const canFill = displayVisual?.objects.some(
    (object) =>
      object.visible &&
      [
        "polygon",
        "circle",
        "face3d",
        "cylinder",
        "cone",
        "box",
        "prism",
        "pyramid",
        "tetrahedron",
        "extrudedPolygon",
      ].includes(object.type),
  );
  function syncVisual(r: VisualRuntime | ThreeVisualRuntime) {
    const current = view.current,
      spec = current.solution?.visual;
    if (!spec) return;
    if (isGuidedSolution(current.solution)) {
      const geometric = spec.kind === "geometry";
      if ("setAxesVisible" in r) {
        r.setAxesVisible(!geometric);
        r.setGridVisible(!geometric);
      }
      return;
    }
    const rootIds = spec.objects
      .filter((o) => o.id.startsWith("root_"))
      .map((o) => o.id);
    const vertex = spec.objects.some((o) => o.id === "vertex");
    const activeTargets = current.solution!.steps[current.activeStep].targets;
    const revealRoots =
      current.showAll ||
      activeTargets.some((id) => id.startsWith("root_")) ||
      current.activeStep === current.solution!.steps.length - 1;
    const revealVertex =
      current.solution!.method === "square" &&
      (current.showAll || activeTargets.includes("vertex"));
    const targets = activeTargets.filter(
      (id) =>
        spec.objects.some((o) => o.id === id) &&
        (id === "vertex"
          ? revealVertex
          : id.startsWith("root_")
            ? revealRoots
            : true),
    );
    const actions: Parameters<VisualRuntime["actions"]>[0] = [
      { type: "highlight", targets: [] },
      ...(rootIds.length
        ? [
            {
              type: revealRoots ? ("show" as const) : ("hide" as const),
              targets: rootIds,
            },
          ]
        : []),
      ...(vertex
        ? [
            {
              type: revealVertex ? ("show" as const) : ("hide" as const),
              targets: ["vertex"],
            },
          ]
        : []),
      ...(targets.length ? [{ type: "highlight" as const, targets }] : []),
    ];
    if ("setAxesVisible" in r) r.actions(actions);
    else {
      const ids = new Set(r.serialized().objects.map((object) => object.id));
      r.actions(
        actions.map((action) =>
          "targets" in action
            ? {
                ...action,
                targets: action.targets.flatMap((id) =>
                  [
                    `point_${id}`,
                    `label_${id}`,
                    `curve_${id}`,
                    `edge_${id}`,
                  ].filter((target) => ids.has(target)),
                ),
              }
            : action,
        ),
      );
    }
  }
  useLayoutEffect(() => {
    runtime.current = null;
  }, [solution, displayVisual]);
  useEffect(() => {
    runtime.current?.setSurfaceFillVisible(visualSurfaceFill);
  }, [visualSurfaceFill, displayVisual]);
  useEffect(() => {
    if (runtime.current) syncVisual(runtime.current);
  }, [activeStep, showAll]);
  useEffect(() => {
    if (!visualOpen) runtime.current = null;
  }, [visualOpen]);
  return {
    runtime,
    spatialView,
    displaying3d,
    displayVisual,
    canFill,
    syncVisual,
  };
}
