import type { ThreeVisualObject } from "./contracts";

export type CircularEdgeKey =
  "top-ring" | "bottom-ring" | "great-x" | "great-y" | "great-z";
export function supportsCircularEdge(
  type: ThreeVisualObject["type"],
  key: CircularEdgeKey,
) {
  return type === "sphere"
    ? key.startsWith("great-")
    : type === "cylinder"
      ? ["top-ring", "bottom-ring"].includes(key)
      : type === "cone" && key === "bottom-ring";
}
/** Fraction of a full turn, independent of tessellation and model size. */
export function circularEdgePoint(
  key: CircularEdgeKey,
  ratio: number,
  radius: number,
  height = 0,
): [number, number, number] {
  const a = radius * Math.cos(2 * Math.PI * ratio),
    b = radius * Math.sin(2 * Math.PI * ratio);
  if (key === "great-x") return [0, a, b];
  if (key === "great-z") return [a, b, 0];
  return [
    a,
    key === "top-ring" ? height / 2 : key === "bottom-ring" ? -height / 2 : 0,
    b,
  ];
}
