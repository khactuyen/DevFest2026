/** Five small squares per major cell; keep a readable paper-like density. */
export function notebookMajorStep(unitX = 40, unitY = 40) {
  const scale = Math.min(unitX, unitY);
  if (!Number.isFinite(scale) || scale <= 0) return 2;
  const target = 100 / scale,
    power = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 2.5, 5, 10]
    .map((n) => n * power)
    .reduce((best, n) =>
      Math.abs(n - target) < Math.abs(best - target) ? n : best,
    );
}
export function notebookGridOptions(
  readBoard: () => { unitX?: number; unitY?: number } | undefined,
) {
  return {
    majorStep: () => {
      const board = readBoard();
      return notebookMajorStep(board?.unitX, board?.unitY);
    },
    minorElements: 4,
    forceSquare: true,
    highlight: false,
    major: {
      face: "line",
      strokeColor: "#e2e5eb",
      strokeWidth: 0.65,
      strokeOpacity: 1,
      highlight: false,
    },
    minor: {
      visible: true,
      face: "line",
      strokeColor: "#e2e5eb",
      strokeWidth: 0.65,
      strokeOpacity: 1,
      highlight: false,
    },
  };
}
