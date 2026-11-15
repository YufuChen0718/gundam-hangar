import type { Group, Object3D, Quaternion, Material, Vector3 } from "three";

export const JOINTS = [
  "pelvis",
  "torso",
  "head",
  "rightShoulder",
  "rightElbow",
  "rightWrist",
  "leftShoulder",
  "leftElbow",
  "leftWrist",
  "rightHip",
  "rightKnee",
  "rightAnkle",
  "leftHip",
  "leftKnee",
  "leftAnkle",
] as const;

export type JointName = (typeof JOINTS)[number];
export type SocketName = "rightHand" | "leftHand" | "back";
export type JointAngles = Record<JointName, number>;
export type LegacyArmAngles = {
  shoulder?: number;
  elbow?: number;
  wrist?: number;
};
export type PoseInput = Partial<JointAngles> & LegacyArmAngles;

export type PosePresetName =
  | "bind"
  | "rest"
  | "raise"
  | "aim"
  | "rightArmAim"
  | "leftArmGuard"
  | "dualArmReady"
  | "torsoTwist"
  | "crouch"
  | "deepCrouchAim"
  | "fullBodyTwistCrouch"
  | "maxArticulation";

export interface FootGroundSample {
  ankleJoint: Object3D;
  localPoint: Vector3;
}

/** Full-body 15-joint preview rig adapter. */
export interface ArmPreviewRig {
  displayRoot: Group;
  joints: Record<JointName, Object3D>;
  bindPose: Record<JointName, Quaternion>;
  sockets: Record<SocketName, Object3D>;
  parts: Record<string, Object3D>;
  originalMaterials: Map<Object3D, Material | Material[]>;
  pelvisBindPosition?: Vector3;
  bindAnkleY?: number;
  bindFootMinY?: number;
  footGroundSamples?: FootGroundSample[];
}

export type ModelMode = "prepared" | "original";
