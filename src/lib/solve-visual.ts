import { z } from "zod";
import { AppError } from "./app-error";
import { ThreeVisualSpecSchema, TwoDVisualSpecSchema, type TwoDVisualSpec } from "./contracts";
import { compileExpression } from "./expression";
import {
  GuidedProblemSchema,
  assertGuidedSource,
  type GuidedProblem,
} from "./solve-guided-contracts";
import { knownContradictions } from "./solve-guided";
import { compileVisualProgram } from "./visual-program";
import { generateVisualProgram } from "./visual-program-generation";
import { validateVisual } from "./validation";
import { rectangleRevolutionVisual } from "./solve-cylinder-visual";
import { isoscelesRelationVisual } from "./solve-isosceles-visual";
import { canAttemptSolve } from "./solve-review";
import { readTunnelDimensions, tunnelPlan, TUNNEL_NOTE } from "./tunnel-visual";
import { readCylinderDimensions, cylinderDimensions2d } from "./cylinder-problem-visual";
import { readRegularSquareFrustumDimensions, squareFrustumVisuals } from "./solve-frustum-visual";
import { rightBasePyramidVisuals, isSpatialProblem } from "./solve-pyramid-visual";

export const SolveVisualResponseSchema = z
  .object({
    visual: TwoDVisualSpecSchema,
    visual3d: ThreeVisualSpecSchema.optional(),
    note: z.string().min(1).max(300),
  })
  .strict();

/** Freeze a problem illustration: dragging/animating must not change givens. */
function freezeVisual(spec: TwoDVisualSpec): TwoDVisualSpec {
  const values = Object.fromEntries(
    spec.parameters.map((p) => [p.id, p.value]),
  );
  const scalar = (value: number | string | undefined) =>
    typeof value === "string"
      ? compileExpression(value, Object.keys(values))(values)
      : value;
  return validateVisual({
    ...spec,
    parameters: [],
    objects: spec.objects.map((o) => ({
      ...o,
      free: false,
      ...(o.x !== undefined ? { x: scalar(o.x) } : {}),
      ...(o.y !== undefined ? { y: scalar(o.y) } : {}),
      ...(o.radius !== undefined ? { radius: scalar(o.radius) } : {}),
      ...(o.expression
        ? {
            expression: o.expression.replace(/\b[a-zA-Z_]\w*\b/g, (name) =>
              Object.hasOwn(values, name) ? `(${values[name]})` : name,
            ),
          }
        : {}),
    })),
  }) as TwoDVisualSpec;
}

/** Given measurements are assertions, never decorative labels. */
function verifyGivenMeasurements(
  prompt: string,
  givens: string[],
  spec: TwoDVisualSpec,
) {
  if (spec.kind !== "geometry") return;
  const text = `${prompt}\n${givens.join("\n")}`;
  if (
    /(?:[gG]óc\s*[A-Z]{1,3}|∠\s*[A-Z]{1,3})\s*(?:=|[bB]ằng)\s*\d|(?<![\p{L}\p{N}_])[A-Z]{2}\s*=\s*\d+(?:[.,]\d+)?\s*[A-Z]{2}(?![\p{L}\p{N}_])/u.test(
      text,
    )
  )
    throw new AppError(
      422,
      "Chưa kiểm chứng được số đo góc hoặc tỉ lệ cạnh trên hình dựng.",
      "unsupported",
    );
  for (const match of text.matchAll(
    /\b([A-Z])([A-Z])\s*=\s*(\d+(?:[.,]\d+)?)\b/g,
  )) {
    const coordinates = (id: string): [number, number] | null => {
      const point = spec.objects.find((o) => o.id === id);
      if (!point) return null;
      if (point.type === "midpoint") {
        const a = coordinates(point.parents[0]), b = coordinates(point.parents[1]);
        return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null;
      }
      if (point.type !== "point" || typeof point.x !== "number" || typeof point.y !== "number") return null;
      const offset = point.offset ? coordinates(point.parents[0]) : [0, 0];
      return offset ? [point.x + offset[0], point.y + offset[1]] : null;
    };
    const a = coordinates(match[1]), b = coordinates(match[2]);
    if (
      !a ||
      !b ||
      Math.abs(
        Math.hypot(a[0] - b[0], a[1] - b[1]) - Number(match[3].replace(",", ".")),
      ) > 0.01
    )
      throw new AppError(
        422,
        `Hình dựng chưa khớp số đo ${match[1]}${match[2]} = ${match[3]}; cần dựng lại hoặc tự đối chiếu.`,
        "unsupported",
      );
  }
}


