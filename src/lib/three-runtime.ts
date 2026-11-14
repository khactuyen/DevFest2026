import type { VisualCorePort,CoordinatePort,SelectionPort,StatePort } from "./visual-ports";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { circularEdgePoint, type CircularEdgeKey } from "./circular-edge";
import type {
  ThreeVisualObject,
  ThreeVisualSpec,
  VisualAction,
  VisualStateSummary,
} from "./contracts";
import { resizeCubeObjects } from "./explore-constructions";
import type { VertexHit, VisualSelection } from "./runtime";
import { rebuildSketch3d } from "./sketch-3d";
import { buildConstrainedTetrahedron } from "./tetrahedron-problem";
import { curvePoints, disposeObject, indexedSolidVertices, polygonFacesGeometry, solidGeometry } from "./three/geometry";
import { annotationCaption, selectedAnnotation } from "./object-annotations";
import { wholeSolidSelection } from "./three-selection";
import { objectMeasurements } from "./three/measurements";
import { hasConcaveBase, meshSectionPolygon, splitConvexMesh, updateSections } from "./three/sections";
import { applyStrokeAppearance, strokeParts } from "./three/strokes";
import type { Entry } from "./three/types";
import { planarFace } from "./three/faces";
import { polyhedronNet,netHasOverlaps } from "./three/unfold";
import { constructSpatial, flattenPolygon, type XYZ } from "./spatial-constructions";
import { validateActions, validateVisual } from "./validation";

const color = "#2b5c47";

