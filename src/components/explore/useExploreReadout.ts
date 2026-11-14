"use client";
import { getGeneratedReadout } from "@/lib/workspace/generated-readout";
import { getRecognizedVisualSummary } from "@/lib/workspace/recognition";
import { getSelectedDetails } from "@/lib/workspace/selected-details";
import { getVectorReadout } from "@/lib/workspace/vector-readout";

import {
  type AgentResult,
  type VisualSpec,
  type VisualStateSummary,
} from "@/lib/contracts";
import { polynomialCoefficients } from "@/lib/expression";
import { getModelReadout } from "@/lib/model-inspector";
import { getLearningSection, type LearningTab } from "@/lib/model-learning";
import type { VisualSelection } from "@/lib/runtime";
import type { VisualPatternSummary } from "@/lib/visual-patterns";
import type { RefObject } from "react";
import { useMemo } from "react";
import { ExploreRuntime } from "./shared";

type Input = {
  visual: VisualSpec | null;
  visualState: VisualStateSummary | undefined;
  selectedObject: VisualSelection | null;
  analysisResult: AgentResult | null;
  selected: string;
  selectedPattern: VisualPatternSummary | undefined;
  sketchTitle: string;
  learningTab: LearningTab;
  runtime: RefObject<ExploreRuntime | undefined>;
  result: AgentResult | null;
};
export function useExploreReadout({
  visual,
  visualState,
  selectedObject,
  analysisResult,
  selected,
  selectedPattern,
  sketchTitle,
  learningTab,
  runtime,
  result,
}: Input) {
  const values =
    visualState?.parameters ||
    Object.fromEntries(
      (visual?.parameters || []).map((item) => [item.id, item.value]),
    );
  const source2d =
    visual?.dimension === "2d"
      ? visual
      : visual?.dimension === "3d"
        ? visual.derivedFrom2d?.source
        : undefined;
  const sourceSelectionId =
    visual?.dimension === "3d"
      ? selectedObject?.id.replace(/^(?:solid_|curve_|edge_|point_|label_)/, "")
      : selectedObject?.id;
  const sourceGraph =
    source2d?.objects.find(
      (item) => item.type === "functionGraph" && item.id === sourceSelectionId,
    ) || source2d?.objects.find((item) => item.type === "functionGraph");
  const sourceCircle = source2d?.objects.find((item) => item.type === "circle");
  const sourcePolygon = source2d?.objects.find(
    (item) => item.type === "polygon",
  );
  const selectedSourceObject = source2d?.objects.find(
    (item) => item.id === sourceSelectionId,
  );
  const selectedCircle = selectedSourceObject?.type === "circle";
  const selectedPolygon = selectedSourceObject?.type === "polygon";
  const derived3dKey =
    visual?.dimension === "3d" && visual.derivedFrom2d
      ? visual.objects.some(
          (item) =>
            item.type === "sphere" && item.label?.startsWith("Mặt cầu từ"),
        )
        ? "sphere"
        : visual.objects.some(
              (item) =>
                item.type === "cylinder" &&
                item.label?.startsWith("Hình trụ từ"),
            )
          ? "cylinder"
          : visual.objects.some((item) => item.type === "extrudedPolygon")
            ? "extruded-polygon"
            : undefined
      : undefined;
  const graphPolynomial = sourceGraph?.expression
    ? polynomialCoefficients(sourceGraph.expression, values)
    : null;
  const discoveredSketchKey =
    graphPolynomial?.length === 3
      ? "quadratic-roots"
      : graphPolynomial?.length === 2
        ? "linear-function"
        : sourceCircle
          ? "circle"
          : sourcePolygon
            ? "polygon"
            : undefined;
  const catalogModelKey =
    result?.program &&
    /tích\s*vô\s*hướng|dot\s*product/i.test(result.program.title)
      ? "vector-dot-product"
      : result?.program && /bậc ba|x\s*\^\s*3|x³/i.test(result.program.title)
        ? "cubic-function"
        : result?.program
          ? "generated"
          : visual?.source?.key || selected || "unclassified";
  const selectedGeometryKey = selectedCircle
    ? "circle"
    : selectedPolygon
      ? "polygon"
      : undefined;
  const activeModelKey =
    derived3dKey ||
    selectedGeometryKey ||
    ((Boolean(result?.program) ||
      visual?.source?.key === "generated" ||
      (visual?.dimension === "3d" && Boolean(visual.derivedFrom2d))) &&
    discoveredSketchKey
      ? discoveredSketchKey
      : catalogModelKey);
  const generatedReadout = useMemo(
    () =>
      getGeneratedReadout({
        analysisResult: analysisResult,
        selectedCircle: selectedCircle,
        selectedObject: selectedObject,
        selectedSourceObject: selectedSourceObject,
        selectedPolygon: selectedPolygon,
        source2d: source2d,
        sourceGraph: sourceGraph,
        values: values,
        visual: visual,
        visualState: visualState,
      }),
    [
      analysisResult,
      selectedCircle,
      selectedObject,
      selectedSourceObject,
      selectedPolygon,
      source2d,
      sourceGraph,
      values,
      visual,
      visualState,
    ],
  );
  const vectorReadout = useMemo(
    () =>
      getVectorReadout({
        activeModelKey: activeModelKey,
        visual: visual,
        visualState: visualState,
      }),
    [activeModelKey, visual, visualState],
  );
  const readout = useMemo(
    () =>
      generatedReadout ||
      vectorReadout ||
      getModelReadout(activeModelKey, values),
    [activeModelKey, generatedReadout, values, vectorReadout],
  );
  const learningKey = /Nhiều đối tượng|chưa xác định/.test(readout.heading)
    ? "unclassified"
    : visual?.source?.key === "geometry-problem"
      ? "geometry-problem"
      : /^Đoạn thẳng/.test(readout.heading)
        ? "segment"
        : selectedCircle && visual?.dimension === "2d"
          ? "circle"
          : selectedPolygon && visual?.dimension === "2d"
            ? "polygon"
            : /khối đùn/i.test(readout.heading)
              ? "extruded-polygon"
              : /hình cầu/i.test(readout.heading)
                ? "sphere"
                : /hình trụ/i.test(readout.heading)
                  ? "cylinder"
                  : graphPolynomial?.length === 2
                    ? "linear-function"
                    : activeModelKey;
  const learning = useMemo(
    () => getLearningSection(learningKey, learningTab, readout),
    [learningKey, learningTab, readout],
  );
  const lessonTitle = visual
    ? visual.source?.key === "geometry-problem"
      ? analysisResult?.title || "Tứ diện ABCD theo dữ kiện đề bài"
      : visual.source?.key === "generated" ||
          (visual.dimension === "3d" && visual.derivedFrom2d)
        ? readout.heading
        : sketchTitle ||
          analysisResult?.program?.title ||
          selectedPattern?.title ||
          readout.heading
    : "Bảng vẽ trắng";
  const parameterDetails = useMemo(() => {
    const expression = sourceGraph?.expression?.replace(/\s/g, "");
    const isCubic = expression === "a*x^3+b*x^2+c*x+d";
    const isQuadratic = Boolean(
      expression && polynomialCoefficients(expression, values)?.length === 3,
    );
    const cubicRoles: Record<string, string> = {
      a: "Quyết định chiều đi và độ dốc tổng thể.",
      b: "Làm thay đổi vị trí điểm uốn.",
      c: "Ảnh hưởng độ dốc quanh điểm uốn.",
      d: "Tịnh tiến đồ thị theo trục Oy.",
    };
    const quadraticRoles: Record<string, string> = {
      a: "Quyết định chiều mở và độ rộng của parabol.",
      b: "Cùng với a xác định trục đối xứng và vị trí đỉnh.",
      c: "Là tung độ giao điểm của đồ thị với trục Oy.",
    };
    return (visual?.parameters || []).slice(0, 4).map((parameter) => ({
      id: parameter.id,
      label: parameter.label,
      value: values[parameter.id] ?? parameter.value,
      description:
        visual?.source?.key === "geometry-problem"
          ? "Đổi độ dài cạnh; các góc và cấu trúc đề bài vẫn được giữ đúng."
          : isCubic
            ? cubicRoles[parameter.id] || "Hệ số điều khiển dáng điệu đồ thị."
            : isQuadratic
              ? quadraticRoles[parameter.id]
              : "Tham số điều khiển trực tiếp mô hình đang quan sát.",
    }));
  }, [sourceGraph?.expression, values, visual]);
  const displayGraphExpression =
    sourceGraph?.expression &&
    !selectedCircle &&
    !selectedPolygon &&
    !derived3dKey &&
    source2d?.objects.filter(
      (o) =>
        o.visible && ["circle", "polygon", "functionGraph"].includes(o.type),
    ).length === 1
      ? sourceGraph.expression.replace(/[a-zA-Z_]\w*/g, (name) =>
          Object.hasOwn(values, name) && Number.isFinite(values[name])
            ? values[name] < 0
              ? `(${values[name]})`
              : String(values[name])
            : name,
        )
      : null;
  const liveObservation = useMemo(() => {
    if (!visual)
      return "Vẽ trực tiếp, bật trục tọa độ hoặc khoanh một vùng để hỏi AI.";
    const a = values.a;
    if (
      /bậc ba|x\s*\^\s*3|x³/i.test(`${lessonTitle} ${readout.formula}`) &&
      Number.isFinite(a)
    )
      return a > 0
        ? "a > 0: đồ thị đi từ dưới trái lên trên phải."
        : a < 0
          ? "a < 0: đồ thị đi từ trên trái xuống dưới phải."
          : "a = 0: biểu thức không còn là hàm số bậc ba.";
    return (
      readout.observations[0] ||
      "Thay đổi một tham số để quan sát mô hình cập nhật theo thời gian thực."
    );
  }, [lessonTitle, readout, values, visual]);
  const liveMetricChips = !visual
    ? []
    : parameterDetails.length
      ? parameterDetails.map((parameter) => ({
          label: parameter.label,
          value: parameter.value,
        }))
      : readout.metrics
          .slice(0, 4)
          .map((metric) => ({ label: metric.label, value: metric.value }));
  const selectedDetails = useMemo(
    () =>
      getSelectedDetails({
        selectedObject:
          selectedObject &&
          visual?.dimension === "3d" &&
          runtime.current &&
          "selectionInfo" in runtime.current
            ? runtime.current.selectionInfo(selectedObject!)
            : selectedObject,
        visual: visual,
        visualState: visualState,
      }),
    [selectedObject, visual, visualState],
  );
  const recognition = useMemo(
    () =>
      getRecognizedVisualSummary({
        analysisResult: analysisResult,
        values: values,
      }),
    [analysisResult, values],
  );
  return {
    values,
    source2d,
    sourceSelectionId,
    sourceGraph,
    sourceCircle,
    sourcePolygon,
    selectedSourceObject,
    selectedCircle,
    selectedPolygon,
    derived3dKey,
    graphPolynomial,
    discoveredSketchKey,
    catalogModelKey,
    selectedGeometryKey,
    activeModelKey,
    generatedReadout,
    vectorReadout,
    readout,
    learningKey,
    learning,
    lessonTitle,
    parameterDetails,
    displayGraphExpression,
    liveObservation,
    liveMetricChips,
    selectedDetails,
    recognition,
  };
}
