import {
  VisualSpecSchema,
  type TwoDVisualSpec,
  type VisualSpec,
} from "@/lib/contracts";
import { type ExplorationEvent } from "@/lib/exploration-contracts";
import { resolveSolidSelection } from "@/lib/three-selection";
import { validateVisual } from "@/lib/validation";
import {
  applyExploreConstruction,
  DRAWING_TOOLS,
  type DrawingStyle,
  type DrawingTool,
} from "@/lib/explore-drawing-constructions";
import {
  inkPointOnBoard,
  removeVisualObject,
  type InkPlacement,
} from "@/lib/graph-ink-geometry";
import type { VertexHit, VisualSelection } from "@/lib/runtime";
import { editObjectAnnotation, selectedAnnotation } from "@/lib/object-annotations";
import { findVisualObject, projectedObjects, removeProjectedObjects } from "@/lib/projected-objects";
import { rebuildSketch3d, restoreSketch2d } from "@/lib/sketch-3d";
import { connectVisualVertices } from "@/lib/visual-connections";
import {
  canStyleEdge,
  isConstituentEdge,
  restoreHiddenEdges,
  selectedEdgeStyle,
  styleVisualEdge,
  type StrokePatch,
} from "@/lib/visual-edge-style";
import { ExploreStep } from "./shared";
import type { ExploreState } from "./useExploreState";
type Context = Pick<
  ExploreState,
  | "boardOptions"
  | "coordinateEditRef"
  | "sceneDocument"
  | "graphMenu"
  | "objectLabelDraft"
  | "objectMeasurementDraft"
  | "objectNoteDraft"
  | "runtime"
  | "selectedObject"
  | "selectedObjects"
  | "setAnalysisResult"
  | "setAnalysisStatus"
  | "setCoordinateDraft"
  | "setDrawingCancelRevision"
  | "setError"
  | "setGraphMenu"
  | "setInkDraft"
  | "setNotice"
  | "setObjectLabelDraft"
  | "setObjectMeasurementDraft"
  | "setObjectNoteDraft"
  | "setResult"
  | "setSelectedObject"
  | "setSelectedObjects"
  | "setSketchTitle"
  | "setVisual"
  | "setVisualState"
  | "visual"
  | "visualStateRef"
