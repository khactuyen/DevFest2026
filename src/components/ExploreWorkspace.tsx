"use client";
import { useEffect, useState } from "react";

import "@/app/explore/drawing-tools.css";
import { CYLINDER_DIMENSIONS_KEY } from "@/lib/cylinder-problem-visual";
import { type Sketch3dMode } from "@/lib/sketch-3d";
import { hiddenEdgeCount, isConstituentEdge } from "@/lib/visual-edge-style";
import {
  CheckCircle2,
  ChevronDown,
  Minus,
  PenLine,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { EdgeStyleControls } from "./EdgeStyleControls";
import { FloatingAiTrigger } from "./FloatingAi";
import { ExploreCatalog } from "./explore/ExploreCatalog";
import { ExploreContextPanel } from "./explore/ExploreContextPanel";
import { ExploreInputPanel } from "./explore/ExploreInputPanel";
import {
  GeometryAnnotationKind,
  geometryAnnotationLabels,
} from "./explore/shared";
import { useExploreWorkspace } from "./explore/useExploreWorkspace";
import { ExploreDrawingTools } from "./ExploreDrawingTools";
import { ExploreSpatialControls } from "./ExploreSpatialControls";
import { ExploreBoardContent } from "./ExploreBoardContent";
import { ExploreFunctionTools } from "./ExploreFunctionTools";
import { ExploreObjectActions } from "./ExploreObjectActions";
import "@/app/styles/spatial-tools.css";
import { ExploreSelectionToolbar } from "./ExploreSelectionToolbar";
import { GraphInkOverlay } from "./GraphInkOverlay";
import { Visual } from "./Visual";
import { LessonBoardSchema, lessonBoardTransferKey, type LessonBoard } from "@/lib/lesson-board";
import type { VisualSpec } from "@/lib/contracts";
import { learnerSessionId } from "@/lib/learner";
import { examBoardDragType } from "@/lib/exam-document";
import { ExploreBoardTransfer, type BoardTransfer } from "./ExploreBoardTransfer";

type BoardEditor = {
  initial: { visual: VisualSpec | null; board: LessonBoard };
  context: string;
  onApply: (visual: VisualSpec | null, board: LessonBoard) => void;
  onCancel: () => void;
  busy: boolean;
  onDrag?: (visual: VisualSpec | null, board: LessonBoard) => void;
};

export function ExploreWorkspace({ editor }: { editor?: BoardEditor } = {}) {
  const model = useExploreWorkspace(editor?.initial);
  const [transfer, setTransfer] = useState<{ data: BoardTransfer; selection: string[] } | null>(null);
  const Root = editor ? "div" : "main";
  useEffect(() => {
    const active = model.runtime.current;
    if (active && "setSelection" in active) active.setSelection(model.selectedObject);
    return () => { if (active && "setSelection" in active) active.setSelection(null); };
  }, [model.selectedObject, model.visual]);
  const {
    analysisError,
    analysisStatus,
    applyGraphInk,
    assistantOpen,
    boardOptions,
    canvasHost,
    changeSelectedEdgeStyle,
    commitDrawing,
    commitVisual,
    constructDirect,
    translateGroup,
    moveLabel,
    connectVertices,
    connectionVertices,
    deleteSelectedObject,
    drawingActive,
    drawingCancelRevision,
    drawingSnapshot,
    drawingStage,
    edgeStyle,
    error,
    geometryAnnotations,
    canUndo,
    canRedo,
    geometryWarning,
    graphMenu,
    handleLassoAsk,
    handleRegionSelect,
    handleRuntimeReady,
    handleVisualSelect,
    handleVisualState,
    inkDraft,
    inkMountRevision,
    inputDockOpen,
    nativeDragBefore,
    notice,
    objectLabelDraft,
    objectMeasurementDraft,
    objectNoteDraft,
    readout,
    rememberGeometry,
    runtime,
    saveSelectedAnnotation,
    sceneLoadError,
    sceneLoading,
    selectedObject,
    selectedObjects,
    setAssistantOpen,
    setDrawingActive,
    setDrawingCancelRevision,
    setGraphMenu,
    setInkDraft,
    setInputDockOpen,
    setInputTab,
    setObjectLabelDraft,
    setObjectMeasurementDraft,
    setObjectNoteDraft,
    setSceneRetry,
    setSelectedObject,
    setSelectedObjects,
    showHiddenEdges,
    surfaceFill,
    switchBoardDimension,
    toggleBoardOption,
    toggleGeometryAnnotation,
    toggleSurfaceFill,
    travelGeometry,
    visual,
    zoomBoard,
  } = model;
  const annotationIsEdge = !!selectedObject && (
    selectedObject.edgeIndex !== undefined || ["segment", "line", "arrow", "curve3d"].includes(selectedObject.type)
  );
  const annotationIsVertex = !!selectedObject && (
    selectedObject.vertexIndex !== undefined || ["point", "glider", "projection", "intersection", "midpoint"].includes(selectedObject.type)
  );
  const graphMenuTop = graphMenu?.editing
    ? Math.min(graphMenu.y, Math.max(8, (drawingStage?.clientHeight ?? 420) - 350))
    : graphMenu?.y;
  const triangle = visual?.dimension === "2d" ? visual.objects.find(
    (object) => object.id === selectedObject?.id && object.type === "polygon" && object.parents.length === 3,
  ) : undefined;
  function constructOnTriangle(tool: "altitude" | "circumcircle", first = 0) {
    if (!triangle) return;
    try {
      const active = runtime.current;
      const state = active && "state" in active ? active.state().objects : {};
      const ids = [...triangle.parents.slice(first), ...triangle.parents.slice(0, first)];
      commitDrawing(tool, ids.map((id) => {
        const point = state[id];
        if (!point || !("x" in point) || point.x === undefined || point.y === undefined)
          throw Error("Không đọc được tọa độ đỉnh tam giác.");
        return { objectId: id, label: id, position: [point.x, point.y, 0] };
      }), { color: "#168265", strokeWidth: 2.25, lineStyle: "solid" });
    } catch (error) {
      model.reportBoardError(error instanceof Error ? error.message : "Chưa dựng được trên tam giác.");
    }
  }
  function captureBoard() {
    const scene = drawingSnapshot();
    const active = runtime.current;
    return {
      visual: scene,
      board: LessonBoardSchema.parse({
        version: 1,
        options: boardOptions,
        ink: inkDraft?.strokes.length ? { ...inkDraft, selection: null, past: [], future: [] } : undefined,
        size: drawingStage?.clientWidth && drawingStage.clientHeight
          ? { width: drawingStage.clientWidth, height: drawingStage.clientHeight }
          : undefined,
        blankView: !scene && active && "boundingBox" in active ? active.boundingBox() : undefined,
      }),
    };
  }
  function previewTransfer() {
    try {
      const data = captureBoard();
      const selected = selectedObjects.length ? selectedObjects : selectedObject ? [selectedObject] : [];
      setTransfer({ data, selection: selected.map((object) => object.id) });
    } catch {
      model.reportBoardError("Khung nhìn vượt giới hạn. Bấm Vừa khung rồi thử lại.");
    }
  }
  function sendToStudio(data: BoardTransfer) {
    try {
      if (editor) editor.onApply(data.visual, data.board);
      else {
        sessionStorage.setItem(`${lessonBoardTransferKey}:${learnerSessionId()}`, JSON.stringify(data));
        model.openStudioBoard();
      }
      setTransfer(null);
    } catch {
      model.reportBoardError("Không thể chuyển bảng vào Studio. Hãy thử lại với bảng nhỏ hơn.");
    }
  }
  return (
    <Root className={`legacy-explore explore-v2${editor ? " studio-board-workspace" : ""}`}>
      {transfer && <ExploreBoardTransfer {...transfer} context={editor?.context}
        onClose={() => setTransfer(null)} onApply={sendToStudio} />}
      {editor && <div className="studio-board-heading">
        <div><strong>Bảng vẽ của hoạt động</strong><span>{editor.context}</span></div>
        <div className="studio-board-actions">
          <button type="button" autoFocus className="gs-secondary" disabled={editor.busy} onClick={editor.onCancel}>Hủy thay đổi</button>
          <button type="button" className="gs-primary" disabled={editor.busy || !drawingStage} onClick={() => {
            try {
              const data = captureBoard();
              editor.onApply(data.visual, data.board);
            } catch {
              model.reportBoardError("Khung nhìn vượt giới hạn. Bấm Vừa khung rồi thử lại.");
            }
          }}>{editor.busy ? "Đang áp dụng…" : editor.onDrag ? "Chèn vào câu này" : "Áp dụng vào bài"}</button>
          <button type="button" className="gs-secondary" disabled={editor.busy || !drawingStage} onClick={previewTransfer}>Chọn nội dung chèn</button>
          {editor.onDrag && <button type="button" className="gs-secondary" disabled={editor.busy || !drawingStage}
            draggable={!editor.busy && !!drawingStage}
            title="Kéo nút này đến câu cần chèn, hoặc bấm Chèn vào câu này"
            onDragStart={(event) => {
              try {
                const data = captureBoard();
                event.dataTransfer.setData(examBoardDragType, "board");
                event.dataTransfer.effectAllowed = "copy";
                editor.onDrag?.(data.visual, data.board);
              } catch {
                event.preventDefault();
                model.reportBoardError("Khung nhìn vượt giới hạn. Bấm Vừa khung rồi thử lại.");
              }
            }}>Kéo hình sang đề</button>}
        </div>
      </div>}
      <div className="legacy-explore-shell explore-v2-shell" inert={editor?.busy}>
        {!editor && <ExploreCatalog {...model.catalog} />}
        <div
          className={`legacy-explore-grid ${inputDockOpen ? "input-open" : ""}`}
        >
          {!editor && !inputDockOpen && (
            <button
              type="button"
              className="explore-v2-input-trigger"
              onClick={() => setInputDockOpen(true)}
            >
              <PenLine size={14} /> Nhập đề &amp; Tải ảnh{" "}
              <ChevronDown size={13} />
            </button>
          )}
          {!editor && <ExploreInputPanel {...model.inputPanel} />}
          <section className="legacy-canvas-column">
            <div className="legacy-canvas-card">
              <header className="explore-board-header">
                <div className="explore-v2-canvas-label">
                  <b>
                    {visual?.dimension === "3d"
                      ? "Không gian 3D"
                      : "Mặt phẳng tọa độ Oxy"}
                  </b>
                  <span>
                    {analysisStatus === "analyzing"
                      ? "Đang phân tích đề bài"
                      : analysisStatus === "error"
                        ? "Chưa tạo được mô hình"
                        : visual
                          ? readout.formula
                          : "Bảng trắng · Chưa có mô hình"}
                  </span>
                </div>
                <div
                  className="explore-board-controls"
                  aria-label="Điều khiển bảng vẽ"
                >
                  <div
                    className="explore-dimension-toggle"
                    role="group"
                    aria-label="Chế độ hiển thị hình học"
                  >
                    <button
                      type="button"
                      className={visual?.dimension !== "3d" ? "active" : ""}
                      aria-pressed={visual?.dimension !== "3d"}
                      disabled={visual?.dimension !== "3d"}
                      onClick={() => switchBoardDimension("2d")}
                    >
                      2D
                    </button>
                    <button
                      type="button"
                      className={visual?.dimension === "3d" ? "active" : ""}
                      aria-pressed={visual?.dimension === "3d"}
                      disabled={
                        !visual ||
                        (visual.dimension === "3d" && !visual.derivedFrom2d)
                      }
                      onClick={() => switchBoardDimension("3d")}
                    >
                      3D
                    </button>
                  </div>
                  {visual?.dimension === "3d" &&
                    visual.derivedFrom2d &&
                    visual.source?.key !== CYLINDER_DIMENSIONS_KEY && (
                      <select
                        aria-label="Cách dựng hình trong không gian 3D"
                        title="Chọn cách biểu diễn hình 2D trong không gian"
                        value={visual.derivedFrom2d.mode}
                        onChange={(event) =>
                          switchBoardDimension(
                            "3d",
                            event.target.value as Sketch3dMode,
                          )
                        }
                      >
                        <option value="planar">
                          Giữ nguyên hình phẳng (mặc định)
                        </option>
                        <option value="auto">
                          Tạo khối: tròn → cầu, đa giác → khối đùn
                        </option>
                        <option value="cylinder">
                          Tạo khối: tròn → trụ, đa giác → khối đùn
                        </option>
                      </select>
                    )}
                  <button
                    type="button"
                    onClick={() => zoomBoard("fit")}
                    title="Đưa bảng về khung nhìn ban đầu"
                  >
                    Vừa khung
                  </button>
                  {!editor && <button type="button" disabled={!drawingStage} onClick={previewTransfer}>Đưa vào bài soạn</button>}
                  <button
                    type="button"
                    className={surfaceFill ? "active" : ""}
                    aria-pressed={surfaceFill}
                    disabled={!visual}
                    onClick={toggleSurfaceFill}
                    title={
                      surfaceFill
                        ? "Ẩn phần tô, chỉ hiện cạnh và thông tin"
                        : "Hiện phần tô của hình/khối"
                    }
                  >
                    {surfaceFill ? "Tô mặt" : "Chỉ hiện cạnh"}
                  </button>
                  <button
                    type="button"
                    className={boardOptions.axes ? "active" : ""}
                    aria-pressed={boardOptions.axes}
                    onClick={() => toggleBoardOption("axes")}
                    disabled={visual?.dimension === "3d"}
                  >
                    Trục
                  </button>
                  <button
                    type="button"
                    className={boardOptions.grid ? "active" : ""}
                    aria-pressed={boardOptions.grid}
                    onClick={() => toggleBoardOption("grid")}
                    disabled={visual?.dimension === "3d"}
                  >
                    Lưới
                  </button>
                  <button
                    type="button"
                    className={boardOptions.snap ? "active" : ""}
                    aria-pressed={boardOptions.snap}
                    onClick={() => toggleBoardOption("snap")}
                    disabled={visual?.dimension === "3d"}
                  >
                    Bám lưới
                  </button>
                  <button
                    type="button"
                    className={boardOptions.labels ? "active" : ""}
                    aria-pressed={boardOptions.labels}
                    onClick={() => toggleBoardOption("labels")}
                  >
                    Nhãn
                  </button>
                  {visual && (
                    <details className="explore-annotation-options">
                      <summary aria-label="Bật tắt thông tin trên hình">
                        Thông tin ▾
                      </summary>
                      <div
                        role="group"
                        aria-label="Thông tin hiển thị trên hình"
                      >
                        {(
                          Object.keys(
                            geometryAnnotationLabels,
                          ) as GeometryAnnotationKind[]
                        )
                          .filter(
                            (kind) =>
                              visual.dimension === "3d" ||
                              ["vertex", "length", "angle"].includes(kind),
                          )
                          .map((kind) => (
                            <label key={kind}>
                              <input
                                type="checkbox"
                                checked={geometryAnnotations[kind]}
                                onChange={(event) =>
                                  toggleGeometryAnnotation(
                                    kind,
                                    event.target.checked,
                                  )
                                }
                              />
                              <span>{geometryAnnotationLabels[kind]}</span>
                            </label>
                          ))}
                        <button
                          type="button"
                          disabled={!hiddenEdgeCount(visual)}
                          onClick={showHiddenEdges}
                        >
                          Hiện lại cạnh đã ẩn ({hiddenEdgeCount(visual)})
                        </button>
                      </div>
                    </details>
                  )}
                </div>
                <div
                  className="explore-board-zoom"
                  role="group"
                  aria-label="Phóng to và thu nhỏ bảng"
                >
                  <button
                    type="button"
                    aria-label="Thu nhỏ"
                    title="Thu nhỏ"
                    onClick={() => zoomBoard("out")}
                  >
                    <Minus size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Phóng to"
                    title="Phóng to"
                    onClick={() => zoomBoard("in")}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </header>
              <div className="explore-advanced-toolbar"><ExploreSpatialControls visual={visual} getRuntime={() => runtime.current || null} onCommit={commitVisual} onActiveChange={setDrawingActive} sourceId={selectedObject?.id} faceIndex={selectedObject?.faceIndex}/>
              <ExploreBoardContent stage={drawingStage} getRuntime={() => runtime.current} onCommit={commitVisual}/>
              <ExploreFunctionTools stage={drawingStage} getRuntime={() => runtime.current} onCommit={commitVisual} selectedObjectId={selectedObject?.type === "functionGraph" ? selectedObject.id : undefined}/><ExploreObjectActions getRuntime={()=>runtime.current} onCommit={commitVisual} selected={selectedObjects.length?selectedObjects:selectedObject?[selectedObject]:[]} undo={()=>travelGeometry("undo")} redo={()=>travelGeometry("redo")} canUndo={canUndo} canRedo={canRedo}/>
              {triangle && visual?.dimension === "2d" && <div className="explore-spatial-tools" role="group" aria-label="Dựng trên tam giác đã chọn">
                <select aria-label="Dựng đường cao từ đỉnh" value="" onChange={(event) => { if (event.target.value) constructOnTriangle("altitude", Number(event.target.value) - 1); }}>
                  <option value="">Dựng đường cao từ đỉnh…</option>
                  {triangle.parents.map((id, index) => <option key={id} value={index + 1}>{visual.objects.find((point) => point.id === id)?.label || `Đỉnh ${index + 1}`}</option>)}
                </select>
                <button type="button" onClick={() => constructOnTriangle("circumcircle")}>Đường tròn ngoại tiếp</button>
              </div>}</div>
              {visual?.dimension !== "3d" && <ExploreDrawingTools
                stage={drawingStage}
                disabled={false}
                sceneKey={visual?.id || "blank"}
                cancelRevision={drawingCancelRevision}
                getRuntime={() => {
                  const active = runtime.current;
                  return active && "screenToUser" in active ? active : null;
                }}
                onCommit={commitDrawing}
                onActiveChange={setDrawingActive}
                onUndo={() => travelGeometry("undo")}
                onRedo={() => travelGeometry("redo")}
                onDirect={constructDirect}
                selectedStyle={
                  edgeStyle && selectedObject
                    ? { ...edgeStyle, label: selectedObject.label }
                    : null
                }
                onSelectedStyle={changeSelectedEdgeStyle}
                onTranslate={translateGroup}
                onLabel={moveLabel}
                canUndo={canUndo}
                canRedo={canRedo}
              />}
              <div
                ref={canvasHost}
                className={`legacy-live-canvas ${!visual ? "is-empty" : ""}`}
                aria-live="polite"
                onPointerDownCapture={(e) => {
                  if (
                    !drawingActive &&
                    (e.target as Element).closest(".math-board")
                  ) {
                    nativeDragBefore.current = drawingSnapshot();
                    const active = runtime.current;
                    if (e.button === 0 && visual?.dimension === "2d" && selectedObject &&
                        active && "pickObjectAt" in active && !active.pickObjectAt(e.clientX, e.clientY)) {
                      setSelectedObject(null);
                      setSelectedObjects([]);
                      setGraphMenu(null);
                    }
                  }
                }}
                onPointerUpCapture={() => {
                  const before = nativeDragBefore.current;
                  nativeDragBefore.current = undefined;
                  if (
                    before !== undefined &&
                    JSON.stringify(before) !== JSON.stringify(drawingSnapshot())
                  )
                    rememberGeometry(before);
                }}
                onPointerCancelCapture={() => { nativeDragBefore.current = undefined; }}
              >
                {sceneLoading && visual && (
                  <div className="explore-scene-banner" role="status">
                    <span
                      className="explore-scene-spinner"
                      aria-hidden="true"
                    />
                    Đang tải mô hình mới…
                  </div>
                )}
                {sceneLoadError && visual && (
                  <div className="explore-scene-banner is-error" role="alert">
                    Không tải được mô hình mới: {sceneLoadError}
                    <button
                      type="button"
                      onClick={() => setSceneRetry((value) => value + 1)}
                    >
                      Thử lại
                    </button>
                  </div>
                )}
                {analysisError && (
                  <div className="explore-scene-banner is-error" role="alert">
                    {analysisError}
                    <button
                      type="button"
                      onClick={() => {
                        setInputDockOpen(true);
                        setInputTab("text");
                      }}
                    >
                      Kiểm tra đề
                    </button>
                  </div>
                )}
                {geometryWarning && (
                  <div className="explore-scene-banner is-error" role="alert">
                    Quan hệ hình học không còn đúng: {geometryWarning}
                  </div>
                )}
                <Visual
                  spec={visual}
                  dragWholeShapes
                  onProjectedMove={(next, selection) => {
                    commitVisual(next, "Đã di chuyển khối không gian");
                    setSelectedObject(selection);
                    setSelectedObjects([selection]);
                  }}
                  blankView={editor?.initial.board.blankView}
                  ref={runtime}
                  onRuntimeReady={handleRuntimeReady}
                  onState={handleVisualState}
                  onSelect={handleVisualSelect}
                  onObjectContextMenu={(selection, position) => {
                    handleVisualSelect(selection, true);
                    setGraphMenu({
                      id: selection.id,
                      ...position,
                      editing: false,
                    });
                  }}
                  overlay={
                    <>
                      <GraphInkOverlay
                        key={`${visual?.id || "blank"}-${visual?.dimension || "blank"}-${inkMountRevision}`}
                        externalToolActive={drawingActive}
                        onModeChange={(mode) => {
                          if (mode !== "off")
                            setDrawingCancelRevision((n) => n + 1);
                        }}
                        onNormalize={applyGraphInk}
                        onAskAI={editor ? undefined : handleLassoAsk}
                        onSelectRegion={handleRegionSelect}
                        captureFrame={() => {
                          const active = runtime.current;
                          return active && "snapshot" in active
                            ? active.snapshot()
                            : null;
                        }}
                        pickVertex={(x, y, snap) => {
                          const active = runtime.current;
                          if (active && "pickConnectionPointAt" in active)
                            return active.pickConnectionPointAt(x, y, snap);
                          const point =
                            active && "screenToUser" in active
                              ? active.screenToUser(x, y)
                              : null;
                          return point
                            ? {
                                objectId: "free",
                                label: "Điểm tự do",
                                free: true,
                                position: [point.x, point.y, 0],
                              }
                            : null;
                        }}
                        onConnect={connectVertices}
                        vertices={connectionVertices}
                        initialDraft={inkDraft}
                        onDraftChange={setInkDraft}
                        regionOnly={visual?.dimension === "3d"}
                        regionSelectionCount={selectedObjects.length}
                      />
                      {visual?.dimension === "3d" && selectedObject && selectedObjects.length <= 1 && !graphMenu && (
                        <ExploreSelectionToolbar visual={visual} selection={selectedObject}
                          onSelect={selection => {
                            const info = runtime.current && "selectionInfo" in runtime.current ? runtime.current.selectionInfo(selection) : selection;
                            setSelectedObject(info || selection); setSelectedObjects([info || selection]);
                          }}
                          onClose={() => { setSelectedObject(null); setSelectedObjects([]); }}
                          onDelete={() => deleteSelectedObject(true)}
                          onFit={() => runtime.current?.fitView()} />
                      )}
                      {visual &&
                        selectedObject &&
                        edgeStyle &&
                        selectedObjects.length <= 1 &&
                        !graphMenu && (
                          <div className="graph-edge-style-toolbar">
                            <header>
                              <span>{selectedObject.label}</span>
                              <button
                                type="button"
                                aria-label="Đóng kiểu cạnh"
                                onClick={() => {
                                  setSelectedObject(null);
                                  setSelectedObjects([]);
                                }}
                              >
                                <X size={13} />
                              </button>
                            </header>
                            <EdgeStyleControls
                              {...edgeStyle}
                              onChange={changeSelectedEdgeStyle}
                            />
                            <button
                              type="button"
                              className="graph-edge-delete"
                              onClick={() => deleteSelectedObject()}
                              title={
                                isConstituentEdge(visual, selectedObject)
                                  ? "Delete · Xóa nét cạnh, không xóa cả hình"
                                  : "Delete · Xóa đường độc lập"
                              }
                            >
                              <Trash2 size={13} />
                              {isConstituentEdge(visual, selectedObject)
                                ? "Xóa cạnh"
                                : "Xóa đường"}
                              <small>Delete</small>
                            </button>
                          </div>
                        )}
                      {visual &&
                        graphMenu &&
                        selectedObject?.id === graphMenu.id && (
                          <>
                            <div
                              className="graph-object-menu-backdrop"
                              style={{ pointerEvents: "none" }}
                            />
                            <div
                              className="graph-object-menu"
                              role="menu"
                              aria-label={`Tùy chọn cho ${selectedObject.label}`}
                              style={{ left: graphMenu.x, top: graphMenuTop,
                                maxHeight: drawingStage ? Math.max(90, drawingStage.clientHeight - (graphMenuTop ?? 0) - 8) : undefined,
                                overflowY: "auto",
                              }}
                              onContextMenu={(event) => event.preventDefault()}
                            >
                              <header>
                                <b>
                                  {graphMenu.ids && graphMenu.ids.length > 1
                                    ? `${graphMenu.ids.length} đối tượng đã chọn`
                                    : selectedObject.label}
                                </b>
                                <button
                                  type="button"
                                  aria-label="Đóng menu"
                                  onClick={() => setGraphMenu(null)}
                                >
                                  <X size={13} />
                                </button>
                              </header>
                              {visual.dimension === "3d" && selectedObject.details?.length ? (
                                <output className="graph-object-menu-fields" aria-live="polite">
                                  {selectedObject.details.slice(0, 3).map((detail) => <small key={detail}>{detail}</small>)}
                                </output>
                              ) : null}
                              {edgeStyle && !graphMenu.ids && (
                                <EdgeStyleControls
                                  {...edgeStyle}
                                  onChange={changeSelectedEdgeStyle}
                                />
                              )}
                              {!graphMenu.editing && !graphMenu.ids && (objectMeasurementDraft || objectNoteDraft) && (
                                <div className="graph-object-menu-fields">
                                  {objectMeasurementDraft && <small>Độ dài theo đề: {objectMeasurementDraft}</small>}
                                  {objectNoteDraft && <small>{objectNoteDraft}</small>}
                                </div>
                              )}
                              {graphMenu.editing ? (
                                <div className="graph-object-menu-fields">
                                  <label>
                                    {annotationIsEdge ? "Tên cạnh" : annotationIsVertex ? "Tên đỉnh / điểm" : "Tên đối tượng"}
                                    <input
                                      value={objectLabelDraft}
                                      maxLength={100}
                                      onChange={(event) =>
                                        setObjectLabelDraft(event.target.value)
                                      }
                                    />
                                  </label>
                                  {annotationIsEdge && (
                                    <label>
                                      Độ dài theo đề
                                      <input
                                        value={objectMeasurementDraft}
                                        maxLength={80}
                                        onChange={(event) =>
                                          setObjectMeasurementDraft(
                                            event.target.value,
                                          )
                                        }
                                        placeholder="Ví dụ: 5 cm"
                                      />
                                    </label>
                                  )}
                                  <label>
                                    {annotationIsVertex ? "Chú thích đỉnh / điểm" : "Ghi chú"}
                                    <textarea
                                      value={objectNoteDraft}
                                      maxLength={300}
                                      rows={2}
                                      onChange={(event) =>
                                        setObjectNoteDraft(event.target.value)
                                      }
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="graph-object-save"
                                    onClick={saveSelectedAnnotation}
                                  >
                                    <CheckCircle2 size={14} /> Lưu thông tin
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {!graphMenu.ids && (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() =>
                                          setGraphMenu({
                                            ...graphMenu,
                                            editing: true,
                                          })
                                        }
                                      >
                                        <PenLine size={14} /> Thêm / sửa thông
                                        tin
                                      </button>
                                    )}
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={toggleSurfaceFill}
                                  >
                                    {surfaceFill
                                      ? "Ẩn phần tô, giữ cạnh"
                                      : "Tô phần mặt"}
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="graph-object-delete"
                                    onClick={() => deleteSelectedObject(selectedObject.faceIndex !== undefined)}
                                    title={
                                      isConstituentEdge(visual, selectedObject)
                                        ? "Xóa nét cạnh, giữ cấu trúc hình. Khôi phục trong Thông tin."
                                        : undefined
                                    }
                                  >
                                    <Trash2 size={14} />
                                    {graphMenu.ids && graphMenu.ids.length > 1
                                      ? ` Xóa ${graphMenu.ids.length} đối tượng`
                                      : isConstituentEdge(
                                            visual,
                                            selectedObject,
                                          )
                                        ? " Xóa cạnh này"
                                        : selectedObject.faceIndex !== undefined
                                          ? " Xóa cả khối…"
                                        : selectedObject.vertexIndex !==
                                            undefined
                                          ? " Giữ đỉnh cấu trúc"
                                          : " Xóa đối tượng"}
                                    <small>Delete</small>
                                  </button>
                                  {!graphMenu.ids &&
                                    (isConstituentEdge(
                                      visual,
                                      selectedObject,
                                    ) ||
                                      selectedObject.vertexIndex !==
                                        undefined) && (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="graph-object-delete"
                                        onClick={() =>
                                          deleteSelectedObject(true)
                                        }
                                      >
                                        <Trash2 size={14} />{" "}
                                        {visual.dimension === "2d" ||
                                        visual.objects.find(
                                          (o) => o.id === selectedObject.id,
                                        )?.type === "curve3d"
                                          ? "Xóa cả hình…"
                                          : "Xóa cả khối…"}
                                      </button>
                                    )}
                                </>
                              )}
                            </div>
                          </>
                        )}
                    </>
                  }
                />
                {!visual && (
                  <div className="explore-board-empty-hint" aria-hidden="true">
                    <span>Bảng vẽ đang trống</span>
                    <small>
                      {editor ? "Chọn công cụ để vẽ hoặc thêm nội dung lên bảng." : "Bật trục hoặc lưới, vẽ trực tiếp hay nhập đề để bắt đầu."}
                    </small>
                  </div>
                )}
              </div>
              <footer>
                <span>
                  {visual
                    ? "Điều khiển trực tiếp trên hình · Tham số cập nhật theo thời gian thực"
                    : "Bảng trắng tương tác · Bật công cụ vẽ trên hình để phác thảo"}
                </span>
                <b>{visual ? readout.formula : ""}</b>
              </footer>
            </div>
          </section>
          {!editor && <ExploreContextPanel {...model.contextPanel} />}
        </div>
        {!editor && !assistantOpen && <FloatingAiTrigger className="explore-v2-ai-trigger" onOpen={() => setAssistantOpen(true)} />}
      </div>
      {(notice || error) && (
        <div className={`legacy-toast ${error ? "error" : ""}`}>
          {error || (
            <>
              <CheckCircle2 size={15} />
              {notice}
            </>
          )}
        </div>
      )}
    </Root>
  );
}
