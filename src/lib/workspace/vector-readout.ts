import { type ModelReadout } from "@/lib/model-inspector";
import type { ReadoutContext } from "./readout-types";
export function getVectorReadout({
  activeModelKey,
  visual,
  visualState,
}: Pick<
  ReadoutContext,
  "activeModelKey" | "visual" | "visualState"
>): ModelReadout | null {
  if (
    activeModelKey !== "vector-addition" &&
    activeModelKey !== "vector-dot-product"
  )
    return null;
  const coordinate = (id: string) => {
    const current = visualState?.objects[id];
    if (
      current &&
      typeof current.x === "number" &&
      typeof current.y === "number"
    )
      return { x: current.x, y: current.y };
    const object =
      visual?.dimension === "2d"
        ? visual.objects.find((item) => item.id === id)
        : undefined;
    if (object && typeof object.x === "number" && typeof object.y === "number")
      return { x: object.x, y: object.y };
    return null;
  };
  const O = coordinate("O") || { x: 0, y: 0 },
    U = coordinate("U"),
    V = coordinate("V");
  if (!U || !V) return null;
  const u = { x: U.x - O.x, y: U.y - O.y },
    v = { x: V.x - O.x, y: V.y - O.y };
  const lengthU = Math.hypot(u.x, u.y),
    lengthV = Math.hypot(v.x, v.y),
    dot = u.x * v.x + u.y * v.y;
  const number = (value: number) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
  if (activeModelKey === "vector-dot-product") {
    const angle =
      lengthU && lengthV
        ? (Math.acos(Math.min(1, Math.max(-1, dot / (lengthU * lengthV)))) *
            180) /
          Math.PI
        : NaN;
    return {
      heading: "Tích vô hướng đang quan sát",
      formula: `u·v = (${number(u.x)}; ${number(u.y)}) · (${number(v.x)}; ${number(v.y)}) = ${number(dot)}`,
      metrics: [
        { label: "u", value: `(${number(u.x)}; ${number(u.y)})` },
        { label: "v", value: `(${number(v.x)}; ${number(v.y)})` },
        { label: "u·v", value: number(dot) },
        {
          label: "Góc θ",
          value: Number.isFinite(angle) ? `${number(angle)}°` : "—",
        },
      ],
      observations: [
        dot > 0
          ? "u·v > 0: góc giữa hai vectơ là góc nhọn."
          : dot < 0
            ? "u·v < 0: góc giữa hai vectơ là góc tù."
            : "u·v = 0: hai vectơ vuông góc.",
      ],
      focus: [
        { label: "Vectơ u", targets: ["uLine"] },
        { label: "Vectơ v", targets: ["vLine"] },
      ],
    };
  }
  const sum = { x: u.x + v.x, y: u.y + v.y };
  return {
    heading: "Kết quả cộng vectơ",
    formula: `u + v = (${number(sum.x)}; ${number(sum.y)})`,
    metrics: [
      { label: "u", value: `(${number(u.x)}; ${number(u.y)})` },
      { label: "v", value: `(${number(v.x)}; ${number(v.y)})` },
      { label: "u + v", value: `(${number(sum.x)}; ${number(sum.y)})` },
      { label: "|u + v|", value: number(Math.hypot(sum.x, sum.y)) },
    ],
    observations: [
      "Kéo U hoặc V: đường chéo màu cam luôn bằng tổng hai vectơ.",
    ],
    focus: [
      { label: "Vectơ u", targets: ["uLine"] },
      { label: "Vectơ v", targets: ["vLine"] },
      { label: "Tổng", targets: ["sum"] },
    ],
  };
}