> & {
  recordSessionEvent: (
    type: ExplorationEvent["type"],
    label: string,
    targetId?: string,
    payload?: Record<string, unknown>,
  ) => void;
  markStep: (id: ExploreStep) => void;
};
/** Commands capture the current render state; durable identities stay in refs. */
export function createExploreGeometryActions({
  boardOptions,
  coordinateEditRef,
  sceneDocument,
  graphMenu,
  objectLabelDraft,
  objectMeasurementDraft,
  objectNoteDraft,
  runtime,
  selectedObject,
  selectedObjects,
  setAnalysisResult,
  setAnalysisStatus,
  setCoordinateDraft,
  setDrawingCancelRevision,
  setError,
  setGraphMenu,
  setInkDraft,
  setNotice,
  setObjectLabelDraft,
  setObjectMeasurementDraft,
  setObjectNoteDraft,
  setResult,
  setSelectedObject,
  setSelectedObjects,
  setSketchTitle,
  setVisual,
  setVisualState,
  visual,
  visualStateRef,
  recordSessionEvent,
  markStep,
}: Context) {
  function drawingSnapshot(): VisualSpec | null {
    const snapshot = runtime.current?.serialized();
    return snapshot && snapshot.dimension === visual?.dimension
      ? (snapshot as VisualSpec)
      : visual;
  }
  function rememberGeometry(snapshot = drawingSnapshot()) {
    sceneDocument.rememberGeometry(snapshot);
  }
  function restoreGeometry(next: VisualSpec | null, label: string) {
    setVisual(next);
    setSelectedObject(null);
    setSelectedObjects([]);
    setGraphMenu(null);
    setCoordinateDraft(null);
    setVisualState(undefined);
    visualStateRef.current = undefined;
    setResult((current) =>
      current && next ? { ...current, visual: next } : null,
    );
    setAnalysisResult((current) =>
      current && next ? { ...current, visual: next } : null,
    );
    setDrawingCancelRevision((n) => n + 1);
    setNotice(label);
    recordSessionEvent("interaction", label, undefined, { visual: next });
  }
  function travelGeometry(direction: "undo" | "redo") {
    const target = sceneDocument.travelHistory(direction, drawingSnapshot());
    if (target === undefined) return;
    restoreGeometry(target, direction === "undo" ? "Undo" : "Redo");
  }
  function commitVisual(next: VisualSpec, label = "Đã cập nhật bảng") {
    const checked = validateVisual(next);
    sceneDocument.commitScene(checked, drawingSnapshot());
    restoreGeometry(checked, label);
  }
  function commitDrawing(
    tool: DrawingTool,
    hits: VertexHit[],
    style: DrawingStyle,
  ) {
    const snapshot = drawingSnapshot();
    if (snapshot?.dimension === "3d")
      throw Error("Hãy trở về 2D trước khi dựng hình.");
    const bounds =
      runtime.current && "boundingBox" in runtime.current
        ? runtime.current.boundingBox()
        : [-10, 7, 10, -7];
    const next = applyExploreConstruction(
      snapshot as TwoDVisualSpec | null,
      tool,
      hits,
      style,
      bounds as [number, number, number, number],
    );
    sceneDocument.commitScene(next, snapshot);
    setSelectedObject(null);
    setSelectedObjects([]);
    setGraphMenu(null);
    setError("");
    setResult((current) => (current ? { ...current, visual: next } : null));
    setAnalysisResult((current) =>
      current ? { ...current, visual: next } : null,
    );
    recordSessionEvent(
      "interaction",
      `Dựng: ${DRAWING_TOOLS[tool].label}`,
      next.id,
      { visual: next },
    );
    setNotice(
      `Đã dựng ${DRAWING_TOOLS[tool].label.toLowerCase()}. Chọn / Kéo để di chuyển điểm gốc; các quan hệ sẽ tự cập nhật.`,
    );
  }
  function commitGeometryEdit(
    edit: (source: TwoDVisualSpec) => TwoDVisualSpec,
    label: string,
  ) {
    const snapshot = drawingSnapshot();
    if (!snapshot || snapshot.dimension !== "2d")
      throw Error("Chọn một hình 2D trước khi chỉnh sửa.");
    const next = edit(snapshot);
    rememberGeometry(snapshot);
    setVisual(next);
    setSelectedObject(null);
    setSelectedObjects([]);
    setGraphMenu(null);
    setResult((current) => (current ? { ...current, visual: next } : null));
    setAnalysisResult((current) =>
      current ? { ...current, visual: next } : null,
    );
    recordSessionEvent("interaction", label, next.id, { visual: next });
    setNotice(label);
    setError("");
  }
  function applyGraphInk(
    drawn: TwoDVisualSpec,
    placement: InkPlacement,
    stage: DOMRect,
  ) {
    const activeRuntime = runtime.current;
    if (
      visual?.dimension === "3d" ||
      !activeRuntime ||
      !("screenToUser" in activeRuntime)
    )
      throw Error("Bảng vẽ chưa sẵn sàng. Hãy thử lại sau khi bảng hiển thị.");
    const base =
      visual?.dimension === "2d" && "serialized" in activeRuntime
        ? (activeRuntime.serialized() as TwoDVisualSpec)
        : null;
    if (base && base.objects.length + drawn.objects.length > 80)
      throw Error(
        "Đồ thị đã đạt giới hạn 80 đối tượng. Hãy xóa bớt điểm hoặc cạnh trước khi chuẩn hóa.",
      );
    const idMap = new Map(
      drawn.objects.map((object, index) => [
        object.id,
        `ink_${Date.now().toString(36)}_${index}`,
      ]),
    );
    const inkPoints = drawn.objects.filter(
      (object) =>
        object.type === "point" &&
        object.free &&
        typeof object.x === "number" &&
        typeof object.y === "number",
    );
    if (!inkPoints.length)
      throw Error("Hình nhận dạng không có điểm để đặt lên đồ thị.");
    const circlePoints = new Set(
      drawn.objects.filter((object) => object.type === "circle").flatMap((object) => object.parents),
    );
    const additions = drawn.objects.map((object) => {
      const copy = structuredClone(object);
      copy.id = idMap.get(object.id)!;
      copy.parents = copy.parents.map((parent) => idMap.get(parent) || parent);
      if (
        copy.type === "point" &&
        copy.free &&
        typeof copy.x === "number" &&
        typeof copy.y === "number"
      ) {
        if (circlePoints.has(object.id)) copy.removeWhenUnused = true;
        const screen = inkPointOnBoard(copy.x, copy.y, placement);
        const point = activeRuntime.screenToUser(
          stage.left + screen.x,
          stage.top + screen.y,
        );
        if (!point)
          throw Error("Không quy đổi được nét vẽ sang tọa độ đồ thị.");
        copy.x = boardOptions.snap ? Math.round(point.x) : point.x;
        copy.y = boardOptions.snap ? Math.round(point.y) : point.y;
      }
      return copy;
    });
    const [left, top, right, bottom] =
      "boundingBox" in activeRuntime
        ? activeRuntime.boundingBox()
        : visual?.dimension === "2d"
          ? [
              visual.viewport.x[0],
              visual.viewport.y[1],
              visual.viewport.x[1],
              visual.viewport.y[0],
            ]
          : [-10, 7, 10, -7];
    const next = VisualSpecSchema.parse(
      base
        ? { ...base, objects: [...base.objects, ...additions] }
        : {
            ...drawn,
            objects: additions,
            viewport: { x: [left, right], y: [bottom, top] },
          },
    );
    rememberGeometry();
    setVisual(next);
    setSketchTitle(drawn.accessibility?.description || "Phác thảo trên đồ thị");
    setResult(null);
    setAnalysisResult(null);
    setAnalysisStatus("ready");
    setSelectedObject(null);
    recordSessionEvent(
      "interaction",
      "Chuẩn hóa nét vẽ trên đồ thị",
      undefined,
      { visual: next, objectsAdded: additions.length },
    );
    setNotice(
      `Đã chuẩn hóa và thêm ${additions.filter((object) => object.type === "point").length} điểm cùng các nét dựng vào đồ thị.`,
    );
  }
  function saveSelectedAnnotation() {
    const base = drawingSnapshot();
    if (!selectedObject || !base) return;
    try {
      const next = editObjectAnnotation(base, selectedObject, {
        label: objectLabelDraft.trim() || undefined,
        measurement: objectMeasurementDraft.trim() || undefined,
        note: objectNoteDraft.trim() || undefined,
      });
      commitVisual(next, "Đã lưu thông tin đối tượng.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Chưa lưu được thông tin.");
    }
  }
  function connectVertices(
    first: VertexHit,
    second: VertexHit,
    lineStyle: "solid" | "dashed",
  ) {
    if (runtime.current && "vertices" in runtime.current) {
      const currentVertices = runtime.current.vertices();
      const refresh = (vertex: VertexHit) =>
        currentVertices.find(
          (candidate) =>
            candidate.objectId === vertex.objectId &&
            candidate.vertexIndex === vertex.vertexIndex,
        ) || vertex;
      first = refresh(first);
      second = refresh(second);
    }
    if (!runtime.current || !("serialized" in runtime.current))
      throw Error("Bảng vẽ chưa sẵn sàng.");
    const bounds =
      "boundingBox" in runtime.current
        ? runtime.current.boundingBox()
        : [-10, 7, 10, -7];
    const base = runtime.current.serialized() || {
      id: `ink_${Date.now().toString(36)}`,
      version: 1,
      dimension: "2d",
      engine: "jsxgraph",
      source: { key: "generated", version: 1 },
      kind: "geometry",
      surfaceFill: true,
      viewport: { x: [bounds[0], bounds[2]], y: [bounds[3], bounds[1]] },
      objects: [],
      parameters: [],
    };
    const next = connectVisualVertices(
      base as VisualSpec,
      first,
      second,
      lineStyle,
    );
    rememberGeometry();
    setVisual(next);
    setResult((current) => (current ? { ...current, visual: next } : null));
    setAnalysisResult((current) =>
      current ? { ...current, visual: next } : null,
    );
    setSelectedObject(null);
    setSelectedObjects([]);
    setGraphMenu(null);
    setError("");
    setNotice(
      `Đã nối ${first.label} với ${second.label} bằng ${lineStyle === "dashed" ? "nét đứt" : "nét liền"}.`,
    );
    recordSessionEvent("interaction", "Vẽ đoạn giữa hai vị trí", next.id, {
      visual: next,
    });
  }
  function deleteSelectedObject(wholeObject = false) {
    if (!visual) return;
    if (!wholeObject && selectedObject?.faceIndex !== undefined && selectedObjects.length <= 1) {
      setNotice("Mặt này thuộc cấu trúc của khối. Bấm Cả khối rồi Xóa đối tượng để xóa khối.");
      return;
    }
    const targets = [
      ...new Set(
        graphMenu?.ids?.length
          ? graphMenu.ids
          : selectedObjects.length
            ? selectedObjects.map((item) => item.id)
            : selectedObject
              ? [selectedObject.id]
              : [],
      ),
    ];
    if (!targets.length) return;
    const clearSelectionAfterDelete = () => {
      setSelectedObject(null);
      setSelectedObjects([]);
      setGraphMenu(null);
      setInkDraft((draft) => (draft?.selection ? { ...draft, selection: null } : draft));
    };
    if (
      !wholeObject &&
      targets.length === 1 &&
      selectedObject &&
      isConstituentEdge(visual, selectedObject)
    ) {
      if (!changeSelectedEdgeStyle({ hidden: true })) return;
      clearSelectionAfterDelete();
      setNotice(
        "Đã xóa nét cạnh được chọn; giữ nguyên các đỉnh, mặt và đường nối phụ thuộc. Có thể khôi phục trong Thông tin → Hiện lại cạnh đã ẩn.",
      );
      return;
    }
    if (
      !wholeObject &&
      selectedObject?.vertexIndex !== undefined &&
      targets.length === 1
    ) {
      setNotice(
        "Đỉnh này thuộc cấu trúc của khối, không thể xóa riêng. Chọn Xóa cả khối nếu muốn xóa toàn bộ.",
      );
      return;
    }
    if (
      (wholeObject ||
        (visual.dimension === "3d" &&
          targets.some((id) =>
            visual.objects.some(
              (o) =>
                o.id === id &&
                !o.marker &&
                !["curve3d", "label3d"].includes(o.type),
            ),
          ))) &&
      !window.confirm(
        "Xóa toàn bộ hình/khối đã chọn và các đối tượng phụ thuộc? Thao tác này không chỉ ẩn một cạnh.",
      )
    )
      return;
    let base: VisualSpec = visual;
    if (runtime.current && "serialized" in runtime.current) {
      const snapshot = runtime.current.serialized();
      if (
        snapshot &&
        "dimension" in snapshot &&
        snapshot.dimension === visual.dimension
      )
        base = snapshot as VisualSpec;
    }
    let next: VisualSpec | null = base;
    let removedCount = 0;
    const removedAutomaticPoints = new Set<string>();
    const sourceTargets = base.dimension === "3d" && base.derivedFrom2d
      ? targets.map((id) => id.replace(/^(?:solid|curve|edge|point|label)_/, ""))
      : targets;
    if (base.dimension === "2d") {
      const before = base.objects.length;
      const spatialIds = new Set(projectedObjects(base).map((object) => object.id));
      const projected = targets.filter((id) => spatialIds.has(id));
      if (projected.length) {
        const result = removeProjectedObjects(base, projected);
        next = result.spec;
        removedCount = result.count;
      }
      for (const target of targets.filter((id) => !spatialIds.has(id))) {
        if (!next || next.dimension !== "2d") break;
        next = removeVisualObject(next, target, removedAutomaticPoints);
      }
      removedCount += before - (next?.dimension === "2d" ? next.objects.length : 0);
    } else if (base.derivedFrom2d) {
      let source: TwoDVisualSpec | null = restoreSketch2d(base);
      const before =
        source.objects.length +
        (source.spatialConnections?.length || 0) +
        (source.spatialPoints?.length || 0) +
        (source.savedSpatialObjects?.length || 0);
      const spatialRemoved = new Set(targets);
      let spatialGrew = true;
      while (spatialGrew) {
        spatialGrew = false;
        for (const c of source.spatialConnections || [])
          if (
            !spatialRemoved.has(c.id) &&
            c.endpoints.some((a) => spatialRemoved.has(a.objectId))
          ) {
            spatialRemoved.add(c.id);
            spatialGrew = true;
          }
        for (const object of source.savedSpatialObjects ?? []) {
          const references = [
            ...(object.vertexEndpoints?.map((anchor) => anchor.objectId) ?? []),
            ...(object.spatialConstruction?.inputs.flatMap((point) => point.anchor ? [point.anchor.objectId] : []) ?? []),
            object.spatialConstruction?.sourceId,
            object.net?.sourceId,
          ];
          if (!spatialRemoved.has(object.id) && references.some((id) => id && spatialRemoved.has(id))) {
            spatialRemoved.add(object.id);
            spatialGrew = true;
          }
        }
      }
      if (source.spatialConnections)
        source.spatialConnections = source.spatialConnections.filter(
          (c) => !spatialRemoved.has(c.id),
        );
      if (source.spatialStyles)
        source.spatialStyles = source.spatialStyles.filter(
          (style) => !spatialRemoved.has(style.objectId),
        );
      if (source.spatialPoints)
        source.spatialPoints = source.spatialPoints.filter(
          (point) => !targets.includes(point.id),
        );
      const previousSpatial = source.savedSpatialObjects ?? [];
      source.savedSpatialObjects = previousSpatial.filter((object) => !spatialRemoved.has(object.id));
      for (const id of sourceTargets) {
        if (!source?.objects.some((object) => object.id === id)) continue;
        source = removeVisualObject(source, id, removedAutomaticPoints);
      }
      removedCount =
        before -
        ((source?.objects.length || 0) +
          (source?.spatialConnections?.length || 0) +
          (source?.spatialPoints?.length || 0) +
          (source?.savedSpatialObjects?.length || 0));
      if (!source) next = null;
      else {
        const remainingSpatial = new Set(source.savedSpatialObjects?.map((object) => object.id));
        for (const object of previousSpatial)
          if (!remainingSpatial.has(object.id)) spatialRemoved.add(object.id);
        const positions = Object.fromEntries(
          Object.entries(base.derivedFrom2d.positions || {}).filter(([id]) =>
            source!.objects.some(
              (o) => o.id === id && !(o.type === "point" && o.free),
            ),
          ),
        );
        next = rebuildSketch3d({
          ...base,
          objects: base.objects.filter((object) => !spatialRemoved.has(object.id)),
          derivedFrom2d: { ...base.derivedFrom2d, source, positions },
        });
      }
    } else {
      const removed = new Set(targets);
      let grew = true;
      while (grew) {
        grew = false;
        for (const object of base.objects)
          if (
            !removed.has(object.id) &&
            (object.vertexEndpoints?.some((anchor) =>
              removed.has(anchor.objectId),
            ) || object.spatialConstruction?.inputs.some(p=>p.anchor && removed.has(p.anchor.objectId)) || (object.spatialConstruction?.sourceId && removed.has(object.spatialConstruction.sourceId)) || (object.net && removed.has(object.net.sourceId)))
          ) {
            removed.add(object.id);
            grew = true;
          }
      }
      const objects = base.objects.filter((object) => !removed.has(object.id));
      removedCount = base.objects.length - objects.length;
      next = objects.length
        ? VisualSpecSchema.parse({ ...base, objects })
        : null;
    }
    const checked = next ? VisualSpecSchema.parse(next) : null;
    sourceTargets.forEach((id) => removedAutomaticPoints.delete(id));
    const dependencyCount = removedCount - targets.length - removedAutomaticPoints.size;
    if (
      dependencyCount > 0 &&
      !window.confirm(
        `Xóa ${targets.length} đối tượng đã chọn sẽ xóa thêm ${dependencyCount} đối tượng phụ thuộc. Tiếp tục? Có thể Hoàn tác hình học để khôi phục.`,
      )
    )
      return;
    rememberGeometry(base);
    setVisual(checked);
    setResult((current) =>
      current && checked ? { ...current, visual: checked } : null,
    );
    setAnalysisResult((current) =>
      current && checked ? { ...current, visual: checked } : null,
    );
    clearSelectionAfterDelete();
    setCoordinateDraft(null);
    const label =
      selectedObjects.length > 1
        ? `${selectedObjects.length} đối tượng được chọn`
        : selectedObject?.label || "đối tượng";
    recordSessionEvent(
      "interaction",
      `Xóa ${label}`,
      targets.length === 1 ? targets[0] : undefined,
      { visual: checked, deletedIds: targets },
    );
    setNotice(
      checked
        ? `Đã xóa ${removedCount} đối tượng cùng các hình phụ thuộc.`
        : "Đã xóa đối tượng cuối cùng; bảng vẽ trở về trạng thái trắng.",
    );
  }
  function changeSelectedEdgeStyle(patch: StrokePatch) {
    if (!selectedObject || !visual) return false;
    try {
      const snapshot = runtime.current?.serialized();
      const base =
        snapshot && snapshot.dimension === visual.dimension
          ? (snapshot as VisualSpec)
          : visual;
      const next = styleVisualEdge(base, selectedObject, patch);
      rememberGeometry(base);
      setVisual(next);
      setResult((current) => (current ? { ...current, visual: next } : null));
      setAnalysisResult((current) =>
        current ? { ...current, visual: next } : null,
      );
      recordSessionEvent(
        "interaction",
        "Đổi màu/độ dày cạnh",
        selectedObject.id,
        { visual: next, edgeIndex: selectedObject.edgeIndex, ...patch },
      );
      setNotice("Đã cập nhật kiểu nét cho cạnh được chọn.");
      setError("");
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không cập nhật được kiểu cạnh.",
      );
      return false;
    }
  }
  const edgeStyle =
    visual && selectedObject && canStyleEdge(selectedObject)
      ? selectedEdgeStyle(visual, selectedObject)
      : null;
  function showHiddenEdges() {
    if (!visual) return;
    const snapshot = runtime.current?.serialized();
    const next = restoreHiddenEdges(
      snapshot && snapshot.dimension === visual.dimension
        ? (snapshot as VisualSpec)
        : visual,
    );
    setVisual(next);
    setResult((current) => (current ? { ...current, visual: next } : null));
    setAnalysisResult((current) =>
      current ? { ...current, visual: next } : null,
    );
    recordSessionEvent("interaction", "Hiện lại cạnh đã ẩn", undefined, {
      visual: next,
    });
    setNotice("Đã hiện lại các cạnh; màu và độ dày vẫn được giữ nguyên.");
  }
  function handleVisualSelect(selection: VisualSelection, direct = false) {
    if (visual?.dimension === "3d" && !direct) {
      const resolved = resolveSolidSelection(visual, selection, selectedObject);
      const active = runtime.current;
      selection = resolved !== selection && active && "selectionInfo" in active
        ? active.selectionInfo(resolved) ?? resolved
        : resolved;
    }
    setSelectedObject(selection);
    setSelectedObjects([selection]);
    setGraphMenu(null);
    const snapshot = drawingSnapshot();
    const object = snapshot && findVisualObject(snapshot, selection.id);
    const fields = object ? selectedAnnotation(object, selection) : undefined;
    setObjectLabelDraft(fields?.label ?? "");
    setObjectMeasurementDraft(fields?.measurement ?? "");
    setObjectNoteDraft(fields?.note ?? "");
    recordSessionEvent(
      "object-selected",
      `Chọn ${selection.kind || selection.type}: ${selection.label}`,
      selection.id,
    );
    const current = visualStateRef.current?.objects[selection.id];
    setCoordinateDraft(
      selection.editable &&
        current &&
        typeof current.x === "number" &&
        typeof current.y === "number"
        ? {
            id: selection.id,
            x: String(Number(current.x.toFixed(2))),
            y: String(Number(current.y.toFixed(2))),
          }
        : null,
    );
    coordinateEditRef.current = false;
  }
  function handleRegionSelect(
    rect: { x: number; y: number; width: number; height: number },
    stage: DOMRect,
  ) {
    const active = runtime.current;
    if (!active || !("objectsInScreenRect" in active)) return;
    const selected = active.objectsInScreenRect({
      x: stage.left + rect.x,
      y: stage.top + rect.y,
      width: rect.width,
      height: rect.height,
    });
    setSelectedObjects(selected);
    setSelectedObject(selected[0] || null);
    setCoordinateDraft(null);
    if (!selected.length) {
      setGraphMenu(null);
      setNotice("Vùng khoanh chưa chứa đối tượng nào.");
      return;
    }
    const x = Math.max(8, Math.min(rect.x + rect.width, stage.width - 264));
    const y = Math.max(8, Math.min(rect.y + rect.height, stage.height - 160));
    setGraphMenu({
      id: selected[0].id,
      ids: selected.map((item) => item.id),
      x,
      y,
      editing: false,
    });
    setNotice(
      `Đã chọn ${selected.length} đối tượng trong vùng. Nhấn Delete hoặc dùng menu để xóa.`,
    );
  }
  return {
    drawingSnapshot,
    rememberGeometry,
    restoreGeometry,
    travelGeometry,
    commitDrawing,
    commitVisual,
    commitGeometryEdit,
    applyGraphInk,
    saveSelectedAnnotation,
    connectVertices,
    deleteSelectedObject,
    changeSelectedEdgeStyle,
    edgeStyle,
    showHiddenEdges,
    handleVisualSelect,
    handleRegionSelect,
  };
}
