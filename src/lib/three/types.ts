import * as THREE from "three";
import type { ThreeVisualObject } from "../contracts";

export type Entry = {
  group: THREE.Group;
  object: ThreeVisualObject;
  mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  labelNode?: HTMLSpanElement;
  labelSize?: { width: number; height: number };
  annotationLabels?: Array<{
    node: HTMLSpanElement;
    anchor: THREE.Object3D;
    point: THREE.Vector3;
    kind: "vertex" | "length";
    size?: { width: number; height: number };
  }>;
};
