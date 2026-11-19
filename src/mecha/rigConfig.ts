import { Euler, MathUtils, Quaternion } from "three";
import { JOINTS } from "./types";
import type {
  EquipmentItemId,
  JointAngles,
  JointName,
  PoseInput,
  SocketName,
} from "./types";

const baseUrl = import.meta.env?.BASE_URL ?? "/";

export const modelPaths = {
  sentinel: `${baseUrl}assets/models/gundam-sentinel.glb?v=sentinel-rigid-2`,
  legacy: `${baseUrl}assets/models/gundam-rigged.glb?v=full-body-15`,
  prepared: `${baseUrl}assets/models/gundam-sentinel.glb?v=sentinel-rigid-2`,
  original: `${baseUrl}assets/models/mecha-original.glb`,
  equipBeamSaber: `${baseUrl}assets/models/equip-beam-saber.glb?v=saber-1`,
  equipRifle: `${baseUrl}assets/models/equip-rifle.glb?v=rifle-1`,
  equipShield: `${baseUrl}assets/models/equip-shield.glb?v=shield-1`,
};

/**
 * Secondary skirt armor FK coupling (Requirement 6):
 *   frontSkirtAngle = clamp(frontK * hipAngle, 0, frontMaxDeg)
 *   sideSkirtAngle  = clamp(sideK * hipAngle, 0, sideMaxDeg)
 *   rearSkirtAngle  = clamp(rearK * max(0, -hipAngle), 0, rearMaxDeg)
 */
export const SKIRT_FK_CONFIG = {
  frontK: 0.5,
  frontMaxDeg: 40,
  sideK: 0.3,
  sideMaxDeg: 25,
  rearK: 0.45,
  rearMaxDeg: 30,
} as const;

export interface EquipmentOffsetSpec {
  id: EquipmentItemId;
  label: string;
  joint: JointName;
  socket: SocketName;
  url: string;
  thumbUrl: string;
  position: readonly [number, number, number];
  rotationDeg: readonly [number, number, number];
  scale: number;
}

/**
 * Per-item attachment transform config (M6):
 *   M_equipment^world = M_joint^world * M_socket^joint * M_equipment^socket
 * - beam saber -> rightHandSocket: hilt along socket +Z, grip centered in the palm
 * - rifle      -> rightHandSocket: barrel forward, grip in the palm
 * - shield     -> leftForearmSocket: flat against the outer forearm
 */
export const EQUIPMENT_OFFSETS: Record<EquipmentItemId, EquipmentOffsetSpec> = {
  saber: {
    id: "saber",
    label: "Beam Saber",
    joint: "rightWrist",
    socket: "rightHand",
    url: modelPaths.equipBeamSaber,
    thumbUrl: `${baseUrl}assets/thumbs/thumb-saber.png`,
    position: [-0.012, -0.012, 0.016],
    rotationDeg: [-12, -14, 0],
    scale: 0.58,
  },
  rifle: {
    id: "rifle",
    label: "Rifle",
    joint: "rightWrist",
    socket: "rightHand",
    url: modelPaths.equipRifle,
    thumbUrl: `${baseUrl}assets/thumbs/thumb-rifle.png`,
    position: [-0.022, -0.020, 0.032],
    rotationDeg: [54, -4, 0],
    scale: 0.42,
  },
  shield: {
    id: "shield",
    label: "Shield",
    joint: "leftElbow",
    socket: "leftForearm",
    url: modelPaths.equipShield,
    thumbUrl: `${baseUrl}assets/thumbs/thumb-shield.png`,
    position: [0.042, -0.045, 0.015],
    rotationDeg: [0, 8, -4],
    scale: 0.54,
  },
};

