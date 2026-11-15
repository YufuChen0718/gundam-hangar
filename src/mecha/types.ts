import type { Group, Object3D, Quaternion, Material } from "three";
export const JOINTS = [
  "torso",
  "head",
  "rightShoulder",
  "rightElbow",
  "rightWrist",
  "leftShoulder",
  "leftElbow",
  "leftWrist",
] as const;
export type JointName = (typeof JOINTS)[number];
export type SocketName = "rightHand" | "leftHand" | "back";
export type JointAngles = { shoulder: number; elbow: number; wrist: number };
/** This first adapter intentionally has no independent armor-color regions yet. */
export interface ArmPreviewRig {
  displayRoot: Group;
  joints: Record<JointName, Object3D>;
  bindPose: Record<JointName, Quaternion>;
  sockets: Record<SocketName, Object3D>;
  parts: Record<string, Object3D>;
  originalMaterials: Map<Object3D, Material | Material[]>;
}
export type ModelMode = "prepared" | "original";
