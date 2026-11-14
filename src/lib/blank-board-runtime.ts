import type { VisualCorePort,CoordinatePort,SelectionPort,StatePort } from "./visual-ports";
import { notebookGridOptions } from "./notebook-grid";
/* JSXGraph adapter for an empty Explore canvas. Blank canvases stay outside
 * the persisted VisualSpec contract until the learner creates geometry. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type BoardViewport = { x: [number, number]; y: [number, number] };
export type BoardRect = { x: number; y: number; width: number; height: number };

export function createBlankBoardRuntime(JXG: any, container: string, initialBox: [number, number, number, number] = [-10, 7, 10, -7]) {
  let board:any;
  const gridOptions=notebookGridOptions(()=>board);
  board = JXG.JSXGraph.initBoard(container, {
    boundingbox: initialBox,
    axis: false,
    grid: gridOptions,
    showCopyright: false,
    showNavigation: false,
    keepaspectratio: true,
    resize: { enabled: true },
    pan: { enabled: true, needShift: false, needTwoFingers: false },
    zoom: { wheel: true, needShift: false, factorX: 1.2, factorY: 1.2, min: 0.02, max: 50 },
    keyboard: { enabled: true },
    renderer: "svg",
  });
  let axes: any[] = [];
  let axesVisible = false;
  let labelsVisible = true;
  let gridVisible = true;
  let destroyed = false;

  function setAxesVisible(visible: boolean) {
    if (destroyed || visible === axesVisible) return;
    axesVisible = visible;
    if (visible) {
      axes = [
        board.create("axis", [[0, 0], [1, 0]], { strokeColor: "#516579", strokeWidth: 1.5, name: "x", withLabel: labelsVisible, ticks: { majorHeight: 7, minorHeight: 3, drawLabels: labelsVisible }, label: { position: "rt", offset: [-12, 12] }, fixed: true }),
        board.create("axis", [[0, 0], [0, 1]], { strokeColor: "#516579", strokeWidth: 1.5, name: "y", withLabel: labelsVisible, ticks: { majorHeight: 7, minorHeight: 3, drawLabels: labelsVisible }, label: { position: "rt", offset: [10, 10] }, fixed: true }),
      ];
    } else {
      axes.forEach((axis) => board.removeObject(axis));
      axes = [];
    }
    board.update();
  }

  function setGridVisible(visible: boolean) {
    if (destroyed || visible === gridVisible) return;
    gridVisible = visible;
    if (visible) board.create("grid",[],notebookGridOptions(()=>board));
    else board.removeGrids();
    board.update();
    if (visible) board.fullUpdate();
  }

  function screenToUser(clientX: number, clientY: number): { x: number; y: number } | null {
    if (destroyed || typeof board.getUsrCoordsOfMouse !== "function") return null;
    const coords = board.getUsrCoordsOfMouse({ clientX, clientY });
    const x = Number(coords?.[0]), y = Number(coords?.[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function zoomIn() { if (!destroyed) board.zoomIn(); }
  function zoomOut() { if (!destroyed) board.zoomOut(); }
  function fitView() {
    if (!destroyed) board.setBoundingBox(initialBox, true, "reset");
  }
  function boundingBox(): [number, number, number, number] {
    return [...(board.getBoundingBox?.() || initialBox)] as [number, number, number, number];
  }

  return ({
    reset: fitView,
    stop() {},
    setParameter(_id: string, _value: number) {},
    actions(_actions: any[]) {},
    serialized() { return null; },
    screenToUser,
    userToScreen(x: number, y: number) { const rect = document.getElementById(container)?.getBoundingClientRect(); return !destroyed && rect ? { x: rect.left + board.origin.scrCoords[1] + x * board.unitX, y: rect.top + board.origin.scrCoords[2] - y * board.unitY } : null; },
    setAxesVisible,
    setGridVisible,
    setSnapToGrid(_visible: boolean) { /* no geometry exists yet; Explore applies it when adding points */ },
    setLabelsVisible(visible: boolean) {
      labelsVisible = visible;
      if (axesVisible) axes.forEach((axis) => axis.setAttribute({ withLabel: visible }));
      board.update();
    },
    zoomIn,
    zoomOut,
    fitView,
    boundingBox,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      JXG.JSXGraph.freeBoard(board);
    },
  } satisfies VisualCorePort & CoordinatePort & Record<string,unknown>);
}

export type BlankBoardRuntime = ReturnType<typeof createBlankBoardRuntime>;