export const JOINT_LIMITS: Record<JointName, readonly [number, number]> = {
  pelvis: [-35, 35],
  torso: [-40, 40],
  head: [-45, 45],
  rightShoulder: [-20, 65],
  rightElbow: [0, 90],
  rightWrist: [-25, 25],
  leftShoulder: [-20, 65],
  leftElbow: [0, 90],
  leftWrist: [-25, 25],
  rightHip: [-20, 45],
  rightKnee: [0, 55],
  rightAnkle: [-25, 35],
  leftHip: [-20, 45],
  leftKnee: [0, 55],
  leftAnkle: [-25, 35],
} as const;

export const BODY_PART_NAMES = [
  "waistPart",
  "chestPart",
  "headPart",
  "rightUpperArm",
  "rightForearm",
  "rightPalm",
  "leftUpperArm",
  "leftForearm",
  "leftPalm",
  "rightThigh",
  "rightShin",
  "rightFoot",
  "leftThigh",
  "leftShin",
  "leftFoot",
] as const;

export const SKIRT_PART_NAMES = [
  "frontRightSkirtPart",
  "frontLeftSkirtPart",
  "sideRightSkirtPart",
  "sideLeftSkirtPart",
  "rearRightSkirtPart",
  "rearLeftSkirtPart",
] as const;

export const rigConfig = {
  joints: Object.fromEntries(JOINTS.map((j) => [j, j])) as Record<
    JointName,
    string
  >,
  sockets: {
    rightHand: "rightHand",
    leftHand: "leftHand",
    leftForearm: "leftForearm",
    back: "back",
  },
  bodyPartNames: [...BODY_PART_NAMES],
  skirtPartNames: [...SKIRT_PART_NAMES],
  partNames: [...BODY_PART_NAMES, "rifle", "shield"],
  limits: JOINT_LIMITS,
};

export function zeroJointAngles(): JointAngles {
  return Object.fromEntries(JOINTS.map((j) => [j, 0])) as JointAngles;
}

export function clampJointAngle(joint: JointName, degrees: number): number {
  const [min, max] = JOINT_LIMITS[joint];
  return MathUtils.clamp(Number.isFinite(degrees) ? degrees : 0, min, max);
}

export function normalizePoseInput(input: PoseInput): JointAngles {
  const out = zeroJointAngles();
  for (const j of JOINTS) {
    if (input[j] !== undefined) {
      out[j] = clampJointAngle(j, input[j]!);
    }
  }
  if (input.shoulder !== undefined && input.rightShoulder === undefined) {
    out.rightShoulder = clampJointAngle("rightShoulder", input.shoulder);
  }
  if (input.elbow !== undefined && input.rightElbow === undefined) {
    out.rightElbow = clampJointAngle("rightElbow", input.elbow);
  }
  if (input.wrist !== undefined && input.rightWrist === undefined) {
    out.rightWrist = clampJointAngle("rightWrist", input.wrist);
  }
  return out;
}

export function jointAngleToEuler(joint: JointName, degrees: number): Euler {
  const clamped = clampJointAngle(joint, degrees);
  const r = MathUtils.degToRad(clamped);
  if (joint === "pelvis" || joint === "torso" || joint === "head") {
    return new Euler(0, r, 0, "XYZ");
  }
  if (joint === "rightWrist" || joint === "leftWrist") {
    return new Euler(0, 0, r, "XYZ");
  }
  if (joint === "rightKnee" || joint === "leftKnee") {
    return new Euler(r, 0, 0, "XYZ");
  }
  return new Euler(-r, 0, 0, "XYZ");
}

export function jointQuatToAngle(
  joint: JointName,
  offsetQuat: Quaternion,
): number {
  const e = new Euler().setFromQuaternion(offsetQuat, "XYZ");
  if (joint === "pelvis" || joint === "torso" || joint === "head") {
    return MathUtils.radToDeg(e.y);
  }
  if (joint === "rightWrist" || joint === "leftWrist") {
    return MathUtils.radToDeg(e.z);
  }
  if (joint === "rightKnee" || joint === "leftKnee") {
    return MathUtils.radToDeg(e.x);
  }
  return -MathUtils.radToDeg(e.x);
}

