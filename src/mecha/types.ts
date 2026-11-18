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
export type SocketName = "rightHand" | "leftHand" | "leftForearm" | "back";
export type RightHandItem = "none" | "saber" | "rifle";
export type EquipmentItemId = "saber" | "rifle" | "shield";
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

export type SkinningMode = "three" | "lbs" | "rigid";

export interface SeamStats {
  maxGap: number;
  meanGap: number;
  boundaryGroups: number;
}

export interface LbsComparisonStats {
  maxDiff: number;
  meanDiff: number;
  vertexCount: number;
}

export interface LbsController {
  getMode(): SkinningMode;
  setMode(mode: SkinningMode): void;
  setShieldVisible(visible: boolean): void;
  setAppearance(parts: boolean, wireframe: boolean): void;
  updateBoneMatrices(): void;
  cpuPosition(
    mesh: Object3D,
    index: number,
    mode: "lbs" | "rigid",
    target: Vector3,
  ): Vector3;
  computeSeamStats(mode?: "lbs" | "rigid"): SeamStats;
  compareWithThreeSkinning(): LbsComparisonStats;
}

/** Full-body 15-joint preview rig adapter. */
export interface ArmPreviewRig {
  variant: RiggedModelVariant;
  hasEmbeddedEquipment: boolean;
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
  lbs?: LbsController;
}

export type RiggedModelVariant = "sentinel" | "legacy";
export type ModelMode = "sentinel" | "legacy" | "prepared" | "original";