export function createThreeRuntime(
  container: HTMLElement,
  input: ThreeVisualSpec,
  onChange?: (state: VisualStateSummary) => void,
  onSelect?: (selection: VisualSelection) => void,
) {
  const spec = validateVisual(input) as ThreeVisualSpec;
  const values = Object.fromEntries(
    spec.parameters.map((item) => [item.id, item.value]),
  );
  const scene = new THREE.Scene();
  const boardBackground = new THREE.Color("#fbfcfd");
  scene.background = boardBackground;
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
  camera.position.fromArray(spec.camera.position);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const showScreenLabels = spec.objects.some(
    (object) => object.type === "label3d" || object.showAnnotationLabel ||
      Object.values(object.vertexAnnotations ?? {}).some((vertex) => vertex.label) ||
      object.edgeStyles?.some((edge) => edge.label || edge.measurement),
  );
  const labelLayer = showScreenLabels ? document.createElement("div") : null;
  if (labelLayer) {
    container.classList.add("three-scene-board");
    labelLayer.className = "three-scene-label-layer";
    labelLayer.setAttribute("aria-hidden", "true");
  }
  container.replaceChildren(
    renderer.domElement,
    ...(labelLayer ? [labelLayer] : []),
  );
  renderer.domElement.style.cssText =
    "display:block;width:100%;height:100%;outline:none";
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    "aria-label",
    spec.accessibility?.description || "Mô hình không gian 3D tương tác",
  );

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.fromArray(spec.camera.target);
  controls.minDistance = 2;
  controls.maxDistance = 40;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdce7e0, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(5, 8, 6);
  key.castShadow = true;
  scene.add(key);
  const grid = new THREE.GridHelper(12, 12, 0xd5e2d7, 0xe8eeea);
  grid.position.y = -2.3;
  scene.add(grid);

  const entries = new Map<string, Entry>();
  let surfaceFillVisible = spec.surfaceFill;
  let labelsVisible = true;
  const annotationVisibility: Record<string, boolean> = {
    structure: true,
    vertex: true,
    length: true,
    angle: true,
    face: true,
    helper: true,
  };
  const annotationVisible = (object: ThreeVisualObject) =>
    object.visible &&
    (object.type !== "label3d" || labelsVisible) &&
    (!object.annotationKind ||
      annotationVisibility[object.annotationKind] !== false);
  let frame = 0;
  let cameraSaveTimer = 0;
  let destroyed = false;
  let constructionPicker: ((hit: VertexHit | null) => void) | null = null;
  let constructionEdgesOnly = false;
  const snapMarker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: "#dd8b1e", depthTest: false }),
  );
  snapMarker.visible = false;
  snapMarker.renderOrder = 10;
  scene.add(snapMarker);
  function setConstructionPicker(picker: typeof constructionPicker, edgesOnly = false) {
    constructionPicker = picker;
    constructionEdgesOnly = edgesOnly;
    snapMarker.visible = false;
    renderer.domElement.style.cursor = picker ? "crosshair" : "";
    requestRender();
  }
  let selectionHighlight: THREE.Object3D | null = null;
  function setSelection(selection: VisualSelection | null) {
    if (selectionHighlight) {
      selectionHighlight.removeFromParent();
      disposeObject(selectionHighlight);
      selectionHighlight = null;
    }
    requestRender();
    if (!selection) return;
    const entry = entries.get(selection.id);
    if (!entry?.group.visible) return;
    if (selection.faceIndex !== undefined && entry.mesh) {
      const face = planarFace(entry.mesh.geometry, selection.faceIndex);
      if (!face) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(face.triangles.flatMap(triangle => triangle.flatMap(point => point.toArray())), 3));
      selectionHighlight = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color: "#f0b44d", transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}));
      entry.group.add(selectionHighlight);
    } else if (selection.edgeIndex !== undefined || selection.edgeKey) {
      const line = selection.edgeKey
        ? strokeParts(entry).find((part) => part.userData.edgeKey === selection.edgeKey)
        : strokeParts(entry)[selection.edgePart ?? 0];
      const positions = line?.geometry.getAttribute("position");
      if (!line?.visible || !positions) return;
      const first = selection.edgeKey ? 0 : selection.edgeIndex!;
      const end = selection.edgeKey ? positions.count : first + 2;
      if (end > positions.count) return;
      const points = Array.from({ length: end - first }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(positions, first + i),
      );
      selectionHighlight = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: "#da8117", depthTest: false }),
      );
      selectionHighlight.renderOrder = 9;
      line.add(selectionHighlight);
    } else if (selection.vertexIndex !== undefined) {
      const vertex = entry.group.children.find((child) =>
        child.userData.selectionKind === "vertex" && child.userData.vertexIndex === selection.vertexIndex,
      );
      if (!vertex?.visible) return;
      selectionHighlight = new THREE.Mesh(
        new THREE.SphereGeometry(worldUnitsPerPixel(vertex.getWorldPosition(new THREE.Vector3())) * 6, 12, 8),
        new THREE.MeshBasicMaterial({ color: "#da8117", depthTest: false }),
      );
      selectionHighlight.renderOrder = 9;
      vertex.add(selectionHighlight);
    } else {
      selectionHighlight = new THREE.BoxHelper(entry.group, "#cf9630");
      scene.add(selectionHighlight);
    }
  }

  function fitCameraToScene(force = false) {
    const bounds = new THREE.Box3();
    for (const entry of entries.values()) {
      if (entry.object.type === "slicePlane" || !entry.group.visible) continue;
      entry.group.updateMatrixWorld(true);
      bounds.expandByObject(entry.group);
    }
    if (bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const preciseCylinderScale = spec.source?.key === "cylinder-dimensions";
    const radius = Math.max(sphere.radius, preciseCylinderScale ? 1e-5 : 0.1);
    const direction = camera.position.clone().sub(controls.target).normalize();
    const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const halfHorizontalFov = Math.atan(
      Math.tan(halfVerticalFov) * Math.max(0.1, camera.aspect),
    );
    const labelPadding = showScreenLabels
      ? 1.28 + Math.max(0, 300 - container.clientHeight) / 300
      : 1.12;
    const distance =
      (radius / Math.sin(Math.min(halfVerticalFov, halfHorizontalFov))) *
      labelPadding;
    const currentDistance = camera.position.distanceTo(controls.target);
    if (force || currentDistance < distance) {
      controls.target.copy(sphere.center);
      camera.position
        .copy(sphere.center)
        .add(direction.multiplyScalar(distance));
    }
    controls.minDistance = Math.max(
      preciseCylinderScale ? 1e-5 : 0.08,
      radius * 0.08,
    );
    controls.maxDistance = Math.max(40, radius * 12);
    camera.near = Math.max(preciseCylinderScale ? 1e-7 : 0.001, radius / 1000);
    camera.far = Math.max(1000, radius * 100);
    camera.updateProjectionMatrix();
    controls.update();
  }

  function emit() {
    requestRender();
    if (!destroyed)
      onChange?.({
        visualId: spec.id,
        parameters: { ...values },
        objects: Object.fromEntries(
          [...entries].map(([id, entry]) => [
            id,
            { visible: entry.group.visible },
          ]),
        ),
      });
  }

  function refreshAnnotationLabels(entry: Entry) {
    entry.annotationLabels?.forEach(({ node }) => node.remove());
    entry.annotationLabels = [];
    if (!labelLayer) return;
    const add = (text: string, anchor: THREE.Object3D, point: THREE.Vector3, kind: "vertex" | "length") => {
      if (!text) return;
      const node = document.createElement("span");
      node.className = `three-scene-label three-scene-label-${kind}`;
      node.textContent = text;
      labelLayer.append(node);
      entry.annotationLabels!.push({ node, anchor, point, kind });
    };
    const lines = strokeParts(entry);
    for (const edge of entry.object.edgeStyles ?? []) {
      const caption = annotationCaption(edge);
      if (!caption || edge.hidden) continue;
      const line = edge.edgeKey ? lines.find((part) => part.userData.edgeKey === edge.edgeKey) : lines[edge.edgePart];
      const points = line?.geometry.getAttribute("position");
      const index = edge.edgeKey && points ? Math.floor(points.count / 4) : edge.edgeIndex;
      if (!line?.visible || !points || index + 1 >= points.count) continue;
      const point = new THREE.Vector3().fromBufferAttribute(points, index)
        .lerp(new THREE.Vector3().fromBufferAttribute(points, index + 1), 0.5);
      add(caption, line, point, "length");
    }
    for (const vertex of entry.group.children) {
      if (vertex.userData.selectionKind !== "vertex" || !vertex.visible) continue;
      const label = entry.object.vertexAnnotations?.[vertex.userData.vertexIndex]?.label;
      if (label) add(label, vertex, new THREE.Vector3(), "vertex");
    }
    if (entry.object.showAnnotationLabel) {
      const line = lines[0], points = line?.geometry.getAttribute("position");
      const center = points?.count ? new THREE.Vector3().fromBufferAttribute(points, 0)
        .lerp(new THREE.Vector3().fromBufferAttribute(points, points.count - 1), 0.5) : new THREE.Vector3();
      add(annotationCaption(entry.object), line || entry.group, center, entry.object.marker ? "vertex" : "length");
    }
  }
  function rebuild(entry: Entry) {
    disposeObject(entry.group);
    entry.group.clear();
    const { object } = entry;
    if (object.type === "label3d") {
      if (labelLayer) {
        entry.labelNode?.remove();
        entry.labelNode = undefined;
        entry.labelSize = undefined;
        const label = document.createElement("span");
        label.className = `three-scene-label three-scene-label-${object.annotationKind || "helper"}`;
        label.textContent = object.text || object.label || "";
        labelLayer.append(label);
        entry.labelNode = label;
        entry.mesh = undefined;
        entry.group.position.fromArray(object.position);
        return;
      }
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context) {
        const font = "600 28px sans-serif";
        context.font = font;
        canvas.width = Math.ceil(
          context.measureText(object.text || "").width + 24,
        );
        canvas.height = 48;
        context.font = font;
        context.fillStyle = object.color || color;
        context.fillText(object.text || "", 12, 33);
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
          }),
        );
        sprite.scale.set(canvas.width / 80, canvas.height / 80, 1);
        sprite.userData = { objectId: object.id, selectionKind: "label" };
        entry.group.add(sprite);
      }
      entry.mesh = undefined;
      entry.group.position.fromArray(object.position);
      return;
    }
    if (object.type === "curve3d") {
      const points = object.vertexEndpoints
        ? [new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]
        : curvePoints(object, values);
      if (points.length < 2)
        throw Error(
          `Đường cong ${object.label || object.id} không đủ điểm hợp lệ.`,
        );
      if (object.closed && points[0].distanceToSquared(points.at(-1)!) > 1e-12)
        points.push(points[0].clone());
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineOptions = {
        color: object.color || color,
        linewidth: 2,
        depthTest: !(spec.derivedFrom2d && object.id.startsWith("curve_")),
      };
      const material =
        object.lineStyle === "dashed"
          ? new THREE.LineDashedMaterial({
              ...lineOptions,
              dashSize: 0.2,
              gapSize: 0.13,
            })
          : new THREE.LineBasicMaterial(lineOptions);
      const line = object.segments
        ? new THREE.LineSegments(geometry, material)
        : new THREE.Line(geometry, material);
      if (object.lineStyle === "dashed") line.computeLineDistances();
      if (spec.derivedFrom2d && object.id.startsWith("curve_"))
        line.renderOrder = 4;
      line.userData = { objectId: object.id, selectionKind: "curve" };
      entry.group.add(line);
      if (object.faces3d?.length) {
        const palette = ["#80c7ad", "#f2b56d", "#89b5ec", "#d9a0d1"];
        const panelGeometry = polygonFacesGeometry(object.faces3d);
        const panel = new THREE.Mesh(panelGeometry, object.faces3d.map((_, i) =>
          new THREE.MeshBasicMaterial({ color: palette[i % palette.length], side: THREE.DoubleSide, transparent: true, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: 1 }),
        ));
        panel.visible = surfaceFillVisible;
        panel.userData = { objectId: object.id, selectionKind: "curve", netPanels: true };
        entry.group.add(panel);
        object.faces3d.forEach((face, index) => {
          const canvas = document.createElement("canvas");
          canvas.width = 64;
          canvas.height = 40;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.font = "bold 24px sans-serif";
          context.fillStyle = "#173c33";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(String(index + 1), 32, 20);
          const label = new THREE.Sprite(new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false,
          }));
          label.position.copy(face.reduce((center, p) => center.add(new THREE.Vector3(...p)), new THREE.Vector3()).divideScalar(face.length));
          label.scale.set(0.46, 0.29, 1);
          label.renderOrder = 4;
          label.visible = labelsVisible;
          label.userData.netLabel = true;
          entry.group.add(label);
        });
      }
      entry.mesh = undefined;
      entry.group.position.fromArray(object.position);
      entry.group.rotation.set(...object.rotation);
      applyStrokeAppearance(entry);
      refreshAnnotationLabels(entry);
      return;
    }
    const geometry = solidGeometry(object, values);
    const slice = object.type === "slicePlane";
    const teachingCylinder =
      spec.source?.key === "cylinder-dimensions" && object.type === "cylinder";
    const section = object.spatialConstruction?.tool === "section";
    const material = new THREE.MeshStandardMaterial({
      color: object.color || color,
      transparent: slice || object.type === "face3d" || teachingCylinder,
      opacity: slice
        ? 0.35
        : object.type === "face3d"
          ? section ? 0.58 : 0.2
          : teachingCylinder
            ? 0.22
            : 0.86,
      depthWrite: !teachingCylinder,
      side:
        slice || object.type === "face3d" ? THREE.DoubleSide : THREE.FrontSide,
      roughness: 0.48,
      metalness: 0.04,
    });
    if (object.type === "face3d") material.depthWrite = false;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = slice || surfaceFillVisible || object.marker;
    mesh.castShadow = !slice;
    mesh.receiveShadow = !slice;
    entry.mesh = mesh;
    mesh.userData = {
      objectId: object.id,
      selectionKind:
        object.type === "slicePlane"
          ? "slice"
          : object.type === "face3d"
            ? "face"
            : "surface",
    };
    entry.group.add(mesh);
    if (
      !slice &&
      !object.marker &&
      !(
        object.type === "face3d" &&
        [
          "tunnel-parabolic",
          "solve-right-pyramid",
          "solve-square-frustum",
        ].includes(spec.source?.key || "")
      )
    ) {
      const edgeGeometry = new THREE.EdgesGeometry(geometry);
      const smoothSolid = ["sphere", "cylinder", "cone"].includes(object.type);
      const wireGeometry =
        edgeGeometry.getAttribute("position")?.count || smoothSolid
          ? edgeGeometry
          : new THREE.WireframeGeometry(geometry);
      if (wireGeometry !== edgeGeometry) edgeGeometry.dispose();
      const wire = new THREE.LineSegments(
        wireGeometry,
        new THREE.LineBasicMaterial({
          color: "#174333",
          transparent: true,
          opacity: 0.58,
        }),
      );
      wire.userData = { objectId: object.id, selectionKind: "edge" };
      // Solve's reviewed cylinder supplies its own two generators and base
      // circles. Triangulation facets are not extra edges given by the problem.
      if (
        ["solve-cylinder-3d", "cylinder-dimensions"].includes(
          spec.source?.key || "",
        ) &&
        object.type === "cylinder"
      )
        wire.visible = false;
      entry.group.add(wire);
      // Smooth solids have no topological edges. Draw recognizable contours,
      // independent of the surface mesh, so wire-only mode never hides them.
      const bindings = object.parameterBindings || {};
      const size = bindings.size ? values[bindings.size] : object.size || 2;
      const radius = bindings.radius
        ? values[bindings.radius]
        : object.radius || size / 2;
      const height = bindings.height
        ? values[bindings.height]
        : object.height || size;
      const ring = (edgeKey: CircularEdgeKey) => {
        const points = Array.from(
          { length: 97 },
          (_, index) =>
            new THREE.Vector3(
              ...circularEdgePoint(edgeKey, index / 96, radius, height),
            ),
        );
        const contour = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: object.color || color,
            transparent: true,
            opacity: 0.9,
          }),
        );
        contour.userData = {
          objectId: object.id,
          selectionKind: "edge",
          edgeKey,
          radius,
          height,
        };
        entry.group.add(contour);
      };
      if (object.type === "sphere") {
        ring("great-y");
        ring("great-x");
        ring("great-z");
      } else if (object.type === "cylinder") {
        ring("top-ring");
        ring("bottom-ring");
      } else if (object.type === "cone") {
        ring("bottom-ring");
      }
      // Suppress duplicate circular chords without changing legacy buffer indices.
      if (smoothSolid) {
        const omitted = new Set<number>(),
          vertices = wireGeometry.getAttribute("position");
        for (let i = 0; i + 1 < vertices.count; i += 2) {
          const a = new THREE.Vector3().fromBufferAttribute(vertices, i),
            b = new THREE.Vector3().fromBufferAttribute(vertices, i + 1);
          if (
            (["solve-cylinder-3d", "cylinder-dimensions"].includes(
              spec.source?.key || "",
            ) &&
              object.type === "cylinder") ||
            object.type === "sphere" ||
            (Math.abs(a.y - b.y) < 1e-5 &&
              Math.abs(Math.abs(a.y) - height / 2) < 1e-5 &&
              Math.abs(Math.hypot(a.x, a.z) - radius) < 1e-5 &&
              Math.abs(Math.hypot(b.x, b.z) - radius) < 1e-5)
          )
            omitted.add(i);
        }
        wire.userData.omittedEdges = omitted;
      }
      const vertices = indexedSolidVertices(geometry, object.type);
      if (vertices.length <= 80) {
        const markerSize = object.parameterBindings?.size
          ? values[object.parameterBindings.size]
          : object.size || 2;
        const markerGeometry = new THREE.SphereGeometry(
          Math.max(markerSize * 0.022, 0.025),
          10,
          8,
        );
        for (const { index, point, selectable } of vertices) {
          const marker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: "#147b59", depthTest: true }),
          );
          marker.position.copy(point);
          // Cone tessellation points on the base are not mathematical vertices.
          // Retain their indices invisibly so legacy connection anchors still work.
          marker.visible = selectable;
          marker.userData = {
            objectId: object.id,
            selectionKind: "vertex",
            vertexIndex: index,
          };
          entry.group.add(marker);
        }
      }
    }
    entry.group.position.fromArray(object.position);
    entry.group.rotation.set(...object.rotation);
    const bindings = object.parameterBindings || {};
    if (bindings.positionX) entry.group.position.x = values[bindings.positionX];
    if (object.parameterBindings?.positionY)
      entry.group.position.y = values[object.parameterBindings.positionY];
    if (bindings.positionZ) entry.group.position.z = values[bindings.positionZ];
    if (bindings.rotationX) entry.group.rotation.x = values[bindings.rotationX];
    if (bindings.rotationY) entry.group.rotation.y = values[bindings.rotationY];
    if (bindings.rotationZ) entry.group.rotation.z = values[bindings.rotationZ];
    applyStrokeAppearance(entry);
    refreshAnnotationLabels(entry);
  }

  for (const object of spec.objects) {
    const entry: Entry = { group: new THREE.Group(), object };
    entries.set(object.id, entry);
    scene.add(entry.group);
    rebuild(entry);
    entry.group.visible = annotationVisible(object);
  }
  updateConnections();
  updateSections(entries);

  const raycaster = new THREE.Raycaster();
  function vertices(): VertexHit[] {
    scene.updateMatrixWorld(true);
    const result: VertexHit[] = [];
    for (const entry of entries.values()) {
      if (!entry.group.visible) continue;
      if (entry.object.marker) {
        const source = spec.derivedFrom2d?.source.objects.find(
          (o) => `point_${o.id}` === entry.object.id,
        );
        result.push({
          objectId: entry.object.id,
          label: source
            ? source.label || `Điểm ${result.length + 1}`
            : entry.object.label || `Điểm ${result.length + 1}`,
          position: entry.group
            .getWorldPosition(new THREE.Vector3())
            .toArray() as [number, number, number],
        });
      } else
        for (const child of entry.group.children) {
          if (child.userData.selectionKind !== "vertex" || !child.visible)
            continue;
          result.push({
            objectId: entry.object.id,
            vertexIndex: child.userData.vertexIndex,
            label: entry.object.vertexAnnotations?.[child.userData.vertexIndex]?.label ||
              `${entry.object.label || entry.object.id} · đỉnh ${Number(child.userData.vertexIndex) + 1}`,
            position: child.getWorldPosition(new THREE.Vector3()).toArray() as [
              number,
              number,
              number,
            ],
          });
        }
    }
    return result;
  }
  function pickVertexAt(clientX: number, clientY: number): VertexHit | null {
    const rect = renderer.domElement.getBoundingClientRect();
    camera.updateMatrixWorld();
    let nearest: VertexHit | null = null,
      nearestDepth = Infinity,
      threshold = 13;
    for (const vertex of vertices()) {
      const projected = new THREE.Vector3(...vertex.position).project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const distance = Math.hypot(
        clientX - rect.left - ((projected.x + 1) * rect.width) / 2,
        clientY - rect.top - ((1 - projected.y) * rect.height) / 2,
      );
      if (distance < threshold - 0.5 || (distance <= threshold && projected.z < nearestDepth)) {
        threshold = distance;
        nearestDepth = projected.z;
        nearest = vertex;
      }
    }
    return nearest;
  }
  function anchorLine(entry: Entry) {
    return entry.group.children.find(
      (child) =>
        child instanceof THREE.Line &&
        ["edge", "curve"].includes(child.userData.selectionKind) &&
        child.geometry.getAttribute("position")?.count > 1,
    ) as THREE.Line | undefined;
  }
  function pickConnectionPointAt(
    clientX: number,
    clientY: number,
    snap = true,
    edgesOnly = false,
  ): VertexHit | null {
    if (snap && !edgesOnly) {
      const vertex = pickVertexAt(clientX, clientY);
      if (vertex) return vertex;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((clientY - rect.top) / rect.height) * 2,
      ),
      camera,
    );
    let best: VertexHit | null = null,
      bestDepth = Infinity,
      threshold = 12;
    if (snap)
      for (const entry of entries.values()) {
        if (!entry.group.visible || entry.object.marker) continue;
        for (const [edgePart, line] of strokeParts(entry).entries()) {
          if (edgePart > 0 && !line.userData.edgeKey) continue;
          const positions = line.geometry.getAttribute("position");
          if (!line || !line.visible || !positions) continue;
          const step = line instanceof THREE.LineSegments ? 2 : 1;
          for (let i = 0; i + 1 < positions.count; i += step) {
            if (
              (line.userData.omittedEdges as Set<number> | undefined)?.has(i) ||
              entry.object.edgeStyles?.some(
                (s) =>
                  s.hidden &&
                  (line.userData.edgeKey
                    ? s.edgeKey === line.userData.edgeKey
                    : !s.edgeKey &&
                      s.edgePart === edgePart &&
                      s.edgeIndex === i),
              )
            )
              continue;
            const a = line.localToWorld(
              new THREE.Vector3().fromBufferAttribute(positions, i),
            );
            const b = line.localToWorld(
              new THREE.Vector3().fromBufferAttribute(positions, i + 1),
            );
            const direction = b.clone().sub(a),
              squared = direction.lengthSq();
            if (squared < 1e-12) continue;
            const onEdge = new THREE.Vector3();
            raycaster.ray.distanceSqToSegment(
              a,
              b,
              new THREE.Vector3(),
              onEdge,
            );
            const projected = onEdge.clone().project(camera);
            if (projected.z < -1 || projected.z > 1) continue;
            const distance = Math.hypot(
              clientX - rect.left - ((projected.x + 1) * rect.width) / 2,
              clientY - rect.top - ((1 - projected.y) * rect.height) / 2,
            );
            const score = distance - (line.userData.edgeKey ? 0.75 : 0);
            if (distance < 12 && (score < threshold - 0.35 || (score <= threshold + 0.35 && projected.z < bestDepth))) {
              threshold = score;
              bestDepth = projected.z;
              const ratio = Math.max(
                0,
                Math.min(1, onEdge.clone().sub(a).dot(direction) / squared),
              );
              const edgeKey = line.userData.edgeKey as
                CircularEdgeKey | undefined;
              if (edgeKey) {
                const turn = (i + ratio) / (positions.count - 1);
                const exact = line.localToWorld(
                  new THREE.Vector3(
                    ...circularEdgePoint(
                      edgeKey,
                      turn,
                      line.userData.radius,
                      line.userData.height,
                    ),
                  ),
                );
                best = {
                  objectId: entry.object.id,
                  edgeKey,
                  edgeRatio: turn,
                  label: "Điểm trên viền tròn",
                  position: exact.toArray() as [number, number, number],
                };
              } else
                best = {
                  objectId: entry.object.id,
                  edgeIndex: i,
                  edgeRatio: ratio,
                  label: "Điểm trên cạnh",
                  position: onEdge.toArray() as [number, number, number],
                };
            }
          }
        }
      }
    if (best || edgesOnly) return best;
    const planar = spec.derivedFrom2d?.mode === "planar";
    const normal = planar
      ? new THREE.Vector3(0, 1, 0)
      : camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      normal,
      planar ? new THREE.Vector3() : controls.target,
    );
    const position = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return position &&
      position.toArray().every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6)
      ? {
          objectId: "free",
          free: true,
          label: "Điểm tự do",
          position: position.toArray() as [number, number, number],
        }
      : null;
  }
  function resolveAnchor(anchor: NonNullable<ThreeVisualObject["vertexEndpoints"]>[number]): THREE.Vector3 | null {
    const parent = entries.get(anchor.objectId);
    if(!parent || parent.group.userData.constructionError) return null;
    if(anchor.edgeKey) {
      const ring = strokeParts(parent).find(line=>line.userData.edgeKey === anchor.edgeKey);
      return ring ? ring.localToWorld(new THREE.Vector3(...circularEdgePoint(anchor.edgeKey,anchor.edgeRatio ?? .5,ring.userData.radius,ring.userData.height))) : null;
    }
    if(anchor.edgeIndex !== undefined) {
      const line = anchorLine(parent), points=line?.geometry.getAttribute("position");
      if(!line || !points || anchor.edgeIndex+1>=points.count) return null;
      return line.localToWorld(new THREE.Vector3().fromBufferAttribute(points,anchor.edgeIndex)).lerp(line.localToWorld(new THREE.Vector3().fromBufferAttribute(points,anchor.edgeIndex+1)),anchor.edgeRatio ?? .5);
    }
    const marker=anchor.vertexIndex === undefined ? parent.group : parent.group.children.find(c=>c.userData.selectionKind === "vertex" && c.userData.vertexIndex === anchor.vertexIndex);
    return marker?.getWorldPosition(new THREE.Vector3()) || null;
  }
  function sectionAt(sourceId: string | undefined, points: XYZ[]) {
    const source = sourceId ? entries.get(sourceId) : undefined;
    if (!source?.mesh) throw Error("Chọn khối cần cắt trước khi dựng thiết diện.");
    if (hasConcaveBase(source)) throw Error("Chưa hỗ trợ thiết diện tổng quát cho khối đáy lõm.");
    return meshSectionPolygon(source.mesh, points);
  }
  let sectionPreview: THREE.Mesh | undefined;
  function setSectionPreview(points?: XYZ[], color = "#e58b34") {
    if (sectionPreview) {
      sectionPreview.removeFromParent();
      disposeObject(sectionPreview);
      sectionPreview = undefined;
    }
    if (points?.length) {
      sectionPreview = new THREE.Mesh(polygonFacesGeometry([points]), new THREE.MeshBasicMaterial({
        color, side: THREE.DoubleSide, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false,
      }));
      sectionPreview.renderOrder = 8;
      scene.add(sectionPreview);
    }
    requestRender();
  }
  function splitAt(sectionId: string) {
    const section = entries.get(sectionId)?.object.spatialConstruction;
    if (section?.tool !== "section" || !section.sourceId) throw Error("Chọn thiết diện đã dựng.");
    const points = section.inputs.map((input) => input.anchor ? resolveAnchor(input.anchor)?.toArray() : input.position);
    if (points.some((point) => !point)) throw Error("Thiết diện thiếu điểm nguồn.");
    return { sourceId: section.sourceId, parts: splitByPlane(section.sourceId, points as XYZ[]) };
  }
  function splitByPlane(sourceId: string, points: XYZ[]) {
    const source = entries.get(sourceId);
    if (!source?.mesh || !["box", "pyramid"].includes(source.object.type))
      throw Error("Tách khối hiện hỗ trợ hình hộp và hình chóp.");
    return splitConvexMesh(source.mesh, points);
  }
  function updateConnections() {
    scene.updateMatrixWorld(true);
    const completed = new Set<string>();
    const update = (entry: Entry) => {
      if (completed.has(entry.object.id)) return;
      completed.add(entry.object.id);
      if(entry.object.net){
        const definition=entry.object.net,source=entries.get(definition.sourceId);
        if(source)update(source);
        try{
          if(!source?.mesh || ["sphere","cylinder","cone"].includes(source.object.type))throw Error("Khai triển này dành cho khối đa diện, không dùng cho mặt cong.");
          const faces=polyhedronNet(source.mesh.geometry,values[definition.parameter]??0,definition.rootFace || 0);
          entry.group.userData.netWarning=(values[definition.parameter]??0)>=.999&&netHasOverlaps(faces)?"Bản khai triển đang chồng mặt. Chọn bản khai triển và đổi mặt gốc; chưa dùng để cắt/gấp giấy.":undefined;
          entry.object.faces3d = faces.map((face) => face.map((p) =>
            source.mesh!.localToWorld(p.clone()).add(new THREE.Vector3(6, 0, 0)).toArray() as XYZ));
          entry.object.points3d = entry.object.faces3d.flatMap((face) =>
            face.flatMap((p, i) => [p, face[(i + 1) % face.length]]));
          rebuild(entry);entry.group.visible=annotationVisible(entry.object);delete entry.group.userData.constructionError;
        }catch(error){entry.group.visible=false;entry.group.userData.constructionError=error instanceof Error?error.message:"Không khai triển được khối.";}
      }
      if (entry.object.spatialConstruction) {
        const definition = entry.object.spatialConstruction;
        definition.inputs.forEach(p => { const parent = p.anchor && entries.get(p.anchor.objectId); if(parent) update(parent); });
        const source = definition.sourceId ? entries.get(definition.sourceId) : undefined;
        if(source) update(source);
        try {
          const input = definition.inputs.map(p => p.anchor ? resolveAnchor(p.anchor) : new THREE.Vector3(...p.position));
          if(input.some(p=>!p)) throw Error("Nguồn của phép dựng không còn hợp lệ.");
          const result = constructSpatial(definition.tool, input.map(p=>p!.toArray() as XYZ));
          if(definition.tool==="flatten"&&source?.mesh){
            const local=definition.faceIndex!==undefined?planarFace(source.mesh.geometry,definition.faceIndex)?.triangles.flat():source.object.type==="face3d"?source.object.points3d?.map(p=>new THREE.Vector3(...p)):null;
            if(local){const points:THREE.Vector3[]=[];for(const p of local)if(!points.some(q=>q.distanceTo(p)<1e-7))points.push(p.clone());const world=points.map(p=>source.mesh!.localToWorld(p));const [a,b,c]=input as THREE.Vector3[],u=b.clone().sub(a).normalize(),n=new THREE.Vector3().crossVectors(u,c.clone().sub(a)).normalize(),v=n.clone().cross(u),center=world.reduce((s,p)=>s.add(p),new THREE.Vector3()).divideScalar(world.length);world.sort((p,q)=>Math.atan2(p.clone().sub(center).dot(v),p.clone().sub(center).dot(u))-Math.atan2(q.clone().sub(center).dot(v),q.clone().sub(center).dot(u)));result.points=flattenPolygon(world.map(p=>p.toArray() as XYZ),input.map(p=>p!.toArray() as XYZ));}
          }
          if (definition.tool === "section")
            result.points = sectionAt(definition.sourceId, input.map((p) => p!.toArray() as XYZ));
          if(result.point) entry.object.position = result.point;
          if(result.points) entry.object.points3d = result.points;
          if (result.radius && entry.object.type === "sphere") entry.object.radius = result.radius;
          if (definition.tool === "circumsphere" && entry.object.type === "label3d" && result.point && result.radius) {
            const format = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
            entry.object.text = `I(${result.point.map(format).join("; ")}) · R ≈ ${format(result.radius)}`;
          }
          if(result.value !== undefined && entry.object.type === "label3d") entry.object.text = `${entry.object.label || ""}: ${Number(result.value.toFixed(4))}${definition.tool.startsWith("angle") ? "°" : ""}`;
          rebuild(entry);
          entry.group.visible = annotationVisible(entry.object);
          delete entry.group.userData.constructionError;
          entry.group.updateWorldMatrix(true,true);
        } catch(error) {
          entry.group.visible = false;
          entry.group.userData.constructionError = error instanceof Error ? error.message : "Phép dựng suy biến";
        }
      }
      if (!entry.object.vertexEndpoints) return;
      const positions = entry.object.vertexEndpoints.map((anchor) => {
        const parent = entries.get(anchor.objectId);
        if (!parent) return null;
        update(parent);
        if (anchor.edgeKey) {
          const ring = strokeParts(parent).find(
            (line) => line.userData.edgeKey === anchor.edgeKey,
          );
          return ring
            ? ring.localToWorld(
                new THREE.Vector3(
                  ...circularEdgePoint(
                    anchor.edgeKey,
                    anchor.edgeRatio!,
                    ring.userData.radius,
                    ring.userData.height,
                  ),
                ),
              )
            : null;
        }
        if (anchor.edgeIndex !== undefined) {
          const line = anchorLine(parent),
            points = line?.geometry.getAttribute("position");
          if (!line || !points || anchor.edgeIndex + 1 >= points.count)
            return null;
          const a = line.localToWorld(
            new THREE.Vector3().fromBufferAttribute(points, anchor.edgeIndex),
          );
          const b = line.localToWorld(
            new THREE.Vector3().fromBufferAttribute(
              points,
              anchor.edgeIndex + 1,
            ),
          );
          return a.lerp(b, anchor.edgeRatio!);
        }
        const marker =
          anchor.vertexIndex === undefined
            ? parent.group
            : parent.group.children.find(
                (c) =>
                  c.userData.selectionKind === "vertex" &&
                  c.userData.vertexIndex === anchor.vertexIndex,
              );
        return marker?.getWorldPosition(new THREE.Vector3());
      });
      const line = entry.group.children.find((c) => c instanceof THREE.Line) as
        THREE.Line | undefined;
      if (!line) return;
      line.visible = positions.every(Boolean);
      if (!line.visible) return;
      line.geometry.dispose();
      const localPoints = (positions as THREE.Vector3[]).map((point) => line.worldToLocal(point.clone()));
      entry.object.points3d = localPoints.map((point) => point.toArray() as XYZ);
      line.geometry = new THREE.BufferGeometry().setFromPoints(localPoints);
      if (entry.object.lineStyle === "dashed") line.computeLineDistances();
      applyStrokeAppearance(entry);
      if (entry.object.showAnnotationLabel || entry.object.edgeStyles?.some((edge) => edge.label || edge.measurement))
        refreshAnnotationLabels(entry);
    };
    entries.forEach(update);
  }
  raycaster.params.Line = { threshold: 0.09 };
  function pickedEdge(
    entry: Entry,
    hit: THREE.Intersection,
  ): Pick<VisualSelection, "edgeIndex" | "edgePart" | "edgeKey"> {
    const line = hit.object;
    if (!(line instanceof THREE.Line)) return {};
    if (line.userData.edgeKey)
      return {
        edgeIndex: 0,
        edgePart: strokeParts(entry).indexOf(line),
        edgeKey: line.userData.edgeKey,
      };
    if (
      entry.object.type === "curve3d" &&
      (entry.object.vertexEndpoints || entry.object.points3d?.length === 2)
    )
      return {};
    const sourceObject = spec.derivedFrom2d?.source.objects.find(
      (o) => o.id === entry.object.id.replace(/^curve_/, ""),
    );
    // Sampled circles/functions are one curve, not hundreds of tiny user-facing edges.
    if (
      entry.object.type === "curve3d" &&
      !(
        sourceObject?.type === "polygon" ||
        entry.object.segments ||
        (!sourceObject &&
          (entry.object.points3d?.length || 0) > 2 &&
          (entry.object.points3d?.length || 0) < 33)
      )
    )
      return {};
    return hit.index === undefined
      ? {}
      : { edgeIndex: hit.index, edgePart: strokeParts(entry).indexOf(line) };
  }
  const visibleHit = (hit: THREE.Intersection) => {
    if (!hit.object.userData.objectId) return false;
    let object: THREE.Object3D | null = hit.object;
    while (object) {
      if (!object.visible) return false;
      object = object.parent;
    }
    const entry = entries.get(String(hit.object.userData.objectId));
    if (entry && hit.object instanceof THREE.Line) {
      const edge = pickedEdge(entry, hit);
      if (
        edge.edgeIndex !== undefined &&
        ((hit.object.userData.omittedEdges as Set<number> | undefined)?.has(
          edge.edgeIndex,
        ) ||
          entry.object.edgeStyles?.some(
            (s) =>
              s.hidden &&
              (edge.edgeKey
                ? s.edgeKey === edge.edgeKey
                : !s.edgeKey &&
                  s.edgePart === edge.edgePart &&
                  s.edgeIndex === edge.edgeIndex),
          ))
      )
        return false;
    }
    return true;
  };
  function selectionInfo(selection: VisualSelection): VisualSelection | null {
    const entry = entries.get(selection.id);
    if (!entry || !entry.group.visible) return null;
    entry.group.updateWorldMatrix(true, true);
    const n = (value: number) =>
      value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
    const label = entry.object.label || entry.object.id;
    if (entry.object.marker) {
      const p = entry.group.getWorldPosition(new THREE.Vector3());
      return {
        ...selection, label, type: "point", kind: "Điểm 3D",
        details: [`Tọa độ: (${n(p.x)}; ${n(p.y)}; ${n(p.z)})`],
      };
    }
    let details = objectMeasurements(entry, values),
      suffix = "";
    if (selection.vertexIndex !== undefined) {
      const vertex = entry.group.children.find(
        (child) =>
          child.userData.selectionKind === "vertex" &&
          child.userData.vertexIndex === selection.vertexIndex,
      );
      if (!vertex || !vertex.visible) return null;
      const p = vertex.getWorldPosition(new THREE.Vector3());
      suffix = ` · đỉnh ${selection.vertexIndex + 1}`;
      details = [`Tọa độ: (${n(p.x)}; ${n(p.y)}; ${n(p.z)})`];
    } else if (selection.edgeIndex !== undefined) {
      const line = selection.edgeKey
        ? strokeParts(entry).find(
            (l) => l.userData.edgeKey === selection.edgeKey,
          )
        : strokeParts(entry)[selection.edgePart || 0];
      if (!line || !line.visible) return null;
      const style = entry.object.edgeStyles?.find((s) =>
        selection.edgeKey
          ? s.edgeKey === selection.edgeKey
          : !s.edgeKey &&
            s.edgePart === (selection.edgePart || 0) &&
            s.edgeIndex === selection.edgeIndex,
      );
      if (style?.hidden) return null;
      if (selection.edgeKey) {
        const names: Record<CircularEdgeKey, string> = {
          "top-ring": "Viền đáy trên",
          "bottom-ring": "Viền đáy dưới",
          "great-x": "Đường tròn lớn Oyz",
          "great-y": "Đường tròn lớn Oxz",
          "great-z": "Đường tròn lớn Oxy",
        };
        const radius = Number(line.userData.radius);
        suffix = ` · ${names[selection.edgeKey]}`;
        details = [
          `Bán kính r = ${n(radius)}`,
          `Đường kính = ${n(2 * radius)}`,
          `Chu vi = ${n(2 * Math.PI * radius)}`,
          ...details,
        ];
      } else {
        const points = line.geometry.getAttribute("position"),
          i = selection.edgeIndex;
        if (
          i + 1 >= points.count ||
          (line.userData.omittedEdges as Set<number> | undefined)?.has(i)
        )
          return null;
        const a = line.localToWorld(
            new THREE.Vector3().fromBufferAttribute(points, i),
          ),
          b = line.localToWorld(
            new THREE.Vector3().fromBufferAttribute(points, i + 1),
          );
        suffix = ` · cạnh ${i + 1}`;
        details = [`Độ dài cạnh = ${n(a.distanceTo(b))}`, ...details];
      }
    } else if (selection.faceIndex !== undefined && entry.mesh) {
      const face = planarFace(entry.mesh.geometry, selection.faceIndex);
      if (!face) return null;
      let area = 0;
      for (const triangle of face.triangles) {
        const [a, b, c] = triangle.map(p => entry.mesh!.localToWorld(p.clone()));
        area += new THREE.Triangle(a, b, c).getArea();
      }
      suffix = " · mặt phẳng";
      details = [`Diện tích mặt ≈ ${n(area)}`, "Mặt gồm các tam giác đồng phẳng của khối."];
    } else if (selection.type === "section") {
      const mesh = entry.group
        .getObjectByName("computed-section")
        ?.children.find((child) => child instanceof THREE.Mesh) as
        THREE.Mesh | undefined;
      if (!mesh) return null;
      const positions = mesh.geometry.getAttribute("position"),
        indices = mesh.geometry.getIndex();
      const point = (i: number) =>
        mesh.localToWorld(
          new THREE.Vector3().fromBufferAttribute(
            positions,
            indices ? indices.getX(i) : i,
          ),
        );
      let area = 0;
      for (let i = 0; i + 2 < (indices?.count || positions.count); i += 3)
        area += new THREE.Triangle(
          point(i),
          point(i + 1),
          point(i + 2),
        ).getArea();
      details = [
        `Diện tích thiết diện ≈ ${n(area)}`,
        `Mặt phẳng điều khiển: ${label}`,
      ];
    } else if (entry.object.type === "curve3d") {
      const line = anchorLine(entry),
        points = line?.geometry.getAttribute("position");
      if (line && points) {
        let length = 0;
        for (
          let i = 0;
          i + 1 < points.count;
          i += line instanceof THREE.LineSegments ? 2 : 1
        )
          length += line
            .localToWorld(new THREE.Vector3().fromBufferAttribute(points, i))
            .distanceTo(
              line.localToWorld(
                new THREE.Vector3().fromBufferAttribute(points, i + 1),
              ),
            );
        details = [`Độ dài đường ≈ ${n(length)}`];
      }
    }
    const annotation = selectedAnnotation(entry.object, selection);
    return { ...selection, label: ((selection.edgeIndex !== undefined || selection.vertexIndex !== undefined) && annotation.label) || label + suffix, details };
  }
  function pickObjectAt(
    clientX: number,
    clientY: number,
  ): VisualSelection | null {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    raycaster.params.Line = { threshold: 6 * worldUnitsPerPixel(controls.target) };
    const intersections = raycaster.intersectObjects([...scene.children], true);
    const hits = intersections.filter(visibleHit);
    if (!hits.length) {
      const point = pickVertexAt(clientX, clientY);
      if (point) return selectionInfo({
        id: point.objectId, type: "vertex", label: point.label,
        vertexIndex: point.vertexIndex, parents: [], editable: false,
      });
      if (!surfaceFillVisible) {
        for (const hit of intersections) {
          const id = String(hit.object.userData.objectId);
          const entry = entries.get(id);
          if (!entry?.group.visible || entry.mesh !== hit.object || entry.mesh.visible) continue;
          const whole = wholeSolidSelection(spec, { id, label: id, type: entry.object.type, parents: [], editable: false });
          if (whole) return selectionInfo(whole);
        }
      }
      return null;
    }
    const nearest = hits[0].distance;
    const priority: Record<string, number> = {
      vertex: 4,
      edge: 3,
      curve: 3,
      section: 3,
      slice: 2,
      surface: 1,
    };
    const hit = hits
      .filter(
        (item) => item.distance <= nearest + Math.max(0.12, nearest * 0.004),
      )
      .sort(
        (a, b) =>
          (priority[String(b.object.userData.selectionKind)] || 0) +
          (b.object.userData.edgeKey ? 0.5 : 0) -
          ((priority[String(a.object.userData.selectionKind)] || 0) +
            (a.object.userData.edgeKey ? 0.5 : 0)),
      )[0];
    const id = String(hit.object.userData.objectId),
      entry = entries.get(id);
    if (!entry) return null;
    const edge = pickedEdge(entry, hit);
    const kind = String(hit.object.userData.selectionKind);
    return selectionInfo({
      id,
      label: entry.object.label || id,
      type: kind === "surface" && !["sphere", "cylinder", "cone"].includes(entry.object.type) ? "face" : ["edge", "vertex", "section", "face"].includes(kind)
        ? kind
        : entry.object.type,
      ...edge,
      ...(kind === "surface" && hit.faceIndex != null && !["sphere", "cylinder", "cone"].includes(entry.object.type)
        ? { faceIndex: hit.faceIndex } : {}),
      ...(kind === "vertex"
        ? { vertexIndex: hit.object.userData.vertexIndex }
        : {}),
      parents: [],
      editable: false,
      kind:
        kind === "vertex"
          ? "Đỉnh của khối 3D"
          : edge.edgeKey
            ? "Viền tròn của khối 3D"
            : kind === "edge"
              ? "Cạnh của khối 3D"
              : kind === "section"
                ? "Thiết diện 3D"
                : entry.object.type === "curve3d"
                  ? "Đường cong 3D"
                  : "Đối tượng 3D",
    });
  }
  function objectsInScreenRect(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): VisualSelection[] {
    const selectionRight = rect.x + rect.width,
      selectionBottom = rect.y + rect.height;
    const area = Math.max(1, rect.width * rect.height);
    const canvasRect = renderer.domElement.getBoundingClientRect();
    return [...entries.values()]
      .filter((entry) => {
        if (!entry.group.visible) return false;
        entry.group.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(entry.group);
        if (bounds.isEmpty()) return false;
        const points: THREE.Vector2[] = [];
        for (const x of [bounds.min.x, bounds.max.x])
          for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z]) {
              const projected = new THREE.Vector3(x, y, z).project(camera);
              if (projected.z >= -1 && projected.z <= 1)
                points.push(
                  new THREE.Vector2(
                    canvasRect.left +
                      ((projected.x + 1) * canvasRect.width) / 2,
                    canvasRect.top +
                      ((1 - projected.y) * canvasRect.height) / 2,
                  ),
                );
            }
        if (!points.length) return false;
        const left = Math.min(...points.map((point) => point.x)),
          right = Math.max(...points.map((point) => point.x));
        const top = Math.min(...points.map((point) => point.y)),
          bottom = Math.max(...points.map((point) => point.y));
        const overlap =
          Math.max(
            0,
            Math.min(selectionRight, right) - Math.max(rect.x, left),
          ) *
          Math.max(
            0,
            Math.min(selectionBottom, bottom) - Math.max(rect.y, top),
          );
        const objectArea = Math.max(1, (right - left) * (bottom - top));
        return (
          overlap / Math.min(area, objectArea) >= 0.18 ||
          ((left + right) / 2 >= rect.x &&
            (left + right) / 2 <= selectionRight &&
            (top + bottom) / 2 >= rect.y &&
            (top + bottom) / 2 <= selectionBottom)
        );
      })
      .map((entry) => ({
        id: entry.object.id,
        label: entry.object.label || entry.object.id,
        type: entry.object.type,
        parents: [],
        editable: false,
        kind: "Đối tượng 3D",
      }));
  }
  function worldUnitsPerPixel(point: THREE.Vector3) {
    const depth = Math.abs(point.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())));
    return 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth / Math.max(1, renderer.domElement.clientHeight);
  }
  const pointerStarts = new Map<number, THREE.Vector2>();
  let gesture = false;
  let objectDragging = false;
  let apexDragging = false;
  let drag: {
    pointerId: number; entry: Entry; plane: THREE.Plane; start: THREE.Vector3;
    origin: THREE.Vector3; apex?: { offset?: XYZ; height: number };
  } | null = null;
  function dragIntersection(event: PointerEvent, plane: THREE.Plane) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    camera.updateMatrixWorld();
    raycaster.setFromCamera(new THREE.Vector2(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2,
    ), camera);
    return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }
  function finishDrag(commit: boolean) {
    if (!drag) return;
    const { entry, pointerId, origin, apex } = drag;
    drag = null;
    if (!commit) {
      if (apex) {
        entry.object.apexOffset = apex.offset;
        rebuild(entry);
      } else {
        entry.group.position.copy(origin);
        entry.object.position = origin.toArray() as XYZ;
      }
      updateConnections();
      updateSections(entries);
    }
    if (renderer.domElement.hasPointerCapture(pointerId)) renderer.domElement.releasePointerCapture(pointerId);
    renderer.domElement.style.cursor = objectDragging ? "move" : "";
    emit();
  }
  function setObjectDragging(active: boolean, apex = false) {
    objectDragging = active;
    apexDragging = apex;
    if (!active) finishDrag(false);
    if (!constructionPicker) renderer.domElement.style.cursor = active ? "move" : "";
  }
  let hoverPoint: THREE.Vector2 | null = null;
  let hoverFrame = 0;
  function updateSnap() {
    hoverFrame = 0;
    const hit = constructionPicker && hoverPoint && pickConnectionPointAt(hoverPoint.x, hoverPoint.y, true, constructionEdgesOnly);
    snapMarker.visible = Boolean(hit && !hit.free);
    requestRender();
    if (!hit || hit.free) return;
    snapMarker.position.fromArray(hit.position);
    snapMarker.scale.setScalar(worldUnitsPerPixel(snapMarker.position) * 5.5);
  }
  const onPointerDown = (event: PointerEvent) => {
    if (objectDragging && !constructionPicker && event.isPrimary && event.button === 0) {
      const hit = apexDragging ? pickVertexAt(event.clientX, event.clientY) : null;
      const selection = apexDragging ? null : pickObjectAt(event.clientX, event.clientY);
      const entry = entries.get(hit?.objectId ?? selection?.id ?? "");
      const height = entry?.object.height ?? entry?.object.size ?? 2;
      const apex = entry?.object.type === "pyramid" && !entry.object.parameterBindings?.height
        ? new THREE.Vector3(...(entry.object.apexOffset ?? [0, 0, 0])).add(new THREE.Vector3(0, height / 2, 0))
        : null;
      const pickedApex = entry && hit && apex &&
        entry.group.localToWorld(apex.clone()).distanceTo(new THREE.Vector3(...hit.position)) < Math.max(1e-6, height * 1e-6);
      if (entry?.mesh && (apexDragging ? pickedApex : entry.object.userCreated && !entry.object.spatialConstruction &&
        !["face3d", "slicePlane"].includes(entry.object.type) &&
        !Object.keys(entry.object.parameterBindings ?? {}).some((key) => key.startsWith("position")))) {
        const origin = apexDragging ? new THREE.Vector3(...hit!.position) : entry.group.position.clone();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), origin);
        const start = dragIntersection(event, plane);
        if (start) {
          drag = { pointerId: event.pointerId, entry, plane, start, origin, ...(apexDragging && {
            apex: { offset: entry.object.apexOffset, height },
          }) };
          renderer.domElement.setPointerCapture(event.pointerId);
          renderer.domElement.style.cursor = "grabbing";
          event.stopImmediatePropagation();
          return;
        }
      }
    }
    if (!pointerStarts.size) gesture = event.button !== 0;
    else gesture = true;
    pointerStarts.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    hoverPoint = null;
    snapMarker.visible = false;
    requestRender();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) {
      const position = dragIntersection(event, drag.plane)?.sub(drag.start).add(drag.origin);
      if (position && position.toArray().every((value) => Number.isFinite(value) && Math.abs(value) <= 1e6)) {
        if (drag.apex) {
          const local = drag.entry.group.worldToLocal(position);
          local.y = Math.max(-drag.apex.height * 0.95, local.y - drag.apex.height / 2);
          if (local.toArray().some((value) => Math.abs(value) > 1e4)) return;
          drag.entry.object.apexOffset = local.toArray() as XYZ;
          rebuild(drag.entry);
        } else {
          drag.entry.group.position.copy(position);
          drag.entry.object.position = position.toArray() as XYZ;
        }
        updateConnections();
        updateSections(entries);
        requestRender();
      }
      return;
    }
    const start = pointerStarts.get(event.pointerId);
    if (start) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) gesture = true;
      return;
    }
    if (constructionPicker && event.pointerType !== "touch") {
      hoverPoint = new THREE.Vector2(event.clientX, event.clientY);
      if (!hoverFrame) hoverFrame = requestAnimationFrame(updateSnap);
    }
  };
  const onPointerUp = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) {
      finishDrag(true);
      return;
    }
    const start = pointerStarts.get(event.pointerId);
    pointerStarts.delete(event.pointerId);
    if (!start || gesture || event.button !== 0 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    if (constructionPicker) {
      constructionPicker(pickConnectionPointAt(event.clientX, event.clientY, true, constructionEdgesOnly));
      return;
    }
    const selected = pickObjectAt(event.clientX, event.clientY);
    if (selected) onSelect?.(selected);
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) finishDrag(false);
    pointerStarts.delete(event.pointerId);
    gesture = true;
  };
  const onPointerLeave = () => {
    hoverPoint = null;
    snapMarker.visible = false;
    requestRender();
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerCancel);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);

  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    for (const entry of entries.values()) {
      entry.labelSize = undefined;
      entry.annotationLabels?.forEach((label) => { label.size = undefined; });
    }
    fitCameraToScene(!hasFitted || showScreenLabels);
    hasFitted = true;
    requestRender();
  }
  let hasFitted = false;
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  function requestRender() {
    if (!destroyed && !frame) frame = requestAnimationFrame(render);
  }
  function onCameraChange() {
    requestRender();
    window.clearTimeout(cameraSaveTimer);
    cameraSaveTimer = window.setTimeout(emit, 120);
  }
  function render() {
    frame = 0;
    if (destroyed) return;
    controls.update();
    if (selectionHighlight instanceof THREE.BoxHelper) selectionHighlight.update();
    renderer.render(scene, camera);
    if (labelLayer) {
      const width = renderer.domElement.clientWidth,
        height = renderer.domElement.clientHeight;
      const occupied: Array<{
        left: number;
        top: number;
        right: number;
        bottom: number;
      }> = [];
      const offsets: Array<[number, number]> = [
        [0, 0],
        [0, -27],
        [27, 0],
        [-27, 0],
        [0, 27],
        [27, -27],
        [-27, -27],
        [27, 27],
        [-27, 27],
        [42, 0],
        [-42, 0],
      ];
      for (const entry of entries.values()) {
        const labels = [
          ...(entry.labelNode ? [{ node: entry.labelNode, anchor: entry.group, point: new THREE.Vector3(), size: entry.labelSize, kind: undefined }] : []),
          ...(entry.annotationLabels ?? []),
        ];
        for (const item of labels) {
        const label = item.node;
        if (!entry.group.visible || !width || !height ||
            (item.kind && (!labelsVisible || !annotationVisibility[item.kind] || !item.anchor.visible))) {
          label.style.display = "none";
          continue;
        }
        const projected = item.anchor.localToWorld(item.point.clone()).project(camera);
        const x = ((projected.x + 1) * width) / 2;
        const y = ((1 - projected.y) * height) / 2;
        const withinFrame =
          projected.z >= -1 &&
          projected.z <= 1 &&
          x >= 0 &&
          x <= width &&
          y >= 0 &&
          y <= height;
        label.style.display = withinFrame ? "" : "none";
        if (!withinFrame) continue;
        if (!item.size)
          item.size = {
            width: label.offsetWidth,
            height: label.offsetHeight,
          };
        const size = item.size;
        if (!item.kind) entry.labelSize = size;
        const boxAt = (dx: number, dy: number) => ({
          left: x + dx - size.width / 2 - 3,
          top: y + dy - size.height / 2 - 3,
          right: x + dx + size.width / 2 + 3,
          bottom: y + dy + size.height / 2 + 3,
        });
        const fits = (box: ReturnType<typeof boxAt>) =>
          box.left >= 5 &&
          box.top >= 5 &&
          box.right <= width - 5 &&
          box.bottom <= height - 5;
        const candidate =
          offsets.find(([dx, dy]) => {
            const box = boxAt(dx, dy);
            return (
              fits(box) &&
              occupied.every(
                (used) =>
                  box.right <= used.left ||
                  box.left >= used.right ||
                  box.bottom <= used.top ||
                  box.top >= used.bottom,
              )
            );
          }) ||
          offsets.find(([dx, dy]) => fits(boxAt(dx, dy))) ||
          offsets[0];
        const labelX = x + candidate[0],
          labelY = y + candidate[1];
        label.style.left = `${labelX}px`;
        label.style.top = `${labelY}px`;
        occupied.push({
          left: labelX - size.width / 2 - 3,
          top: labelY - size.height / 2 - 3,
          right: labelX + size.width / 2 + 3,
          bottom: labelY + size.height / 2 + 3,
        });
        }
      }
    }
  }
  controls.addEventListener("change", onCameraChange);
  requestRender();

  function stop() {
    // Orbit damping schedules its own frames through the change event.
    if (animation) cancelAnimationFrame(animation);
    animation = 0;
  }
  let animation = 0;

  function replaceSceneObjects(objects: ThreeVisualObject[]) {
    if (spec.construction)
      for (const object of objects) {
        const old = entries.get(object.id)?.object;
        if (old)
          Object.assign(object, {
            strokeWidth: old.strokeWidth,
            edgeStyles: old.edgeStyles,
            ...(old.type === "curve3d" ? { color: old.color } : {}),
          });
      }
    const ids = new Set(objects.map((o) => o.id));
    const connections = spec.objects.filter(
      (o) =>
        o.vertexEndpoints &&
        !ids.has(o.id) &&
        o.vertexEndpoints.every((a) => ids.has(a.objectId)),
    );
    const additions = spec.objects.filter(o=>(o.spatialConstruction || o.userCreated || o.net) && !ids.has(o.id));
    objects = [...objects, ...connections, ...additions];
    const previousVisibility = new Map(
      [...entries].map(([key, entry]) => [key, entry.group.visible]),
    );
    entries.forEach((entry) => {
      entry.labelNode?.remove();
      entry.annotationLabels?.forEach(({ node }) => node.remove());
      scene.remove(entry.group);
      disposeObject(entry.group);
    });
    entries.clear();
    spec.objects = objects;
    for (const object of objects) {
      const entry: Entry = { group: new THREE.Group(), object };
      entries.set(object.id, entry);
      scene.add(entry.group);
      rebuild(entry);
      entry.group.visible =
        object.type === "label3d"
          ? annotationVisible(object)
          : (previousVisibility.get(object.id) ?? annotationVisible(object));
    }
  }

  function setParameter(id: string, value: number) {
    const parameter = spec.parameters.find((item) => item.id === id);
    if (!parameter || !Number.isFinite(value)) return;
    const previousValue = values[id];
    let nextValue = Math.min(parameter.max, Math.max(parameter.min, value));
    if (
      spec.construction?.kind === "tetrahedron-problem" &&
      !spec.construction.rightAtD
    ) {
      const tan = Math.tan(
        (spec.construction.lineAngleDegrees * Math.PI) / 180,
      );
      if (id === "side_bc")
        nextValue = Math.max(nextValue, (values.side_cd / tan) * 1.02);
      if (id === "side_cd")
        nextValue = Math.min(nextValue, values.side_bc * tan * 0.98);
      nextValue = Math.min(parameter.max, Math.max(parameter.min, nextValue));
    }
    values[id] = nextValue;
    if (spec.construction?.kind === "tetrahedron-problem") {
      try {
        const updated = buildConstrainedTetrahedron(spec.construction.prompt, {
          BC: values.side_bc,
          CD: values.side_cd,
        });
        if (updated.visual.dimension === "3d")
          replaceSceneObjects(updated.visual.objects);
      } catch {
        values[id] = previousValue;
        emit();
        return;
      }
    } else if (spec.cubeConstruction && id === "size") {
      replaceSceneObjects(
        resizeCubeObjects(spec.objects, previousValue, nextValue),
      );
    } else if (
      spec.derivedFrom2d &&
      (spec.derivedFrom2d.source.parameters.some((item) => item.id === id) ||
        spec.derivedFrom2d.radiusLinks?.some((link) => link.parameterId === id))
    ) {
      try {
        const updated = rebuildSketch3d({
          ...spec,
          parameters: spec.parameters.map((p) => ({
            ...p,
            value: values[p.id],
          })),
        });
        spec.derivedFrom2d = updated.derivedFrom2d;
        spec.parameters = updated.parameters;
        updated.parameters.forEach((p) => {
          values[p.id] = p.value;
        });
        replaceSceneObjects(updated.objects);
      } catch {
        // Invalid changes must not corrupt the construction or its planar outline.
        values[id] = previousValue;
        emit();
        return;
      }
    } else
      entries.forEach((entry) => {
        if (
          (entry.object.type === "curve3d" && entry.object.expression) ||
          Object.values(entry.object.parameterBindings || {}).includes(id)
        )
          rebuild(entry);
      });
    updateConnections();
    updateSections(entries);
    fitCameraToScene();
    emit();
  }

  function setSurfaceFillVisible(visible: boolean) {
    surfaceFillVisible = visible;
    spec.surfaceFill = visible;
    if (spec.derivedFrom2d) spec.derivedFrom2d.source.surfaceFill = visible;
    for (const entry of entries.values())
      if (entry.mesh && entry.object.type !== "slicePlane")
        entry.mesh.visible = visible || entry.object.marker;
    for (const entry of entries.values())
      for (const child of entry.group.children)
        if (child.userData.netPanels) child.visible = visible;
    requestRender();
  }

  function setAnnotationVisibility(kind: string, visible: boolean) {
    if (!(kind in annotationVisibility)) return;
    annotationVisibility[kind] = visible;
    for (const entry of entries.values()) {
      if (entry.object.annotationKind === kind)
        entry.group.visible = annotationVisible(entry.object);
    }
    updateSections(entries);
    emit();
  }

  function setLabelsVisible(visible: boolean) {
    labelsVisible = visible;
    for (const entry of entries.values())
      if (entry.object.type === "label3d")
        entry.group.visible = annotationVisible(entry.object);
    for (const entry of entries.values())
      for (const child of entry.group.children)
        if (child.userData.netLabel) child.visible = visible;
    emit();
  }

  function reset() {
    stop();
    const previousSize = values.size;
    spec.parameters.forEach(
      (parameter) => (values[parameter.id] = parameter.value),
    );
    if (spec.cubeConstruction) {
      replaceSceneObjects(
        resizeCubeObjects(spec.objects, previousSize, values.size),
      );
    } else if (spec.construction?.kind === "tetrahedron-problem") {
      const updated = buildConstrainedTetrahedron(spec.construction.prompt, {
        BC: values.side_bc,
        CD: values.side_cd,
      });
      if (updated.visual.dimension === "3d")
        replaceSceneObjects(updated.visual.objects);
    }
    entries.forEach((entry) => {
      rebuild(entry);
      entry.group.visible = annotationVisible(entry.object);
      if (entry.mesh)
        entry.mesh.material.color.set(entry.object.color || color);
    });
    updateConnections();
    updateSections(entries);
    camera.position.fromArray(spec.camera.position);
    controls.target.fromArray(spec.camera.target);
    fitCameraToScene(true);
    emit();
  }

  function zoom(factor: number) {
    const offset = camera.position.clone().sub(controls.target);
    const distance = THREE.MathUtils.clamp(
      offset.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    );
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
    emit();
  }

  function actions(actions: VisualAction[]) {
    validateActions(actions, spec);
    stop();
    for (const action of actions) {
      if (action.type === "reset") {
        reset();
        continue;
      }
      if (action.type === "setParameter") {
        setParameter(action.parameter, action.value);
        continue;
      }
      if (action.type === "animateParameter") {
        let started = performance.now();
        const tick = (now: number) => {
          const elapsed = Math.min(1, (now - started) / action.durationMs);
          setParameter(
            action.parameter,
            action.from + (action.to - action.from) * elapsed,
          );
          if (elapsed < 1 || action.loop) {
            if (elapsed === 1) started = now;
            animation = requestAnimationFrame(tick);
          }
        };
        animation = requestAnimationFrame(tick);
        continue;
      }
      for (const target of action.targets) {
        const entry = entries.get(target);
        if (!entry) continue;
        if (action.type === "show" || action.type === "hide") {
          entry.group.visible = action.type === "show";
          continue;
        }
        if (entry.mesh) entry.mesh.material.color.set("#e89a3c");
        if (action.type === "focus") {
          controls.target.copy(entry.group.position);
          controls.update();
        }
      }
    }
    emit();
  }

  emit();
  return ({
    state: () => ({
      visualId: spec.id,
      parameters: { ...values },
      objects: Object.fromEntries(
        [...entries].map(([id, entry]) => [
          id,
          { visible: entry.group.visible },
        ]),
      ),
    }),
    setParameter,
    zoomIn: () => zoom(0.8),
    zoomOut: () => zoom(1.25),
    fitView: () => {
      fitCameraToScene(true);
      emit();
    },
    setSurfaceFillVisible,
    setAnnotationVisibility,
    setLabelsVisible,
    setBoardBackgroundVisible(visible: boolean) {
      scene.background = visible ? boardBackground : null;
      grid.visible = visible;
      renderer.render(scene, camera);
    },
    pickObjectAt,
    selectionInfo,
    setSelection,
    pickVertexAt,
    pickConnectionPointAt,
    setConstructionPicker,
    setObjectDragging,
    vertices,
    constructionErrors: () => [...entries.values()].filter(e=>e.group.userData.constructionError).map(e=>({id:e.object.id,message:String(e.group.userData.constructionError)})),
    constructionWarnings: () => [...entries.values()].filter(e=>e.group.userData.netWarning || e.group.userData.sectionWarning).map(e=>({id:e.object.id,message:String(e.group.userData.netWarning || e.group.userData.sectionWarning)})),
    resolveSpatialInputs: (inputs: NonNullable<ThreeVisualObject["spatialConstruction"]>["inputs"]) => inputs.map(p => (p.anchor ? resolveAnchor(p.anchor)?.toArray() : p.position) as XYZ | undefined),
    sectionAt,
    setSectionPreview,
    splitAt,
    splitByPlane,
    objectsInScreenRect,
    actions,
    reset,
    stop,
    snapshot: () => {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
    },
    serialized: () => {
      const copy = structuredClone(spec);
      copy.parameters.forEach(
        (parameter) => (parameter.value = values[parameter.id]),
      );
      copy.camera = {
        position: camera.position.toArray() as [number, number, number],
        target: controls.target.toArray() as [number, number, number],
      };
      return copy;
    },
    destroy() {
      if (destroyed) return;
      setSelection(null);
      setSectionPreview();
      destroyed = true;
      stop();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(hoverFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      window.clearTimeout(cameraSaveTimer);
      controls.removeEventListener("change", onCameraChange);
      controls.dispose();
      entries.forEach((entry) => disposeObject(entry.group));
      disposeObject(snapMarker);
      renderer.dispose();
      container.replaceChildren();
      container.classList.remove("three-scene-board");
    },
  } satisfies VisualCorePort & SelectionPort & StatePort & Record<string,unknown>);
}

export type ThreeVisualRuntime = ReturnType<typeof createThreeRuntime>;