export interface TestPoseSpec {
  id:
    | "bind"
    | "rightArmAim"
    | "leftArmGuard"
    | "dualArmReady"
    | "torsoTwist"
    | "crouch"
    | "deepCrouchAim"
    | "fullBodyTwistCrouch"
    | "maxArticulation";
  label: string;
  shortLabel: string;
  angles: Partial<JointAngles>;
}

export const TEST_POSES: readonly TestPoseSpec[] = [
  {
    id: "bind",
    label: "Bind / Rest Pose",
    shortLabel: "初始",
    angles: {},
  },
  {
    id: "rightArmAim",
    label: "Right Arm Rifle Aim",
    shortLabel: "右臂举枪",
    angles: { rightShoulder: 30, rightElbow: 55, rightWrist: 10 },
  },
  {
    id: "leftArmGuard",
    label: "Left Arm Shield Guard",
    shortLabel: "左臂举盾",
    angles: { leftShoulder: 35, leftElbow: 65, leftWrist: -15 },
  },
  {
    id: "dualArmReady",
    label: "Both Arms Combat Ready",
    shortLabel: "双臂戒备",
    angles: {
      rightShoulder: 45,
      rightElbow: 75,
      rightWrist: 15,
      leftShoulder: 40,
      leftElbow: 60,
      leftWrist: -15,
    },
  },
  {
    id: "torsoTwist",
    label: "Pelvis & Torso Counter-Twist",
    shortLabel: "扭腰转头",
    angles: {
      pelvis: -15,
      torso: 30,
      head: -25,
      rightShoulder: 20,
      rightElbow: 40,
      leftShoulder: 20,
      leftElbow: 35,
    },
  },
  {
    id: "crouch",
    label: "Symmetric Tactical Crouch",
    shortLabel: "战术半蹲",
    angles: {
      rightHip: 20,
      rightKnee: 40,
      rightAnkle: 20,
      leftHip: 20,
      leftKnee: 40,
      leftAnkle: 20,
      rightShoulder: 25,
      rightElbow: 45,
      leftShoulder: 20,
      leftElbow: 40,
    },
  },
  {
    id: "deepCrouchAim",
    label: "Deep Crouch + Dual Arm Aim/Guard",
    shortLabel: "深蹲瞄准",
    angles: {
      rightHip: 27,
      rightKnee: 54,
      rightAnkle: 27,
      leftHip: 27,
      leftKnee: 54,
      leftAnkle: 27,
      torso: 15,
      head: -15,
      rightShoulder: 50,
      rightElbow: 80,
      rightWrist: 15,
      leftShoulder: 40,
      leftElbow: 70,
      leftWrist: -10,
    },
  },
  {
    id: "fullBodyTwistCrouch",
    label: "Full-Body Twist + Crouch + Both Arms",
    shortLabel: "全身联动",
    angles: {
      pelvis: 20,
      torso: -30,
      head: 25,
      rightHip: 18,
      rightKnee: 36,
      rightAnkle: 18,
      leftHip: 18,
      leftKnee: 36,
      leftAnkle: 18,
      rightShoulder: 40,
      rightElbow: 65,
      rightWrist: -10,
      leftShoulder: 30,
      leftElbow: 55,
      leftWrist: 15,
    },
  },
  {
    id: "maxArticulation",
    label: "All 15 Joints Active Near Limits",
    shortLabel: "极限全动",
    angles: {
      pelvis: -25,
      torso: 35,
      head: -35,
      rightShoulder: 55,
      rightElbow: 85,
      rightWrist: 20,
      leftShoulder: 55,
      leftElbow: 80,
      leftWrist: -20,
      rightHip: 27,
      rightKnee: 54,
      rightAnkle: 27,
      leftHip: 27,
      leftKnee: 54,
      leftAnkle: 27,
    },
  },
];
