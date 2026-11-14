"use client";
import { type VisualSpec, type VisualStateSummary } from "@/lib/contracts";
import type { GraphInkDraft } from "@/lib/graph-ink-draft";
import type { VertexHit, VisualSelection } from "@/lib/runtime";
import { useRef, useState } from "react";
import { BoardOptions, ExploreRuntime, GeometryAnnotationKind } from "./shared";
export function useExploreSelectionState(initialOptions?: BoardOptions, initialInk?: GraphInkDraft) {
  const [inkDraft, setInkDraft] = useState<GraphInkDraft | null>(initialInk || null);
  const [inkMountRevision, setInkMountRevision] = useState(0);
  const [visualState, setVisualState] = useState<VisualStateSummary>();
  const [selectedObject, setSelectedObject] = useState<VisualSelection | null>(
    null,
  );
  const [selectedObjects, setSelectedObjects] = useState<VisualSelection[]>([]);
  const [connectionVertices, setConnectionVertices] = useState<VertexHit[]>([]);
  const [objectLabelDraft, setObjectLabelDraft] = useState("");
  const [objectMeasurementDraft, setObjectMeasurementDraft] = useState("");
  const [objectNoteDraft, setObjectNoteDraft] = useState("");
  const [graphMenu, setGraphMenu] = useState<{
    id: string;
    ids?: string[];
    x: number;
    y: number;
    editing: boolean;
  } | null>(null);
  const [boardOptions, setBoardOptions] = useState<BoardOptions>(initialOptions || {
    axes: false,
    grid: true,
    snap: false,
    labels: true,
  });
  const [geometryAnnotations, setGeometryAnnotations] = useState<
    Record<GeometryAnnotationKind, boolean>
  >({
    structure: true,
    vertex: true,
    length: true,
    angle: true,
    face: true,
    helper: true,
  });
  const [surfaceFill, setSurfaceFill] = useState(true);
  const [coordinateDraft, setCoordinateDraft] = useState<{
    id: string;
    x: string;
    y: string;
  } | null>(null);
  const runtime = useRef<ExploreRuntime>(undefined);
  const canvasHost = useRef<HTMLDivElement>(null);
  const [drawingStage, setDrawingStage] = useState<HTMLElement | null>(null);
  const [drawingActive, setDrawingActive] = useState(false);
  const [drawingCancelRevision, setDrawingCancelRevision] = useState(0);
  const nativeDragBefore = useRef<VisualSpec | null | undefined>(undefined);
  const visualStateRef = useRef<VisualStateSummary | undefined>(undefined);
  const coordinateEditRef = useRef(false);
  return {
    inkDraft,
    setInkDraft,
    inkMountRevision,
    setInkMountRevision,
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
    nativeDragBefore,
    visualStateRef,
    coordinateEditRef,
  };
}
