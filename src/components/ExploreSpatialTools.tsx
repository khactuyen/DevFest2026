"use client";
import { useEffect, useState } from "react";
import { Compass, LocateFixed, Trash2, X } from "lucide-react";
import { ThreeObjectSchema, type ThreeVisualSpec, type VisualSpec } from "@/lib/contracts";
import type { ExploreRuntime } from "./explore/shared";
import type { VertexHit } from "@/lib/runtime";
import { restoreExploreBoard2d } from "@/lib/sketch-3d";
import { SPATIAL_TOOLS, type SpatialTool, type XYZ } from "@/lib/spatial-constructions";
import {
  addSpatialConstruction,
  addSpatialSolid,
  solidPresetVertexCount,
  emptySpatialScene,
  spatialCoordinateObjects,
  spatialConstructionInput,
  addSpatialNet,
  uid,
} from "@/lib/spatial-scene-commands";

const solidPresets = {
  box: { label: "Lập phương", kind: "box", size: "Cạnh" },
  rectangularBox: {
    label: "Hộp chữ nhật",
    kind: "rectangularBox",
    size: "Chiều dài",
    radius: "Chiều rộng",
    height: true,
  },
  triangularPrism: {
    label: "Lăng trụ tam giác",
    kind: "prism",
    sides: 3,
    radius: "Bán kính ngoại tiếp đáy",
    height: true,
  },
  prism: {
    label: "Lăng trụ đa giác",
    kind: "prism",
    sides: "custom",
    radius: "Bán kính ngoại tiếp đáy",
    height: true,
  },
  triangularPyramid: {
    label: "Chóp tam giác",
    kind: "pyramid",
    sides: 3,
    radius: "Bán kính ngoại tiếp đáy",
    height: true,
  },
  squarePyramid: {
    label: "Chóp đáy vuông",
    kind: "pyramid",
    sides: 4,
    radius: "Bán kính ngoại tiếp đáy",
    height: true,
  },
  pyramid: {
    label: "Chóp đa giác",
    kind: "pyramid",
    sides: "custom",
    radius: "Bán kính ngoại tiếp đáy",
    height: true,
  },
  frustum: {
    label: "Chóp cụt",
    kind: "frustum",
    sides: "custom",
    radius: "Bán kính ngoại tiếp đáy lớn",
    height: true,
  },
  cylinder: {
    label: "Hình trụ",
    kind: "cylinder",
    radius: "Bán kính",
    height: true,
  },
  cone: { label: "Hình nón", kind: "cone", radius: "Bán kính", height: true },
  sphere: { label: "Hình cầu", kind: "sphere", radius: "Bán kính" },
} as const;
type SolidPreset = keyof typeof solidPresets;
const spatialSolidTypes = new Set([
  "box", "tetrahedron", "octahedron", "dodecahedron", "icosahedron",
  "prism", "pyramid", "cylinder", "cone", "sphere", "extrudedPolygon", "polyhedron3d",
]);

export type SpatialControlProps = {
  visual: VisualSpec | null;
  getRuntime: () => ExploreRuntime | null;
  onCommit: (s: VisualSpec, label?: string) => void;
  onActiveChange: (b: boolean) => void;
  sourceId?: string;
  faceIndex?: number;
};

