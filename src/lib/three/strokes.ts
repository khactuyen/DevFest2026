import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { CircularEdgeKey } from "../circular-edge";
import { disposeObject } from "./geometry";
import type { Entry } from "./types";

export const strokeParts = (entry: Entry) =>
  entry.group.children.filter(
    (child) =>
      child instanceof THREE.Line &&
      ["edge", "curve"].includes(child.userData.selectionKind),
  ) as THREE.Line[];

export function applyStrokeAppearance(entry: Entry) {
  for (const child of [...entry.group.children])
    if (child.userData.styledStroke) {
      disposeObject(child);
      entry.group.remove(child);
    }
  const object = entry.object;
  strokeParts(entry).forEach((line, edgePart) => {
    const material = line.material as THREE.LineBasicMaterial;
    const ringKey = line.userData.edgeKey as CircularEdgeKey | undefined;
    const omitted = line.userData.omittedEdges as Set<number> | undefined;
    const ringStyle = ringKey
      ? object.edgeStyles?.find((s) => s.edgeKey === ringKey)
      : undefined;
    line.visible = !ringStyle?.hidden;
    if (!line.visible) return;
    if (
      object.strokeWidth === undefined &&
      !object.edgeStyles?.length &&
      !omitted?.size
    )
      return;
    // Preserve the original geometry for raycasting and legacy anchors.
    const originalOpacity = line.userData.originalOpacity ?? material.opacity;
    line.userData.originalOpacity = originalOpacity;
    material.transparent = true;
    material.opacity = 0;
    const positions = line.geometry.getAttribute("position");
    const groups = new Map<
      string,
      {
        color: string;
        width: number;
        opacity: number;
        dashed: boolean;
        positions: number[];
      }
    >();
    for (
      let i = 0;
      i + 1 < positions.count;
      i += line instanceof THREE.LineSegments ? 2 : 1
    ) {
      const style = ringKey
        ? ringStyle
        : object.edgeStyles?.find(
            (s) => !s.edgeKey && s.edgePart === edgePart && s.edgeIndex === i,
          );
      if (style?.hidden || omitted?.has(i)) continue;
      const strokeColor = style?.color || material.color.getStyle();
      const width =
        style?.strokeWidth ??
        object.strokeWidth ??
        (entry.object.type === "curve3d" ? 2.25 : 1);
      const opacity = style?.color || style?.strokeWidth ? 1 : originalOpacity;
      const dashed = (style?.lineStyle || object.lineStyle) === "dashed";
      const key = `${strokeColor}:${width}:${opacity}:${dashed}`;
      const group: {
        color: string;
        width: number;
        opacity: number;
        dashed: boolean;
        positions: number[];
      } = groups.get(key) || {
        color: strokeColor,
        width,
        opacity,
        dashed,
        positions: [],
      };
      for (const index of [i, i + 1])
        group.positions.push(
          positions.getX(index),
          positions.getY(index),
          positions.getZ(index),
        );
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const geometry = new LineSegmentsGeometry().setPositions(group.positions);
      const material = new LineMaterial({
        color: group.color,
        linewidth: group.width,
        opacity: group.opacity,
        transparent: group.opacity < 1,
        worldUnits: false,
        depthTest: (line.material as THREE.Material).depthTest,
        depthWrite: false,
        dashed: group.dashed,
        dashSize: 0.2,
        gapSize: 0.13,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const wide = new LineSegments2(geometry, material);
      wide.userData.styledStroke = true;
      wide.raycast = () => {};
      wide.computeLineDistances();
      wide.renderOrder = Math.max(line.renderOrder, 4);
      entry.group.add(wide);
    }
  });
}
