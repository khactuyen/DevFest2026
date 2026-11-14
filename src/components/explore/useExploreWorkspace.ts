"use client";
import {
  applyDirectConstruction,
  type DirectTool,
} from "@/lib/explore-direct-constructions";
import type { DrawingStyle } from "@/lib/explore-drawing-constructions";
import {
  moveExploreLabel,
  translateExploreGroup,
} from "@/lib/explore-geometry-edit";
import type { LineHit, VertexHit } from "@/lib/runtime";

import type { HandwritingDraft } from "@/lib/handwriting-draft";
import type {
  ExploreCatalogProps,
  ExploreContextProps,
  ExploreInputProps,
} from "./view-contracts";

import type { BlankBoardRuntime } from "@/lib/blank-board-runtime";
import { readBrowserDraft } from "@/lib/browser-draft";
import { request } from "@/lib/client";
import {
  AgentResultSchema,
  VisualSpecSchema,
  type AgentResult,
  type Material,
  type TwoDVisualSpec,
  type VisualSpec,
  type VisualStateSummary,
} from "@/lib/contracts";
import { CYLINDER_DIMENSIONS_KEY } from "@/lib/cylinder-problem-visual";
import {
  resultForExplorationScene,
  type ExplorationEvent,
  type ExplorationSession,
} from "@/lib/exploration-contracts";
import type { ExploreAssistantAnswer } from "@/lib/explore-assistant";
import { verifyVisualGeometry } from "@/lib/geometry-invariants";
import { makeMaterial } from "@/lib/material-factory";
import type { ProblemRecognition } from "@/lib/problem-recognition";
import type { VisualRuntime } from "@/lib/runtime";
import {
  convertSketchTo3d,
  rebuildSketch3d,
  repairLegacySketch2d,
  restoreExploreBoard2d,
  restoreSketch2d,
  type Sketch3dMode,
} from "@/lib/sketch-3d";
import type { ThreeVisualRuntime } from "@/lib/three-runtime";
import { validateVisual } from "@/lib/validation";
import { loadVisualPatternCatalog } from "@/lib/visual-pattern-catalog";
import { useEffect, useMemo } from "react";
import { createExploreGeometryActions } from "./geometry-actions";
import {
  BoardOptions,
  ExploreStep,
  GeometryAnnotationKind,
  geometryAnnotationLabels,
  LassoContext,
  PatternResponse,
  prepareProblemImage,
  recognitionHasDiagram,
  steps,
} from "./shared";
import { useExplorePersistence } from "./useExplorePersistence";
import { useExploreReadout } from "./useExploreReadout";
import { useExploreState } from "./useExploreState";
import type { LessonBoard } from "@/lib/lesson-board";