export function ExploreSpatialTools({
  visual,
  getRuntime,
  onCommit,
  onActiveChange,
  sourceId,
  faceIndex,
  open,
  setOpen,
}: SpatialControlProps & { open: boolean; setOpen: (open: boolean) => void }) {
  const [tool, setTool] = useState<SpatialTool | null>(null),
    [dragging, setDragging] = useState<"object" | "apex" | false>(false),
    [target, setTarget] = useState<{ id?: string; face?: number }>({}),
    [hits, setHits] = useState<VertexHit[]>([]),
    [error, setError] = useState("");
  const [sectionColor, setSectionColor] = useState("#e58b34");
  const [vertexNames, setVertexNames] = useState<string[]>([]);
  const [solidDrafts, setSolidDrafts] = useState<Record<string, { label: string; x: string; y: string; z: string }>>({});
  const [shape, setShape] = useState<SolidPreset>("box"),
    [sides, setSides] = useState(4),
    [size, setSize] = useState(3),
    [radius, setRadius] = useState(2),
    [height, setHeight] = useState(3);
  const [coordinateKind, setCoordinateKind] = useState<
      "point" | "line" | "plane" | "sphere" | "axes"
    >("point"),
    [coordinates, setCoordinates] = useState("0, 0, 0");
  const preset = solidPresets[shape];
  const baseSides = "sides" in preset ? (preset.sides === "custom" ? sides : preset.sides) : 4;
  const vertexCount = solidPresetVertexCount(preset.kind, baseSides);
  const is3d = visual?.dimension === "3d";
  const boardSnapshot = () => {
    const live = getRuntime()?.serialized();
    return live?.dimension === visual?.dimension ? live : visual;
  };
  const snapshot = () => {
    const scene = boardSnapshot();
    if (scene?.dimension !== "3d") throw Error("Hãy mở bảng 3D trước.");
    return scene;
  };
  function addToSpace(
    add: (scene: ThreeVisualSpec) => ThreeVisualSpec,
    label: string,
  ) {
    const board = boardSnapshot();
    if (board?.dimension === "3d") {
      onCommit(add(board), label);
    } else {
      const message = `${label}. Bấm hoặc kéo trực tiếp hình chiếu trên bảng 2D.`;
      if (board && !board.savedNative3d) {
        const scene = add({
          ...emptySpatialScene(),
          objects: board.savedSpatialObjects ?? [],
          parameters: board.savedSpatialParameters ?? [],
        });
        onCommit({ ...board, savedSpatialObjects: scene.objects }, message);
      } else {
        const scene = add(board?.savedNative3d ?? emptySpatialScene());
        onCommit(
          board
            ? { ...board, savedNative3d: scene }
            : restoreExploreBoard2d(scene),
          message,
        );
      }
    }
    setOpen(false);
  }
  const managedSolids = visual
    ? visual.dimension === "3d"
      ? visual.objects.filter((object) => object.userCreated && !object.marker && spatialSolidTypes.has(object.type))
      : [
          ...(visual.savedNative3d?.objects ?? []),
          ...(visual.savedSpatialObjects ?? []),
        ].filter((object, index, all) =>
          object.userCreated && !object.marker && spatialSolidTypes.has(object.type) &&
          all.findIndex((candidate) => candidate.id === object.id) === index,
        )
    : [];
  function updateManagedSolid(
    id: string,
    patch: { label?: string; position?: XYZ },
  ) {
    if (!visual) return;
    if (visual.dimension === "3d") {
      const scene = boardSnapshot();
      if (scene?.dimension !== "3d") return;
      onCommit({
        ...scene,
        objects: scene.objects.map((object) => object.id === id ? { ...object, ...patch } : object),
      }, "Đã cập nhật khối không gian");
      return;
    }
    if (visual.savedNative3d?.objects.some((object) => object.id === id)) {
      const savedNative3d = visual.savedNative3d;
      onCommit({
        ...visual,
        savedNative3d: {
          ...savedNative3d,
          objects: savedNative3d.objects.map((object) => object.id === id ? { ...object, ...patch } : object),
        },
      }, "Đã cập nhật khối không gian");
      return;
    }
    onCommit({
      ...visual,
      savedSpatialObjects: (visual.savedSpatialObjects ?? []).map((object) => object.id === id ? { ...object, ...patch } : object),
    }, "Đã cập nhật khối không gian");
  }
  function deleteManagedSolid(id: string) {
    if (!visual) return;
    if (!window.confirm("Xóa khối không gian này? Các đối tượng được dựng phụ thuộc vào khối cũng sẽ bị xóa.")) return;
    const removeDependents = <T extends { id: string; vertexEndpoints?: { objectId: string }[]; spatialConstruction?: { sourceId?: string; inputs: { anchor?: { objectId: string } }[] }; net?: { sourceId: string } }>(objects: T[]) => {
      const removed = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const object of objects) {
          const references = [
            ...(object.vertexEndpoints?.map((anchor) => anchor.objectId) ?? []),
            ...(object.spatialConstruction?.inputs.flatMap((point) => point.anchor ? [point.anchor.objectId] : []) ?? []),
            object.spatialConstruction?.sourceId,
            object.net?.sourceId,
          ];
          if (!removed.has(object.id) && references.some((sourceId) => sourceId && removed.has(sourceId))) {
            removed.add(object.id);
            changed = true;
          }
        }
      }
      return objects.filter((object) => !removed.has(object.id));
    };
    if (visual.dimension === "3d") {
      const scene = boardSnapshot();
      if (scene?.dimension === "3d") onCommit({ ...scene, objects: removeDependents(scene.objects) }, "Đã xóa khối và các hình phụ thuộc");
    } else if (visual.savedNative3d?.objects.some((object) => object.id === id)) {
      onCommit({ ...visual, savedNative3d: { ...visual.savedNative3d, objects: removeDependents(visual.savedNative3d.objects) } }, "Đã xóa khối không gian");
    } else {
      onCommit({ ...visual, savedSpatialObjects: removeDependents(visual.savedSpatialObjects ?? []) }, "Đã xóa khối không gian");
    }
  }
  const cancel = () => {
    setTool(null);
    setHits([]);
    setError("");
  };
  useEffect(() => {
    onActiveChange(Boolean(tool) && is3d);
    return () => onActiveChange(false);
  }, [tool, is3d, onActiveChange]);
  useEffect(() => {
    if (is3d) return;
    setTool(null);
    setDragging(false);
    setHits([]);
    setError("");
  }, [is3d]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setTool(null);
        setDragging(false);
        setHits([]);
        setError("");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function run(action: () => void) {
    try {
      action();
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không thực hiện được phép dựng.",
      );
    }
  }
  function choose(t: SpatialTool) {
    const scene = getRuntime()?.serialized();
    if (!is3d || scene?.dimension !== "3d") {
      setError("Mở bảng 3D để dùng công cụ dựng trong không gian.");
      return;
    }
    if (
      t === "section" &&
      !scene.objects.some(
        (o) =>
          o.id === sourceId &&
          !["curve3d", "label3d", "face3d", "slicePlane"].includes(o.type) &&
          !o.marker,
      )
    ) {
      setError("Chọn khối cần cắt trước khi chọn công cụ Thiết diện.");
      return;
    }
    if (
      t === "flatten" &&
      !scene.objects.some(
        (o) =>
          o.id === sourceId &&
          (o.type === "face3d" ||
            (faceIndex !== undefined &&
              !["sphere", "cylinder", "cone"].includes(o.type))),
      )
    ) {
      setError("Chọn một mặt phẳng của khối trước khi tách hình thật.");
      return;
    }
    setTool(t);
    setDragging(false);
    setTarget({ id: sourceId, face: faceIndex });
    setHits([]);
    setError("");
    setOpen(false);
  }
  const active = getRuntime(),
    diagnostics =
      active && "constructionErrors" in active
        ? active.constructionErrors()
        : [];
  const warnings =
    active && "constructionWarnings" in active
      ? active.constructionWarnings()
      : [];
  const selectedSection = visual?.dimension === "3d"
    ? visual.objects.find((object) => object.id === sourceId && object.spatialConstruction?.tool === "section")
    : undefined;
  const liveScene = open && visual?.dimension === "3d" ? active?.serialized() : null;
  const namedSolid = liveScene?.dimension === "3d"
    ? liveScene.objects.find((object) => object.id === sourceId && object.userCreated && !object.marker)
    : undefined;
  const namedVertices = namedSolid && active && "vertices" in active
    ? active.vertices().flatMap((vertex) => vertex.objectId === namedSolid.id && vertex.vertexIndex !== undefined ? [vertex.vertexIndex] : [])
    : [];
  const selectedNet = liveScene?.dimension === "3d"
    ? liveScene.objects.find((object) => object.id === sourceId && object.net && object.faces3d?.length)
    : undefined;
  const previewingSection = is3d && tool === "section" && hits.length === 3;
  const sectionParameters = previewingSection && active && "state" in active
    ? JSON.stringify(active.state().parameters) : "";
  const cutSource = visual?.dimension === "3d" && visual.objects.find((object) =>
    object.id === (previewingSection ? target.id : selectedSection?.spatialConstruction?.sourceId),
  );
  const canSplit = cutSource && ["box", "pyramid"].includes(cutSource.type);
  function applySplit(parentId: string, parts: { position: XYZ; faces3d: XYZ[][] }[], color: string, sectionId?: string) {
    const scene = snapshot();
    const parent = scene.objects.find((object) => object.id === parentId);
    if (!parent) throw Error("Không tìm thấy khối cần tách.");
    onCommit({
      ...scene,
      objects: [
        ...scene.objects.map((object) => object.id === parentId || object.id === sectionId
          ? { ...object, visible: false } : object),
        ...parts.map((part, index) => ThreeObjectSchema.parse({
          id: uid(), type: "polyhedron3d", label: `${parent.label ?? "Khối"} · phần ${index + 1}`,
          color: index === 0 ? parent.color : color, userCreated: true, ...part,
        })),
      ],
    }, "Đã tách khối thành hai phần. Dùng Kéo đối tượng 3D để di chuyển từng phần.");
    cancel();
    setOpen(false);
  }
  function resolveSection() {
    if (!active || !("sectionAt" in active)) throw Error("Bảng 3D chưa sẵn sàng.");
    const positions = active.resolveSpatialInputs(hits.map(spatialConstructionInput));
    if (positions.some((point) => !point)) throw Error("Thiết diện thiếu điểm nguồn.");
    return { points: positions as XYZ[], polygon: active.sectionAt(target.id, positions as XYZ[]) };
  }
  useEffect(() => {
    if (!previewingSection || !active || !("setSectionPreview" in active)) return;
    run(() => active.setSectionPreview(resolveSection().polygon, sectionColor));
    return () => active.setSectionPreview();
  }, [active, previewingSection, sectionColor, hits, target.id, sectionParameters]);
  useEffect(() => {
    if (!active || !("setObjectDragging" in active)) return;
    active.setObjectDragging(is3d && Boolean(dragging), dragging === "apex");
    return () => active.setObjectDragging(false);
  }, [active, dragging, is3d]);
  useEffect(() => {
    if (!is3d || !tool || !active || !("setConstructionPicker" in active))
      return;
    active.setConstructionPicker((hit) => {
      run(() => {
        if (previewingSection) return;
        if (!hit || hit.free)
          throw Error(
            tool === "edgePoint"
              ? "Bấm vào thân cạnh để đặt điểm trên cạnh."
              : "Chọn một đỉnh hoặc một điểm trên cạnh để giữ quan hệ với hình gốc.",
          );
        const next = [...hits, hit];
        const positions = active.resolveSpatialInputs(
          next.map(spatialConstructionInput),
        );
        if (positions.some((position) => !position))
          throw Error(
            "Điểm nguồn đã thay đổi. Bỏ điểm cuối hoặc bắt đầu lại phép dựng.",
          );
        const point = positions.at(-1)!;
        if (
          positions
            .slice(0, -1)
            .some(
              (p) =>
                p &&
                Math.hypot(...p.map((value, axis) => value - point[axis])) <
                  1e-7,
            )
        )
          throw Error("Điểm này đã được chọn. Hãy chọn một điểm khác.");
        if (next.length < SPATIAL_TOOLS[tool].count) {
          setHits(next);
          return;
        }
        if (tool === "section") {
          active.sectionAt(target.id, positions as XYZ[]);
          setHits(next);
          return;
        }
        onCommit(
          addSpatialConstruction(
            active.serialized(),
            tool,
            next.map((picked, i) => ({ ...picked, position: positions[i]! })),
            target.id,
            target.face,
          ),
          `Đã dựng ${SPATIAL_TOOLS[tool].label.toLowerCase()}`,
        );
        cancel();
      });
    }, tool === "edgePoint");
    return () => active.setConstructionPicker(null);
  });
  return (
    <>
      {is3d && (
        <button
          type="button"
          aria-pressed={dragging === "object"}
          title="Kéo khối hoặc điểm Oxyz đã thêm. Kéo vùng trống để xoay."
          onClick={() => {
            cancel();
            setDragging(dragging === "object" ? false : "object");
            setOpen(false);
          }}
        >
          Kéo đối tượng 3D
        </button>
      )}
      {is3d && visual.objects.some((object) => object.type === "pyramid" && !object.parameterBindings?.height) && (
        <button type="button" aria-pressed={dragging === "apex"}
          title="Kéo đỉnh chóp để đổi hình, đáy giữ nguyên."
          onClick={() => { cancel(); setDragging(dragging === "apex" ? false : "apex"); setOpen(false); }}>
          Kéo đỉnh chóp
        </button>
      )}
      {open && (
        <div className="explore-spatial-menu">
          <button
            className="tool-menu-close"
            aria-label="Đóng công cụ không gian"
            onClick={() => setOpen(false)}
          >
            <X size={14} />
          </button>
          <b>Khối không gian</b>
          {namedSolid && namedVertices.length > 0 && <details key={namedSolid.id}>
            <summary>Đặt tên các đỉnh của khối đã chọn</summary>
            <form onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              run(() => {
                const scene = snapshot();
                const object = scene.objects.find((item) => item.id === namedSolid.id);
                if (!object) throw Error("Khối đã chọn không còn trên bảng.");
                const annotations = { ...object.vertexAnnotations };
                for (const index of namedVertices) {
                  const label = String(values.get(String(index)) ?? "").trim() || undefined;
                  const previous = annotations[index];
                  if (label || previous?.note) annotations[index] = { ...previous, label };
                  else delete annotations[index];
                }
                object.vertexAnnotations = Object.keys(annotations).length ? annotations : undefined;
                onCommit(scene, "Đã lưu tên các đỉnh của khối.");
                setOpen(false);
              });
            }}>
              <fieldset className="spatial-vertex-names">
                <legend>Tên đỉnh của khối đã chọn</legend>
                <div className="spatial-form">
                  {namedVertices.map((index, i) => <label key={index}>
                    Đỉnh {i + 1}
                    <input name={String(index)} maxLength={100} defaultValue={namedSolid.vertexAnnotations?.[index]?.label ?? ""} />
                  </label>)}
                </div>
              </fieldset>
              <button type="submit">Lưu tên các đỉnh</button>
            </form>
          </details>}
          {selectedSection && <div className="spatial-form">
            <label>Màu thiết diện
              <input type="color" value={selectedSection.color} onChange={(event) => run(() => {
                const color = event.target.value;
                const scene = snapshot();
                onCommit({ ...scene, objects: scene.objects.map((object) =>
                  object.id === selectedSection.id ? { ...object, color } : object
                ) }, "Đã đổi màu thiết diện");
              })}/>
            </label>
            {canSplit && <button type="button" onClick={() => run(() => {
              if (!active || !("splitAt" in active)) throw Error("Bảng 3D chưa sẵn sàng.");
              const { sourceId: parentId, parts } = active.splitAt(selectedSection.id);
              applySplit(parentId, parts, selectedSection.color, selectedSection.id);
            })}>Tách thành hai phần</button>}
          </div>}
          <div className="spatial-form">
            <button
              disabled={!is3d}
              onClick={() =>
                run(() => {
                  onCommit(
                    addSpatialNet(snapshot(), sourceId),
                    "Đã khai triển đa diện. Kéo tham số Mở / gấp để quan sát.",
                  );
                  setOpen(false);
                })
              }
            >
              Khai triển khối đã chọn
            </button>
            {selectedNet && <label>Mặt gốc khai triển
              <select value={selectedNet.net?.rootFace ?? 0} onChange={(event) => run(() => {
                const rootFace = Number(event.target.value);
                const scene = snapshot();
                onCommit({ ...scene, objects: scene.objects.map((object) =>
                  object.id === selectedNet.id && object.net
                    ? { ...object, net: { ...object.net, rootFace } } : object,
                ) }, "Đã đổi mặt gốc khai triển");
              })}>
                {selectedNet.faces3d!.map((_, index) => <option key={index} value={index}>Mặt {index + 1}</option>)}
              </select>
            </label>}
            <button
              disabled={!is3d}
              onClick={() =>
                run(() => {
                  const s = snapshot(),
                    selected = s.objects.find((o) => o.id === sourceId);
                  if (!selected?.net)
                    throw Error("Chọn bản khai triển cần ghim.");
                  onCommit(
                    {
                      ...s,
                      objects: s.objects.map((o) =>
                        o.id === sourceId ? { ...o, net: undefined } : o,
                      ),
                    },
                    "Đã ghim bản khai triển ở trạng thái hiện tại",
                  );
                  setOpen(false);
                })
              }
            >
              Ghim bản khai triển
            </button>
          </div>
          <div className="spatial-form">
            <select
              aria-label="Loại khối"
              value={shape}
              onChange={(e) => { setShape(e.target.value as SolidPreset); setVertexNames([]); }}
            >
              {Object.entries(solidPresets).map(([v, { label }]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            {"sides" in preset && preset.sides === "custom" && (
              <label>
                Số cạnh đáy
                <input
                  type="number"
                  min="3"
                  max="12"
                  value={sides}
                  onChange={(e) => setSides(Number(e.target.value))}
                />
              </label>
            )}
            {"size" in preset && (
              <label>
                {preset.size}
                <input
                  type="number"
                  min=".01"
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                />
              </label>
            )}
            {"radius" in preset && (
              <label>
                {preset.radius}
                <input
                  type="number"
                  min=".01"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                />
              </label>
            )}
            {"height" in preset && (
              <label>
                Chiều cao
                <input
                  type="number"
                  min=".01"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                />
              </label>
            )}
            <button
              onClick={() =>
                run(() => {
                  addToSpace(
                    (scene) =>
                      addSpatialSolid(
                        scene,
                        preset.kind,
                        baseSides,
                        "size" in preset ? size : undefined,
                        "radius" in preset ? radius : undefined,
                        "height" in preset ? height : undefined,
                        vertexNames.slice(0, vertexCount),
                      ),
                    "Đã thêm khối không gian",
                  );
                })
              }
            >
              Thêm khối
            </button>
          </div>
          {vertexCount > 0 && <fieldset className="spatial-vertex-names">
            <legend>Tên đỉnh · tùy chọn</legend>
            <div className="spatial-form">
              {Array.from({ length: vertexCount }, (_, index) => <label key={index}>
                Đỉnh {index + 1}
                <input value={vertexNames[index] ?? ""} maxLength={100}
                  onChange={(event) => {
                    const name = event.target.value;
                    setVertexNames((names) => Array.from({ length: vertexCount }, (_, i) => i === index ? name : names[i] ?? ""));
                  }} />
              </label>)}
            </div>
          </fieldset>}
          {managedSolids.length > 0 && <section className="spatial-solid-manager" aria-label="Quản lý khối không gian">
            <b>Khối đã thêm · sửa tên, vị trí hoặc xóa</b>
            {managedSolids.map((object) => {
              const position = object.position ?? [0, 0, 0];
              const draft = solidDrafts[object.id] ?? {
                label: object.label ?? object.id,
                x: String(position[0]), y: String(position[1]), z: String(position[2]),
              };
              return <div className="spatial-solid-row" key={object.id}>
                <label>Tên khối<input aria-label={`Tên khối ${object.label ?? object.id}`} value={draft.label}
                  onChange={(event) => setSolidDrafts((all) => ({ ...all, [object.id]: { ...draft, label: event.target.value } }))} /></label>
                <div className="spatial-solid-position" aria-label="Vị trí tâm khối">
                  {(["x", "y", "z"] as const).map((axis) => <label key={axis}>{axis}<input type="number" step="0.1" value={draft[axis]}
                    onChange={(event) => setSolidDrafts((all) => ({ ...all, [object.id]: { ...draft, [axis]: event.target.value } }))} /></label>)}
                </div>
                <div className="spatial-solid-actions">
                  <button type="button" onClick={() => run(() => {
                    const coordinates = [draft.x, draft.y, draft.z].map(Number);
                    if (coordinates.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e4)) throw Error("Tọa độ phải là số hữu hạn trong phạm vi ±10.000.");
                    updateManagedSolid(object.id, { label: draft.label.trim() || object.label || object.id, position: coordinates as XYZ });
                  })}>Lưu sửa đổi</button>
                  <button type="button" className="spatial-solid-delete" onClick={() => deleteManagedSolid(object.id)}><Trash2 size={13} /> Xóa</button>
                </div>
              </div>;
            })}
            <small>{is3d ? "Có thể kéo trực tiếp bằng nút Kéo đối tượng 3D. Bấm chuột phải lên khối để sửa tên đỉnh, cạnh và ghi chú." : "Các khối đang lưu trong không gian 3D vẫn quản lý được tại đây; chuyển sang 3D để kéo trực tiếp hoặc sửa từng đỉnh, cạnh."}</small>
          </section>}
          {!is3d && <small>Bấm để chọn, kéo để di chuyển, hoặc bấm chuột phải lên hình chiếu để chỉnh sửa.</small>}
          <b>
            <Compass size={14} />
            Dựng trong không gian
          </b>
          <div className="spatial-tool-grid">
            {Object.entries(SPATIAL_TOOLS).map(([key, info]) => (
              <button key={key} onClick={() => choose(key as SpatialTool)}>
                {info.label}
              </button>
            ))}
          </div>
          <b>
            <LocateFixed size={14} />
            Tọa độ Oxyz
          </b>
          <div className="spatial-form">
            <select
              aria-label="Đối tượng tọa độ"
              value={coordinateKind}
              onChange={(e) =>
                setCoordinateKind(e.target.value as typeof coordinateKind)
              }
            >
              <option value="point">Điểm x,y,z</option>
              <option value="line">Đường: x,y,z,ux,uy,uz</option>
              <option value="plane">Mặt: a,b,c,d</option>
              <option value="sphere">Cầu: x,y,z,r</option>
              <option value="axes">Hệ trục Oxyz</option>
            </select>
            <input
              aria-label="Các giá trị tọa độ"
              value={coordinates}
              onChange={(e) => setCoordinates(e.target.value)}
            />
            <button
              onClick={() =>
                run(() => {
                  addToSpace(
                    (scene) => ({
                      ...scene,
                      objects: [
                        ...scene.objects,
                        ...spatialCoordinateObjects(
                          coordinateKind,
                          coordinates
                            .split(/[,;\s]+/)
                            .filter(Boolean)
                            .map(Number),
                        ),
                      ],
                    }),
                    "Đã thêm đối tượng tọa độ",
                  );
                })
              }
            >
              Thêm
            </button>
          </div>
        </div>
      )}
      {is3d && tool && (
        <div className="spatial-instruction" role="status">
          <b>
            {SPATIAL_TOOLS[tool].label} · {hits.length}/
            {SPATIAL_TOOLS[tool].count}
          </b>
          <span>
            {["footLine"].includes(tool)
              ? "Chọn điểm cần chiếu, rồi hai điểm của đường."
              : ["footPlane", "distancePlane"].includes(tool)
                ? "Chọn điểm cần chiếu, rồi ba điểm của mặt phẳng."
                : "Bấm các đỉnh hoặc điểm trên cạnh theo thứ tự. Đường: 2 điểm; mặt phẳng: 3 điểm."}
          </span>
          <span>Bấm để chọn điểm · Kéo để xoay · Cuộn để thu phóng.</span>
          <span>{hits.map((h, i) => `${i + 1}: ${h.label}`).join(" · ")}</span>
          {previewingSection && <>
            <label>Màu mặt cắt <input type="color" value={sectionColor} onChange={(event) => setSectionColor(event.target.value)} /></label>
            <button type="button" onClick={() => run(() => {
              const { points, polygon } = resolveSection();
              const next = addSpatialConstruction(snapshot(), "section", hits.map((hit, index) => ({ ...hit, position: points[index] })), target.id);
              const section = next.objects.at(-1)!;
              section.color = sectionColor;
              section.points3d = polygon;
              onCommit(next, "Đã dựng thiết diện");
              cancel();
            })}>Áp dụng thiết diện</button>
            {canSplit && <button type="button" onClick={() => run(() => {
              if (!active || !("splitByPlane" in active) || !target.id) throw Error("Bảng 3D chưa sẵn sàng.");
              applySplit(target.id, active.splitByPlane(target.id, resolveSection().points), sectionColor);
            })}>Tách thành hai phần</button>}
          </>}
          <button
            aria-label="Bỏ điểm cuối"
            disabled={!hits.length}
            onClick={() => setHits((h) => h.slice(0, -1))}
          >
            Bước trước
          </button>
          <button aria-label="Hủy dựng không gian" onClick={cancel}>
            <X size={14} />
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="spatial-error">
          {error}
          <button
            aria-label="Đóng thông báo không gian"
            onClick={() => setError("")}
          >
            <X size={12} />
          </button>
        </div>
      )}
      {diagnostics.length > 0 && (
        <div role="alert" className="spatial-error">
          {diagnostics.map((d) => (
            <p key={d.id}>{d.message}</p>
          ))}
          Sửa nguồn hoặc hoàn tác để phục hồi phép dựng.
        </div>
      )}
      {!error && !diagnostics.length && warnings.length > 0 && (
        <div role="status" className="spatial-error">
          {warnings.map((w) => (
            <p key={w.id}>{w.message}</p>
          ))}
        </div>
      )}
    </>
  );
}