export function knownProblemVisual(prompt: string, sourceText: string, givens: string[], allowLayout = false) {
  const frustumDimensions = readRegularSquareFrustumDimensions(sourceText, allowLayout);
  if (frustumDimensions) {
    const pair = squareFrustumVisuals(
      frustumDimensions,
      /khoảng\s*cách\s*giữa\s*(?:hai\s*)?đường\s*thẳng\s*AA'?\s*và\s*CD/i.test(sourceText),
    );
    return SolveVisualResponseSchema.parse(pair);
  }
  const pyramid = rightBasePyramidVisuals(sourceText, allowLayout);
  if (pyramid) return SolveVisualResponseSchema.parse(pyramid);
  const dimensions = readCylinderDimensions(sourceText);
  if (dimensions) {
    const visual = cylinderDimensions2d(dimensions);
    return SolveVisualResponseSchema.parse({ visual, note: visual.accessibility!.description });
  }
  const cylinder = rectangleRevolutionVisual(prompt, givens);
  const tunnel = readTunnelDimensions(sourceText);
  if (tunnel) return SolveVisualResponseSchema.parse({ visual: tunnelPlan(tunnel.length, tunnel.wide, tunnel.narrow), note: TUNNEL_NOTE });
  if (cylinder) {
    verifyGivenMeasurements(prompt, givens, cylinder);
    return SolveVisualResponseSchema.parse({
      visual: cylinder,
      note: "Hình chiếu 2D của hình trụ; hai đường tròn đáy biểu diễn bằng elip. Các trung điểm phụ thuộc đúng cạnh của đề. Kích thước không được cho chỉ dùng bố trí hình, không phải số đo đề bài.",
    });
  }
  const template = isoscelesRelationVisual(prompt, givens);
  if (template)
    return SolveVisualResponseSchema.parse({
      visual: template,
      note: "Hình dựng theo quan hệ tam giác cân và trung điểm trong đề; không đánh dấu sẵn góc vuông cần chứng minh. Kích thước minh họa không phải số đo của đề.",
    });
  return null;
}

export function compileProblemIllustration(program: Parameters<typeof compileVisualProgram>[0], prompt: string, givens: string[]) {
  const visual = freezeVisual(compileVisualProgram(program, "solve_illustration"));
  verifyGivenMeasurements(prompt, givens, visual);
  return visual;
}

export async function drawSolveVisual(
  prompt: string,
  input: GuidedProblem,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const analysis = GuidedProblemSchema.parse(input);
  assertGuidedSource(prompt, analysis);
  const sourceText = analysis.assessment?.stem || prompt;
  if (!canAttemptSolve(analysis) || knownContradictions(sourceText).length)
    throw new AppError(
      422,
      "Cần xác nhận hoặc sửa dữ kiện trước khi dựng hình.",
      "needs_review",
    );
  const known = knownProblemVisual(prompt, sourceText, analysis.givens);
  if (known) return known;
  // Spatial problems must never enter the planar AI planner. A planar fallback
  // cannot satisfy spatial relations and produces the misleading "2D only" error.
  if (isSpatialProblem(sourceText))
    throw new AppError(422,
      "Đã nhận ra bài hình học không gian, nhưng chưa đối chiếu được cấu trúc và các quan hệ của khối này. Giữ rõ tên khối, các cạnh, chân đường cao và điểm phụ thuộc trong phần giả thiết.",
      "spatial_unsupported");
  if (!analysis.givens.length)
    throw new AppError(
      422,
      "Chưa có dữ kiện để dựng hình. Hãy bổ sung đối tượng và quan hệ hình học trong đề.",
      "unsupported",
    );
  // Never pass the proof/answer/goals as construction facts. This prevents the
  // visual planner from assuming precisely the conclusion we must prove.
  const facts = analysis.givens.join("\n");
  // Explore's broad demonstrations can use arbitrary default dimensions or
  // coefficients. A Solve illustration must not substitute those for givens.
  const generated = await generateVisualProgram(facts, signal, {
    useTemplates: false,
  });
  if (!generated)
    throw new AppError(
      422,
      "Chưa dựng được hình từ dữ kiện này. Bạn vẫn có thể đọc lời giải hoặc dùng Khám phá để tự dựng hình.",
      "unsupported",
    );
  const visual = compileProblemIllustration(generated.program, prompt, analysis.givens);
  return SolveVisualResponseSchema.parse({
    visual,
    note:
      generated.source === "template"
        ? "Hình minh họa theo mẫu dựng từ dữ kiện đã đọc. Đối chiếu với đề gốc; kích thước không ghi trong đề chỉ có tính minh họa."
        : "Hình minh họa do AI đề xuất từ dữ kiện đã đọc, chưa được kiểm chứng hình học tổng quát. Đối chiếu tên điểm, cạnh và quan hệ với đề gốc.",
  });
}