export function useExploreWorkspace(initial?: { visual: VisualSpec | null; board: LessonBoard }) {
  const state = useExploreState(initial);
  useExplorePersistence(state, !initial);
  const {
    router,
    patterns,
    setPatterns,
    selected,
    setSelected,
    visual,
    setVisual,
    result,
    setResult,
    topic,
    setTopic,
    showSelectedOnly,
    setShowSelectedOnly,
    query,
    setQuery,
    problemPrompt,
    setProblemPrompt,
    recognitionDraft,
    setRecognitionDraft,
    recognizingImage,
    setRecognizingImage,
    inputDockOpen,
    setInputDockOpen,
    inputTab,
    setInputTab,
    assistantOpen,
    setAssistantOpen,
    informationOpen,
    setInformationOpen,
    latexDraft,
    setLatexDraft,
    handwritingDraft,
    setHandwritingDraft,
    handwritingUndo,
    setHandwritingUndo,
    handwritingHistory,
    sketchTitle,
    setSketchTitle,
    sessionOwnerKey,
    setSessionOwnerKey,
    sessionReady,
    setSessionReady,
    sessionStatus,
    setSessionStatus,
    eventRevision,
    setEventRevision,
    reflectionPrompt,
    setReflectionPrompt,
    analysisResult,
    setAnalysisResult,
    activeStep,
    setActiveStep,
    completed,
    setCompleted,
    learningTab,
    setLearningTab,
    busy,
    setBusy,
    analysisStatus,
    setAnalysisStatus,
    analysisError,
    setAnalysisError,
    catalogBusy,
    setCatalogBusy,
    sceneLoading,
    setSceneLoading,
    sceneLoadError,
    setSceneLoadError,
    geometryWarning,
    setGeometryWarning,
    sceneRetry,
    setSceneRetry,
    error,
    setError,
    notice,
    setNotice,
    assistantAnswer,
    setAssistantAnswer,
    lassoContext,
    setLassoContext,
    availableSession,
    setAvailableSession,
    inkDraft,
    setInkDraft,
    inkMountRevision,
    setInkMountRevision,
    assistantBusy,
    setAssistantBusy,
    visualState,
    setVisualState,
    selectedObject,
    setSelectedObject,
    selectedObjects,
    setSelectedObjects,
    connectionVertices,
    setConnectionVertices,
    objectLabelDraft,
    setObjectLabelDraft,
    objectMeasurementDraft,
    setObjectMeasurementDraft,
    objectNoteDraft,
    setObjectNoteDraft,
    graphMenu,
    setGraphMenu,
    boardOptions,
    setBoardOptions,
    geometryAnnotations,
    setGeometryAnnotations,
    surfaceFill,
    setSurfaceFill,
    coordinateDraft,
    setCoordinateDraft,
    runtime,
    canvasHost,
    drawingStage,
    setDrawingStage,
    drawingActive,
    setDrawingActive,
    drawingCancelRevision,
    setDrawingCancelRevision,
    sceneDocument,
    nativeDragBefore,
    visualStateRef,
    coordinateEditRef,
    analysisRequestRef,
    assistantRequestRef,
    assistantAbortRef,
    recognitionRequestRef,
    recognitionAbortRef,
    lastInteractionEventAtRef,
    sessionIdRef,
    sessionRevisionRef,
    sessionCreatedAtRef,
    sessionEventsRef,
    sessionSaveQueueRef,
    sessionRevisions,
    restoredVisualRef,
  } = state;
  const {
    drawingSnapshot,
    rememberGeometry,
    restoreGeometry,
    travelGeometry,
    commitDrawing,
    commitGeometryEdit,
    commitVisual,
    applyGraphInk,
    saveSelectedAnnotation,
    connectVertices,
    deleteSelectedObject,
    changeSelectedEdgeStyle,
    edgeStyle,
    showHiddenEdges,
    handleVisualSelect,
    handleRegionSelect,
  } = createExploreGeometryActions({ ...state, recordSessionEvent, markStep });

  function handleLassoAsk(
    imageDataUrl: string,
    rect: LassoContext["rect"],
    inkStrokeCount: number,
    stage: DOMRect,
  ) {
    assistantRequestRef.current += 1;
    assistantAbortRef.current?.abort();
    setAssistantBusy(false);
    const absoluteRect = {
      x: stage.left + rect.x,
      y: stage.top + rect.y,
      width: rect.width,
      height: rect.height,
    };
    const activeRuntime = runtime.current;
    const selected =
      activeRuntime && "objectsInScreenRect" in activeRuntime
        ? activeRuntime.objectsInScreenRect(absoluteRect)
        : [];
    const objects = selected.slice(0, 20).map((selection) => {
      const object =
        visual?.dimension === "2d"
          ? visual.objects.find((item) => item.id === selection.id)
          : undefined;
      const details = [
        ...(object?.measurement ? [`Số đo: ${object.measurement}`] : []),
        ...(object?.note || object?.ariaLabel
          ? [`Ghi chú: ${object.note || object.ariaLabel}`]
          : []),
        ...(selection.parents.length
          ? [`Dựa trên: ${selection.parents.join(", ")}`]
          : []),
      ];
      const state = visualStateRef.current?.objects[selection.id];
      if (typeof state?.x === "number" && typeof state?.y === "number")
        details.push(`Tọa độ: (${state.x.toFixed(2)}; ${state.y.toFixed(2)})`);
      const spatial =
        visual?.dimension === "3d"
          ? visual.objects.find((o) => o.id === selection.id)
          : undefined;
      return {
        label: selection.label.slice(0, 100),
        kind: (spatial?.marker
          ? "point"
          : spatial?.type === "label3d"
            ? "label"
            : selection.type
        ).slice(0, 60),
        details: [...details, ...(selection.details || [])]
          .slice(0, 6)
          .map((detail) => detail.slice(0, 500)),
      };
    });
    const corners =
      activeRuntime && "screenToUser" in activeRuntime
        ? [
            activeRuntime.screenToUser(absoluteRect.x, absoluteRect.y),
            activeRuntime.screenToUser(
              absoluteRect.x + absoluteRect.width,
              absoluteRect.y + absoluteRect.height,
            ),
          ]
        : [];
    const region =
      corners.length === 2 && corners[0] && corners[1]
        ? `Khung trên mặt phẳng: x từ ${corners[0].x.toFixed(2)} đến ${corners[1].x.toFixed(2)}, y từ ${corners[1].y.toFixed(2)} đến ${corners[0].y.toFixed(2)}.`
        : `Vùng đã khoanh rộng ${Math.round(rect.width)} × ${Math.round(rect.height)} px.`;
    setLassoContext({ imageDataUrl, rect, inkStrokeCount, objects, region });
    setReflectionPrompt("");
    setAssistantAnswer(null);
    setAssistantOpen(true);
    setNotice(
      objects.length
        ? `Đã gắn vùng khoanh và ${objects.length} đối tượng vào ngữ cảnh hỏi AI.`
        : "Đã gắn vùng khoanh vào ngữ cảnh hỏi AI.",
    );
  }

  function handleVisualState(state: VisualStateSummary) {
    if (
      visual?.dimension === "2d" &&
      visual.source?.key === "generated" &&
      state.visualId === visual.id
    ) {
      const warning = verifyVisualGeometry(visual, state).join(" ");
      setGeometryWarning(warning);
    } else setGeometryWarning("");
    const previous = visualStateRef.current;
    visualStateRef.current = state;
    setVisualState(state);
    const instance = runtime.current;
    if (
      instance &&
      "selectionInfo" in instance &&
      state.visualId === visual?.id
    )
      setSelectedObject((selected) =>
        selected ? instance.selectionInfo(selected) : null,
      );
    if (previous && JSON.stringify(previous) !== JSON.stringify(state)) {
      markStep("observe");
      const now = Date.now();
      if (now - lastInteractionEventAtRef.current > 1200) {
        const changedParameters = Object.fromEntries(
          Object.entries(state.parameters).filter(
            ([id, value]) => previous.parameters[id] !== value,
          ),
        );
        const changedPoints = Object.fromEntries(
          Object.entries(state.objects)
            .filter(
              ([id, value]) =>
                value.x !== previous.objects[id]?.x ||
                value.y !== previous.objects[id]?.y,
            )
            .map(([id, value]) => [id, { x: value.x, y: value.y }]),
        );
        if (
          Object.keys(changedParameters).length ||
          Object.keys(changedPoints).length
        )
          recordSessionEvent(
            "interaction",
            "Thao tác làm thay đổi mô hình",
            undefined,
            {
              parameters: changedParameters,
              points: changedPoints,
              visual: runtime.current?.serialized() || visual,
            },
          );
        lastInteractionEventAtRef.current = now;
      }
    }
    const selected = selectedObject;
    const current = selected ? state.objects[selected.id] : undefined;
    if (
      selected?.editable &&
      !coordinateEditRef.current &&
      current &&
      typeof current.x === "number" &&
      typeof current.y === "number"
    )
      setCoordinateDraft({
        id: selected.id,
        x: String(Number(current.x.toFixed(2))),
        y: String(Number(current.y.toFixed(2))),
      });
  }

  function handleRuntimeReady(
    instance: VisualRuntime | ThreeVisualRuntime | BlankBoardRuntime,
  ) {
    runtime.current = instance;
    setDrawingStage(
      canvasHost.current?.querySelector<HTMLElement>(".math-board-stage") ||
        null,
    );
    if ("state" in instance) setVisualState(instance.state());
    if ("selectionInfo" in instance)
      setSelectedObject((selected) =>
        selected ? instance.selectionInfo(selected) : null,
      );
    setConnectionVertices("vertices" in instance ? instance.vertices() : []);
    if ("setAxesVisible" in instance)
      instance.setAxesVisible(boardOptions.axes);
    if ("setGridVisible" in instance)
      instance.setGridVisible(boardOptions.grid);
    if ("setSnapToGrid" in instance) instance.setSnapToGrid(boardOptions.snap);
    if ("setLabelsVisible" in instance)
      instance.setLabelsVisible(boardOptions.labels);
    if ("setAnnotationVisibility" in instance)
      (
        Object.keys(geometryAnnotationLabels) as GeometryAnnotationKind[]
      ).forEach((kind) =>
        instance.setAnnotationVisibility(kind, geometryAnnotations[kind]),
      );
  }

  function toggleGeometryAnnotation(
    kind: GeometryAnnotationKind,
    visible: boolean,
  ) {
    setGeometryAnnotations((current) => ({ ...current, [kind]: visible }));
    if (runtime.current && "setAnnotationVisibility" in runtime.current)
      runtime.current.setAnnotationVisibility(kind, visible);
  }

  function toggleSurfaceFill() {
    const nextFill = !surfaceFill;
    setGraphMenu(null);
    setSurfaceFill(nextFill);
    const active = runtime.current;
    if (active && "setSurfaceFillVisible" in active)
      active.setSurfaceFillVisible(nextFill);
    const snapshot =
      active && "serialized" in active ? active.serialized() : visual;
    if (snapshot) {
      setVisual(snapshot);
      setResult((current) =>
        current ? { ...current, visual: snapshot } : null,
      );
      setAnalysisResult((current) =>
        current ? { ...current, visual: snapshot } : null,
      );
      recordSessionEvent(
        "interaction",
        nextFill ? "Bật tô mặt" : "Tắt tô mặt · chỉ hiện cạnh",
        undefined,
        { visual: snapshot, surfaceFill: nextFill },
      );
    }
    setNotice(
      nextFill
        ? "Đã bật tô mặt cho các vùng kín/khối."
        : "Đã ẩn phần tô; chỉ giữ đường bao, cạnh và thông tin.",
    );
  }

  function toggleBoardOption(option: keyof BoardOptions) {
    const next = { ...boardOptions, [option]: !boardOptions[option] };
    setBoardOptions(next);
    const active = runtime.current;
    if (!active) return;
    if (option === "axes" && "setAxesVisible" in active)
      active.setAxesVisible(next.axes);
    if (option === "grid" && "setGridVisible" in active)
      active.setGridVisible(next.grid);
    if (option === "snap" && "setSnapToGrid" in active)
      active.setSnapToGrid(next.snap);
    if (option === "labels" && "setLabelsVisible" in active)
      active.setLabelsVisible(next.labels);
  }

  function zoomBoard(direction: "in" | "out" | "fit") {
    const active = runtime.current;
    if (!active) return;
    if (direction === "in" && "zoomIn" in active) active.zoomIn();
    else if (direction === "out" && "zoomOut" in active) active.zoomOut();
    else if (direction === "fit" && "fitView" in active) active.fitView();
    else if (direction === "fit" && "reset" in active) active.reset();
  }

  function restoreSession(session: ExplorationSession) {
    let restored = session.visual;
    try {
      if (restored?.dimension === "2d")
        restored = repairLegacySketch2d(restored);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không phục hồi được hình trong phiên đã lưu.",
      );
      return false;
    }
    setError("");
    assistantRequestRef.current += 1;
    assistantAbortRef.current?.abort();
    analysisRequestRef.current += 1;
    recognitionRequestRef.current += 1;
    recognitionAbortRef.current?.abort();
    setBusy(false);
    setAssistantBusy(false);
    setRecognizingImage(false);
    sessionIdRef.current = session.id;
    sessionRevisionRef.current = session.revision;
    sessionRevisions.current.set(session.id, session.revision);
    sessionCreatedAtRef.current = session.createdAt;
    sessionEventsRef.current = session.events;
    restoredVisualRef.current = restored;
    setSelected(session.patternKey);
    setProblemPrompt(session.prompt);
    setReflectionPrompt(session.reflectionPrompt);
    setVisual(restored);
    setInkDraft(session.inkDraft);
    setHandwritingDraft(session.handwritingDraft || []);
    setHandwritingUndo(session.handwritingUndo || []);
    handwritingHistory.current = session.handwritingUndo || [];
    setInputTab(session.inputTab || "text");
    setLatexDraft(session.latexDraft || "");
    setRecognitionDraft(
      readBrowserDraft(
        `math-studio:explore-input:${session.ownerKey}:${session.id}`,
      ),
    );
    setInkMountRevision((value) => value + 1);
    const restoredResult =
      session.result && restored
        ? { ...session.result, visual: restored }
        : session.result;
    setResult(restoredResult);
    setAnalysisResult(restoredResult);
    setVisualState(session.visualState || undefined);
    visualStateRef.current = session.visualState || undefined;
    setAssistantAnswer(session.assistantAnswer);
    setActiveStep(session.activeStep);
    setCompleted(session.completedSteps);
    setLearningTab(session.learningTab);
    setSelectedObject(null);
    setAnalysisStatus(session.result ? "ready" : "idle");
    setBoardOptions(
      session.boardOptions || {
        axes: Boolean(restored),
        grid: true,
        snap: false,
        labels: true,
      },
    );
    return true;
  }

  function resumePreviousSession() {
    if (!availableSession) return;
    if (!restoreSession(availableSession)) return;
    setAvailableSession(null);
    setNotice("Đã mở lại phiên khám phá đã lưu.");
  }

  function recordSessionEvent(
    type: ExplorationEvent["type"],
    label: string,
    targetId?: string,
    payload: Record<string, unknown> = {},
  ) {
    const otherEvents = sessionEventsRef.current.filter(
      (event) => event.type !== "interaction",
    );
    const recentInteractions = sessionEventsRef.current
      .filter((event) => event.type === "interaction")
      .slice(-7);
    const retained =
      type === "interaction"
        ? [...otherEvents, ...recentInteractions]
        : sessionEventsRef.current;
    sessionEventsRef.current = [
      ...retained,
      {
        id: crypto.randomUUID(),
        type,
        label: label.slice(0, 180),
        targetId,
        payload,
        occurredAt: new Date().toISOString(),
      },
    ].slice(-30);
    setEventRevision((revision) => revision + 1);
  }

  useEffect(() => {
    setSurfaceFill(visual?.surfaceFill ?? true);
  }, [visual?.id, visual?.dimension, visual?.surfaceFill]);

  useEffect(() => {
    if (!graphMenu) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest(".graph-object-menu")
      )
        setGraphMenu(null);
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [graphMenu]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        target instanceof Element &&
        (target.closest(".legacy-canvas-card") || target === document.body)
      ) {
        event.preventDefault();
        travelGeometry(event.shiftKey ? "redo" : "undo");
        return;
      }
      if (event.key !== "Delete" || event.repeat) return;
      if (!selectedObject && !selectedObjects.length) return;
      event.preventDefault();
      deleteSelectedObject();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedObject, selectedObjects, graphMenu, visual]);

  useEffect(
    () => () => {
      analysisRequestRef.current += 1;
      assistantRequestRef.current += 1;
      recognitionRequestRef.current += 1;
      assistantAbortRef.current?.abort();
      recognitionAbortRef.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (initial) return;
    let alive = true;
    loadVisualPatternCatalog()
      .then((items) => {
        if (alive) setPatterns(items);
      })
      .catch((reason: Error) => alive && setError(reason.message))
      .finally(() => alive && setCatalogBusy(false));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (initial) return;
    let alive = true;
    const sceneRevision = analysisRequestRef.current;
    if (restoredVisualRef.current) {
      const restored = restoredVisualRef.current;
      restoredVisualRef.current = null;
      setVisual(restored);
      setSceneLoading(false);
      setSceneLoadError("");
      return () => {
        alive = false;
      };
    }
    if (!selected) {
      restoredVisualRef.current = null;
      setVisual(null);
      setVisualState(undefined);
      setSelectedObject(null);
      setCoordinateDraft(null);
      visualStateRef.current = undefined;
      setSceneLoading(false);
      setSceneLoadError("");
      return () => {
        alive = false;
      };
    }
    setSceneLoading(true);
    setSceneLoadError("");
    setVisualState(undefined);
    setSelectedObject(null);
    setCoordinateDraft(null);
    coordinateEditRef.current = false;
    visualStateRef.current = undefined;
    request<PatternResponse>(
      `/api/visual-patterns/${encodeURIComponent(selected)}`,
    )
      .then((data) => {
        if (!alive || sceneRevision !== analysisRequestRef.current) return;
        const restored = restoredVisualRef.current;
        restoredVisualRef.current = null;
        const scene = restored || data.spec;
        setVisual(scene);
        if (!restored)
          recordSessionEvent(
            "scene-generated",
            `Mở mô hình ${data.pattern.title}`,
            scene.id,
            { visual: scene, patternKey: data.pattern.key },
          );
      })
      .catch((reason: Error) => {
        if (!alive || sceneRevision !== analysisRequestRef.current) return;
        setSceneLoadError(reason.message || "Không tải được mô hình.");
      })
      .finally(() => {
        if (alive && sceneRevision === analysisRequestRef.current)
          setSceneLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selected, sceneRetry]);

  const topics = useMemo(
    () => [
      "Tất cả",
      ...Array.from(new Set(patterns.map((item) => item.topic))),
    ],
    [patterns],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    return patterns.filter(
      (item) =>
        (topic === "Tất cả" || item.topic === topic) &&
        (!showSelectedOnly || item.key === selected) &&
        (!needle ||
          [item.title, item.topic, ...item.tags]
            .join(" ")
            .toLocaleLowerCase("vi")
            .includes(needle)),
    );
  }, [patterns, query, selected, showSelectedOnly, topic]);
  const selectedPattern = patterns.find((item) => item.key === selected);
  const {
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
  } = useExploreReadout({
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
  });

  function markStep(id: ExploreStep) {
    if (activeStep !== id)
      recordSessionEvent(
        "lesson-step",
        `Chuyển sang bước: ${steps.find((step) => step.id === id)?.title || id}`,
        undefined,
        { step: id },
      );
    setActiveStep(id);
    setLearningTab(steps.find((step) => step.id === id)?.tab || "Giới thiệu");
    setCompleted((current) =>
      current.includes(id) ? current : [...current, id],
    );
  }
  function choosePattern(key: string) {
    assistantRequestRef.current += 1;
    assistantAbortRef.current?.abort();
    setAssistantBusy(false);
    setLassoContext(null);
    setSketchTitle("");
    setInputDockOpen(false);
    setGraphMenu(null);
    setSelectedObject(null);
    setCoordinateDraft(null);
    restoredVisualRef.current = null;
    recordSessionEvent(
      "pattern-selected",
      `Chọn mô hình ${patterns.find((item) => item.key === key)?.title || key}`,
      key,
    );
    analysisRequestRef.current += 1;
    setBusy(false);
    setSelected(key);
    setResult(null);
    setAnalysisResult(null);
    setAnalysisStatus("idle");
    setAnalysisError("");
    setAssistantAnswer(null);
    setError("");
    setNotice("");
    markStep("choose");
    setBoardOptions(
      key
        ? { axes: true, grid: true, snap: false, labels: true }
        : { axes: false, grid: true, snap: false, labels: true },
    );
    if (!key) {
      setVisual(null);
      setVisualState(undefined);
      setLassoContext(null);
    }
    const item = patterns.find((pattern) => pattern.key === key);
    if (item)
      setReflectionPrompt(`Khám phá ${item.title.toLocaleLowerCase("vi")}`);
  }
  function reset() {
    recordSessionEvent("session-reset", "Đặt lại mô hình", visual?.id);
    runtime.current?.reset();
    setResult(null);
    setSelectedObject(null);
    setCoordinateDraft(null);
    coordinateEditRef.current = false;
    setActiveStep("choose");
    setCompleted([]);
    setLearningTab("Giới thiệu");
    setNotice(
      "Đã khôi phục mô hình và lộ trình khám phá về trạng thái ban đầu.",
    );
  }
  function switchBoardDimension(
    target: "2d" | "3d",
    mode: Sketch3dMode = "planar",
  ) {
    if (!visual) {
      setNotice("Hãy dựng hoặc vẽ một hình trước khi chuyển chế độ 2D/3D.");
      return;
    }
    try {
      let next: VisualSpec;
      if (target === "3d") {
        let source: TwoDVisualSpec | undefined;
        let livePositions: Record<string, [number, number]> = {};
        if (visual.dimension === "2d") {
          const snapshot =
            (runtime.current && "serialized" in runtime.current
              ? runtime.current.serialized()
              : visual) || visual;
          source = snapshot.dimension === "2d" ? snapshot : visual;
          const state =
            runtime.current && "state" in runtime.current
              ? runtime.current.state()
              : undefined;
          livePositions = Object.fromEntries(
            Object.entries(state?.objects || {})
              .filter(
                ([, point]) =>
                  Number.isFinite(point.x) && Number.isFinite(point.y),
              )
              .map(([id, point]) => [
                id,
                [point.x!, point.y!] as [number, number],
              ]),
          );
        } else if (visual.derivedFrom2d) {
          const snapshot =
            (runtime.current && "serialized" in runtime.current
              ? runtime.current.serialized()
              : visual) || visual;
          source = restoreSketch2d(
            snapshot.dimension === "3d" ? snapshot : visual,
          );
        }
        if (!source) {
          setNotice("Đây là mô hình 3D gốc, chưa có bản vẽ 2D để chuyển đổi.");
          return;
        }
        const current3d =
          runtime.current && "serialized" in runtime.current
            ? runtime.current.serialized()
            : visual;
        next =
          visual.dimension === "3d" && current3d?.dimension === "3d"
            ? rebuildSketch3d(current3d, mode)
            : convertSketchTo3d(source, mode, livePositions);
        if (visual.dimension === "3d" && next.dimension === "3d") {
          const snapshot =
            runtime.current && "serialized" in runtime.current
              ? runtime.current.serialized()
              : visual;
          if (snapshot?.dimension === "3d") next.camera = snapshot.camera;
        }
        const solidCount = next.objects.filter(
          (object) =>
            !object.marker &&
            ["sphere", "cylinder", "extrudedPolygon"].includes(object.type),
        ).length;
        setNotice(
          source.savedNative3d
            ? "Đã mở lại bảng không gian 3D."
            : next.source?.key === CYLINDER_DIMENSIONS_KEY
              ? "Đã mở hình trụ 3D theo số đo nguồn; giữ nguyên r, h và đơn vị, không tạo khối từ đa giác trace."
              : source.savedSpatialObjects?.length
                ? "Đã mở bảng 3D cùng các đối tượng không gian đã thêm."
                : solidCount
                  ? `Đã chuyển sang 3D: dựng ${solidCount} khối từ đường tròn/đa giác; các nét còn lại nằm trên mặt phẳng để xoay và quan sát.`
                  : "Đã chuyển hình lên mặt phẳng không gian 3D. Kéo bảng để xoay và quan sát từ các hướng khác nhau.",
        );
      } else {
        if (visual.dimension !== "3d") return;
        const snapshot =
          (runtime.current && "serialized" in runtime.current
            ? runtime.current.serialized()
            : visual) || visual;
        next = restoreExploreBoard2d(
          snapshot.dimension === "3d" ? snapshot : visual,
        );
        setNotice(
          next.savedNative3d || next.savedSpatialObjects?.length
            ? "Bảng 2D đang hiện hình chiếu của khối. Chọn 3D để xoay và dựng trên khối."
            : next.spatialConnections?.length
              ? "Đã trở lại 2D. Đường nối chỉ có trong không gian được giữ trong phiên; mở lại đúng kiểu khối 3D để xem, không tự chiếu sai lên mặt phẳng."
              : "Đã trở lại 2D với các hệ số, bán kính và nét vẽ được giữ lại.",
        );
      }
      // Validate before replacing the current renderer: failure keeps the existing board.
      next = validateVisual(next);
      analysisRequestRef.current += 1;
      setBusy(false);
      assistantRequestRef.current += 1;
      assistantAbortRef.current?.abort();
      setAssistantBusy(false);
      setAssistantAnswer(null);
      setLassoContext(null);
      setError("");
      setVisual(next);
      setResult((current) => (current ? { ...current, visual: next } : null));
      setAnalysisResult((current) =>
        current ? { ...current, visual: next } : null,
      );
      setVisualState(undefined);
      visualStateRef.current = undefined;
      setSelectedObject(null);
      setSelectedObjects([]);
      setInkDraft((draft) => (draft ? { ...draft, selection: null } : null));
      setCoordinateDraft(null);
      setGraphMenu(null);
      recordSessionEvent(
        "interaction",
        `Chuyển bảng sang ${target.toUpperCase()}`,
        next.id,
        { visual: next, dimension: target },
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không chuyển được mô hình sang chế độ đã chọn.",
      );
    }
  }
  function replaySessionEvent(event: ExplorationEvent) {
    setSketchTitle("");
    setInputDockOpen(false);
    const snapshot = VisualSpecSchema.safeParse(event.payload.visual);
    if (!snapshot.success) return;
    let scene = snapshot.data;
    try {
      if (scene.dimension === "2d") scene = repairLegacySketch2d(scene);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không phục hồi được hình ở bước đã chọn.",
      );
      return;
    }
    analysisRequestRef.current += 1;
    setBusy(false);
    assistantRequestRef.current += 1;
    assistantAbortRef.current?.abort();
    setAssistantBusy(false);
    setAssistantAnswer(null);
    setLassoContext(null);
    const sourceKey = scene.source?.key || selected;
    if (sourceKey !== selected) restoredVisualRef.current = scene;
    setVisual(scene);
    setSelected(sourceKey);
    const priorGeneratedResults = sessionEventsRef.current
      .filter(
        (item) =>
          item.type === "scene-generated" &&
          item.occurredAt <= event.occurredAt,
      )
      .reverse()
      .map((item) => item.payload.result);
    const matchingResult = resultForExplorationScene(scene, [
      event.payload.result,
      ...priorGeneratedResults,
    ]);
    setResult(matchingResult);
    setAnalysisResult(matchingResult);
    setAnalysisStatus(matchingResult ? "ready" : "idle");
    setAnalysisError("");
    setError("");
    setVisualState(undefined);
    visualStateRef.current = undefined;
    setSelectedObject(null);
    setSelectedObjects([]);
    setGraphMenu(null);
    setCoordinateDraft(null);
    setInkDraft((draft) => (draft ? { ...draft, selection: null } : null));
    setNotice(`Đã khôi phục trạng thái ở bước “${event.label}”.`);
  }
  function applySelectedCoordinates() {
    if (!selectedObject?.editable || coordinateDraft?.id !== selectedObject.id)
      return;
    const x = Number(coordinateDraft.x),
      y = Number(coordinateDraft.y);
    if (
      !coordinateDraft.x.trim() ||
      !coordinateDraft.y.trim() ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      setError("Nhập tọa độ x và y hợp lệ trước khi cập nhật.");
      return;
    }
    const activeRuntime = runtime.current;
    if (
      activeRuntime &&
      "setPoint" in activeRuntime &&
      typeof activeRuntime.setPoint === "function"
    ) {
      activeRuntime.setPoint(selectedObject.id, x, y);
      setError("");
      setNotice(
        `Đã chuyển ${selectedObject.label} đến (${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(x)}; ${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(y)}).`,
      );
      coordinateEditRef.current = false;
    }
  }
  function editSelectedCoordinate(axis: "x" | "y", value: string) {
    if (!selectedObject || !selectedDetails?.position) return;
    const id = selectedObject.id;
    const position = selectedDetails.position;
    setCoordinateDraft((current) => ({
      id,
      x:
        axis === "x"
          ? value
          : current?.id === id
            ? current.x
            : String(position.x),
      y:
        axis === "y"
          ? value
          : current?.id === id
            ? current.y
            : String(position.y),
    }));
  }
  async function askAgent(
    forceGenerated = false,
    input = reflectionPrompt,
    isProblemAnalysis = false,
  ) {
    if (!input.trim()) return;
    setSketchTitle("");
    if (isProblemAnalysis)
      recordSessionEvent(
        "problem-submitted",
        "Gửi đề bài để phân tích",
        undefined,
        { length: input.length },
      );
    const requestId = ++analysisRequestRef.current;
    assistantRequestRef.current += 1;
    assistantAbortRef.current?.abort();
    setAssistantBusy(false);
    setAssistantAnswer(null);
    setLassoContext(null);
    setBusy(true);
    setError("");
    setNotice("");
    if (isProblemAnalysis) {
      setAnalysisStatus("analyzing");
      setAnalysisError("");
      setAnalysisResult(null);
      setResult(null);
      setVisual(null);
      setVisualState(undefined);
      setSelectedObject(null);
      setCoordinateDraft(null);
      coordinateEditRef.current = false;
      visualStateRef.current = undefined;
      setAssistantAnswer(null);
    }
    try {
      const data = await request<AgentResult>("/api/agent/explore", {
        method: "POST",
        body: JSON.stringify({
          prompt: input,
          ...(forceGenerated
            ? {}
            : { pattern: selected, visual, state: visualStateRef.current }),
        }),
      });
      if (requestId !== analysisRequestRef.current) return;
      setSelectedObjects([]);
      setGraphMenu(null);
      setInkDraft((draft) => (draft ? { ...draft, selection: null } : null));
      setResult(data);
      setVisual(data.visual);
      restoredVisualRef.current = null;
      markStep("explain");
      if (isProblemAnalysis)
        recordSessionEvent(
          "scene-generated",
          `Đã dựng mô hình: ${data.title}`,
          data.visual.id,
          {
            source: data.source,
            dimension: data.visual.dimension,
            visual: data.visual,
            result: data,
          },
        );
      if (isProblemAnalysis) {
        setAnalysisResult(data);
        setAnalysisStatus("ready");
      }
      // source.key describes provenance, not a request to load a catalog default.
      setSceneLoading(false);
    } catch (reason) {
      if (requestId !== analysisRequestRef.current) return;
      const failure = reason as Error & { code?: string };
      const category: Record<string, string> = {
        ai_not_configured: "Chưa cấu hình AI",
        ai_provider: "Lỗi dịch vụ AI",
        unsupported: "Dạng dựng chưa được hỗ trợ",
        invalid_plan: "Kế hoạch hình chưa hợp lệ",
      };
      const message = `${failure.code && category[failure.code] ? `${category[failure.code]}: ` : ""}${failure.message}`;
      if (isProblemAnalysis) {
        setAnalysisStatus("error");
        setAnalysisError(message);
        setError(message);
        setInputDockOpen(true);
        setAnalysisResult(null);
        setResult(null);
        setVisual(null);
        setVisualState(undefined);
        setSelectedObject(null);
        setCoordinateDraft(null);
        visualStateRef.current = undefined;
      } else setError(message);
    } finally {
      if (requestId === analysisRequestRef.current) setBusy(false);
    }
  }
  function editRecognition() {
    analysisRequestRef.current += 1;
    setBusy(false);
    setAnalysisResult(null);
    setResult(null);
    setVisual(null);
    setVisualState(undefined);
    setAnalysisStatus("idle");
    setAnalysisError("");
    setNotice(
      "Bạn có thể sửa lại đề bài, sau đó phân tích lại để tạo mô hình mới.",
    );
    setInputDockOpen(true);
    setInputTab("text");
    window.setTimeout(
      () => document.getElementById("explore-problem")?.focus(),
      0,
    );
  }
  function changeProblem(value: string) {
    analysisRequestRef.current += 1;
    assistantRequestRef.current += 1;
    assistantAbortRef.current?.abort();
    setAssistantBusy(false);
    setAssistantAnswer(null);
    setLassoContext(null);
    setProblemPrompt(value);
    if (analysisStatus === "analyzing") {
      analysisRequestRef.current += 1;
      setBusy(false);
    }
    if (analysisStatus !== "idle" || analysisResult) {
      setAnalysisResult(null);
      setResult(null);
      setVisual(null);
      setVisualState(undefined);
      setSelectedObject(null);
      setCoordinateDraft(null);
      setAnalysisStatus("idle");
      setAnalysisError("");
      coordinateEditRef.current = false;
      visualStateRef.current = undefined;
    }
  }
  async function askExploreAssistant() {
    if (!reflectionPrompt.trim() || (!visual && !lassoContext) || assistantBusy)
      return;
    const requestId = ++assistantRequestRef.current;
    const controller = new AbortController();
    const startedAt = performance.now();
    assistantAbortRef.current?.abort();
    assistantAbortRef.current = controller;
    setAssistantBusy(true);
    setError("");
    setAssistantAnswer(null);
    recordSessionEvent(
      "question-asked",
      "Hỏi trợ giảng AI",
      selectedObject?.id,
      { length: reflectionPrompt.length },
    );
    try {
      const answer = await request<ExploreAssistantAnswer>(
        "/api/explore-assistant",
        {
          method: "POST",
          body: JSON.stringify({
            question: reflectionPrompt,
            title: lassoContext ? "Vùng hình học đã chọn" : lessonTitle,
            formula: lassoContext ? "" : visual ? readout.formula : "",
            parameters: lassoContext ? {} : values,
            observations: lassoContext
              ? [lassoContext.region]
              : visual
                ? [liveObservation, ...readout.observations].slice(0, 4)
                : [],
            selectedObject: lassoContext
              ? null
              : selectedDetails
                ? {
                    label: selectedDetails.title,
                    kind: selectedDetails.kind,
                    details: selectedDetails.details.slice(0, 8),
                  }
                : null,
            selectionContext: lassoContext
              ? {
                  imageDataUrl: lassoContext.imageDataUrl,
                  region: lassoContext.region,
                  inkStrokeCount: lassoContext.inkStrokeCount,
                  objects: lassoContext.objects,
                }
              : undefined,
            dimension: visual?.dimension || "2d",
          }),
          signal: controller.signal,
        },
      );
      if (requestId !== assistantRequestRef.current) return;
      setAssistantAnswer(answer);
      recordSessionEvent(
        "assistant-answered",
        "Trợ giảng đã phản hồi",
        selectedObject?.id,
        {
          answer: answer.answer,
          evidence: answer.evidence,
          latencyMs: Math.round(performance.now() - startedAt),
          selectedRegion: Boolean(lassoContext),
        },
      );
    } catch (reason) {
      if (
        requestId === assistantRequestRef.current &&
        !controller.signal.aborted
      )
        setError((reason as Error).message);
    } finally {
      if (requestId === assistantRequestRef.current) {
        setAssistantBusy(false);
        assistantAbortRef.current = null;
      }
    }
  }
  async function sendImageForRecognition(
    imageDataUrl: string,
    mode: "photo" | "handwriting",
    revision: number,
    signal: AbortSignal,
  ) {
    const result = await request<ProblemRecognition>(
      "/api/problem-recognition",
      {
        method: "POST",
        body: JSON.stringify({ imageDataUrl, mode }),
        signal,
      },
    );
    if (revision === recognitionRequestRef.current && !signal.aborted)
      setRecognitionDraft({ ...result, imageDataUrl, mode });
  }
  async function recognizeUploadedImage(file?: File) {
    if (!file) return;
    recognitionAbortRef.current?.abort();
    const revision = ++recognitionRequestRef.current;
    const controller = new AbortController();
    recognitionAbortRef.current = controller;
    setRecognizingImage(true);
    setError("");
    setRecognitionDraft(null);
    try {
      const imageDataUrl = await prepareProblemImage(file);
      if (revision !== recognitionRequestRef.current) return;
      await sendImageForRecognition(
        imageDataUrl,
        "photo",
        revision,
        controller.signal,
      );
    } catch (reason) {
      if (
        revision === recognitionRequestRef.current &&
        !controller.signal.aborted
      )
        setError((reason as Error).message || "Không nhận diện được ảnh.");
    } finally {
      if (revision === recognitionRequestRef.current) {
        setRecognizingImage(false);
        recognitionAbortRef.current = null;
      }
    }
  }
  function applySketchResult(data: AgentResult | null) {
    analysisRequestRef.current++;
    setBusy(false);
    setAnalysisError("");
    setError("");
    setRecognitionDraft(null);
    setResult(data);
    setAnalysisResult(data);
    setVisual(data?.visual || null);
    setSketchTitle(data?.title || "Bảng vẽ trống");
    setAnalysisStatus(data ? "ready" : "idle");
    setVisualState(undefined);
    visualStateRef.current = undefined;
    restoredVisualRef.current = null;
    setSelectedObject(null);
    setCoordinateDraft(null);
    setAssistantAnswer(null);
    if (data) markStep("explain");
  }
  async function rebuildRecognizedSketch() {
    if (!recognitionDraft || busy) return;
    const revision = ++analysisRequestRef.current;
    setBusy(true);
    setError("");
    setAnalysisStatus("analyzing");
    setAnalysisError("");
    setAnalysisResult(null);
    setResult(null);
    setVisual(null);
    setVisualState(undefined);
    setSelectedObject(null);
    setCoordinateDraft(null);
    visualStateRef.current = undefined;
    try {
      if (!recognitionHasDiagram(recognitionDraft)) {
        const prompt = recognitionDraft.transcription.trim();
        if (!prompt)
          throw Error(
            "Ảnh chưa có phần văn bản đề bài để dựng hình từ dữ kiện.",
          );
        const data = await request<AgentResult>("/api/agent/explore", {
          method: "POST",
          body: JSON.stringify({ prompt }),
        });
        if (revision !== analysisRequestRef.current) return;
        setProblemPrompt(recognitionDraft.transcription);
        applySketchResult(AgentResultSchema.parse(data));
        setInputDockOpen(false);
        recordSessionEvent(
          "scene-generated",
          `Đã dựng mô hình từ đề ảnh: ${data.title}`,
          data.visual.id,
          {
            source: data.source,
            dimension: data.visual.dimension,
            visual: data.visual,
            result: data,
          },
        );
        return;
      }
      const data = await request<{ result: AgentResult }>("/api/sketch", {
        method: "POST",
        body: JSON.stringify({
          imageDataUrl: recognitionDraft.imageDataUrl,
          mode: recognitionDraft.mode,
          problemText: recognitionDraft.transcription,
          prompt: [
            recognitionDraft.transcription,
            recognitionDraft.figureDescription,
          ]
            .join("\n")
            .slice(0, 8000),
        }),
      });
      if (revision !== analysisRequestRef.current) return;
      setProblemPrompt(recognitionDraft.transcription);
      applySketchResult(AgentResultSchema.parse(data.result));
      setInputDockOpen(false);
    } catch (reason) {
      if (revision === analysisRequestRef.current) {
        const message =
          (reason as Error).message ||
          "Không dựng được mô hình từ dữ kiện đã nhận diện.";
        setError(message);
        setAnalysisError(message);
        setAnalysisStatus("error");
        setAnalysisResult(null);
        setResult(null);
        setVisual(null);
        setVisualState(undefined);
        visualStateRef.current = undefined;
      }
    } finally {
      if (revision === analysisRequestRef.current) setBusy(false);
    }
  }
  async function moveToStudio() {
    if (!visual || busy) return;
    setBusy(true);
    setError("");
    try {
      const source = result || {
        title: selectedPattern?.title || "Mô hình khám phá",
        explanation:
          visual.accessibility?.description || "Mô hình trực quan toán học.",
        visual,
        entities: [],
        methods: [],
        steps: [],
        suggestions: [],
        source: "template" as const,
      };
      const saved = await request<Material>("/api/materials", {
        method: "POST",
        body: JSON.stringify(
          makeMaterial(source, runtime.current?.serialized() || visual),
        ),
      });
      recordSessionEvent(
        "material-created",
        "Tạo học liệu từ phiên khám phá",
        saved.id,
        { title: saved.title },
      );
      router.push(`/studio?material=${saved.id}`);
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }

  function correctProblemSource(value: string) {
    changeProblem(value);
    setAnalysisError("");
    setError("");
    setNotice(
      "Đã xác nhận đáy ACDF. Bấm Phân tích đề bài để dựng lại theo phần chữ đã sửa.",
    );
  }
  function correctRecognitionSource(value: string) {
    if (!recognitionDraft) return;
    setRecognitionDraft({ ...recognitionDraft, transcription: value });
    setAnalysisError("");
    setError("");
    setNotice(
      "Đã xác nhận đáy ACDF; giữ nguyên ảnh nguồn. Bấm AI dựng hình từ ảnh để dựng lại.",
    );
  }
  function explainDrawing() {
    setInputDockOpen(false);
    setNotice(
      "Dùng nút “Vẽ trên hình” ngay phía trên biểu đồ để phác trực tiếp.",
    );
  }
  function chooseTopic(value: string) {
    setTopic(value);
    setShowSelectedOnly(false);
  }
  function toggleSelectionOnly() {
    setShowSelectedOnly((value) => !value);
  }
  function toggleInformation() {
    setInformationOpen((value) => !value);
    setAssistantOpen(false);
  }
  function openTextInput() {
    setInputDockOpen(true);
    setInputTab("text");
  }
  function onHandwritingChange(value: HandwritingDraft) {
    setHandwritingDraft(value);
    setHandwritingUndo(structuredClone(handwritingHistory.current));
  }
  function clearAssistantSelection() {
    assistantRequestRef.current++;
    assistantAbortRef.current?.abort();
    setAssistantBusy(false);
    setAssistantAnswer(null);
    setLassoContext(null);
  }
  function changeReflectionPrompt(value: string) {
    if (assistantBusy) {
      assistantRequestRef.current++;
      assistantAbortRef.current?.abort();
      setAssistantBusy(false);
    }
    setReflectionPrompt(value);
  }
  function focusReadout() {
    if (readout.focus[0])
      runtime.current?.actions([
        { type: "focus", targets: readout.focus[0].targets },
      ]);
  }
  const catalog: ExploreCatalogProps = {
    assistantOpen: assistantOpen,
    hasPreviousSession: !!availableSession,
    busy: busy,
    catalogBusy: catalogBusy,
    choosePattern: choosePattern,
    filtered: filtered,
    informationOpen: informationOpen,
    moveToStudio: moveToStudio,
    query: query,
    resumePreviousSession: resumePreviousSession,
    selected: selected,
    changeQuery: setQuery,
    chooseTopic: chooseTopic,
    showSelectedOnly: showSelectedOnly,
    toggleSelectionOnly: toggleSelectionOnly,
    toggleInformation: toggleInformation,
    openTextInput: openTextInput,
    topic: topic,
    topics: topics,
    hasVisual: !!visual,
  };
  const inputPanel: ExploreInputProps = {
    analysisError: analysisError,
    analysisStatus: analysisStatus,
    askAgent: () => askAgent(true, problemPrompt, true),
    busy: busy,
    changeProblem: changeProblem,
    editRecognition: editRecognition,
    handwritingDraft: handwritingDraft,
    handwritingHistory: handwritingHistory,
    inputDockOpen: inputDockOpen,
    inputTab: inputTab,
    latexDraft: latexDraft,
    problemPrompt: problemPrompt,
    rebuildRecognizedSketch: rebuildRecognizedSketch,
    recognition: recognition,
    recognitionDraft: recognitionDraft,
    recognizeUploadedImage: recognizeUploadedImage,
    recognizingImage: recognizingImage,
    replaySessionEvent: replaySessionEvent,
    onInputDockOpenChange: setInputDockOpen,
    onInputTabChange: setInputTab,
    onLatexChange: setLatexDraft,
    onRecognitionChange: setRecognitionDraft,
    correctProblemSource: correctProblemSource,
    correctRecognitionSource: correctRecognitionSource,
    onHandwritingChange: onHandwritingChange,
    explainDrawing: explainDrawing,
    sessionHistory: sessionEventsRef.current.map((event) => ({
      event,
      restorable: VisualSpecSchema.safeParse(event.payload.visual).success,
    })),
    sketchTitle: sketchTitle,
    visual: visual,
  };
  const contextPanel: ExploreContextProps = {
    analysisResult: analysisResult,
    applySelectedCoordinates: applySelectedCoordinates,
    askExploreAssistant: askExploreAssistant,
    assistantAnswer: assistantAnswer,
    assistantBusy: assistantBusy,
    assistantOpen: assistantOpen,
    busy: busy,
    coordinateDraft: coordinateDraft,
    displayGraphExpression: displayGraphExpression,
    editSelectedCoordinate: editSelectedCoordinate,
    informationOpen: informationOpen,
    lassoContext: lassoContext,
    learning: learning,
    learningTab: learningTab,
    lessonTitle: lessonTitle,
    liveMetricChips: liveMetricChips,
    liveObservation: liveObservation,
    markStep: markStep,
    moveToStudio: moveToStudio,
    objectLabelDraft: objectLabelDraft,
    objectNoteDraft: objectNoteDraft,
    parameterDetails: parameterDetails,
    readout: readout,
    reflectionPrompt: reflectionPrompt,
    reset: reset,
    saveSelectedAnnotation: saveSelectedAnnotation,
    selectedDetails: selectedDetails,
    selectedObject: selectedObject,
    selectedPattern: selectedPattern,
    closeAssistant: () => setAssistantOpen(false),
    clearSelection: () => {
      setSelectedObject(null);
      setCoordinateDraft(null);
    },
    onCoordinateEditingChange: (editing: boolean) => {
      coordinateEditRef.current = editing;
    },
    clearAssistantSelection: clearAssistantSelection,
    focusReadout: focusReadout,
    closeInformation: () => setInformationOpen(false),
    onLearningTabChange: setLearningTab,
    onObjectLabelChange: setObjectLabelDraft,
    onObjectNoteChange: setObjectNoteDraft,
    changeReflectionPrompt: changeReflectionPrompt,
    visual: visual,
  };
  const constructDirect = (
    tool: DirectTool,
    lines: LineHit[],
    through: VertexHit | null,
    style: DrawingStyle,
  ) =>
    commitGeometryEdit(
      (source) => applyDirectConstruction(source, tool, lines, through, style),
      tool === "markLength"
        ? "Đã đánh dấu cạnh bằng nhau theo tọa độ; đây không phải chứng minh."
        : "Đã dựng từ đường/cạnh tham chiếu; các quan hệ được giữ.",
    );
  const translateGroup = (ids: string[], dx: number, dy: number) =>
    commitGeometryEdit(
      (source) => translateExploreGroup(source, ids, dx, dy),
      "Đã dời nhóm và giữ các quan hệ phụ thuộc.",
    );
  const moveLabel = (id: string, offset: [number, number]) =>
    commitGeometryEdit(
      (source) => moveExploreLabel(source, id, offset),
      "Đã dời nhãn; tọa độ hình được giữ nguyên.",
    );
  return {
    catalog,
    inputPanel,
    openStudioBoard: () => router.push("/studio?board=import"),
    reportBoardError: setError,
    contextPanel,
    constructDirect,
    translateGroup,
    moveLabel,
    analysisError,
    analysisStatus,
    applyGraphInk,
    assistantOpen,
    boardOptions,
    canvasHost,
    changeSelectedEdgeStyle,
    commitDrawing,
    commitVisual,
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
    canUndo: sceneDocument.canUndo,
    canRedo: sceneDocument.canRedo,
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
  };
}
