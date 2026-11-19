import type { JointName } from "../mecha/types";
import { clampJointAngle } from "../mecha/rigConfig";

export type Ease = "linear" | "easeInOut";
export type ActionName = "idle" | "aim" | "swing";
export type TransitionMode = "blend" | "cut";
export type AnimatorStatus = "playing" | "transitioning" | "holding";

export interface Keyframe {
  t: number;
  pose: Partial<Record<JointName, [number, number, number]>>;
  ease?: Ease;
}

export interface Clip {
  name: string;
  duration: number;
  loop: boolean;
  next?: ActionName;
  keys: Keyframe[];
}

function poseEuler(
  angles: Partial<Record<JointName, number>>,
): Partial<Record<JointName, [number, number, number]>> {
  const out: Partial<Record<JointName, [number, number, number]>> = {};
  for (const [joint, raw] of Object.entries(angles) as [JointName, number][]) {
    const deg = clampJointAngle(joint, raw);
    if (joint === "pelvis" || joint === "torso" || joint === "head") {
      out[joint] = [0, deg, 0];
    } else if (joint === "rightWrist" || joint === "leftWrist") {
      out[joint] = [0, 0, deg];
    } else if (joint === "rightKnee" || joint === "leftKnee") {
      out[joint] = [deg, 0, 0];
    } else {
      out[joint] = [-deg, 0, 0];
    }
  }
  return out;
}

export const idleClip: Clip = {
  name: "idle",
  duration: 3.2,
  loop: true,
  keys: [
    {
      t: 0,
      pose: poseEuler({
        pelvis: 0,
        torso: 0,
        head: 0,
        rightShoulder: 6,
        rightElbow: 14,
        rightWrist: 0,
        leftShoulder: 5,
        leftElbow: 12,
        leftWrist: 0,
        rightHip: 6,
        rightKnee: 12,
        rightAnkle: 6,
        leftHip: 6,
        leftKnee: 12,
        leftAnkle: 6,
      }),
      ease: "easeInOut",
    },
    {
      t: 0.8,
      pose: poseEuler({
        pelvis: -4,
        torso: 7,
        head: -5,
        rightShoulder: 10,
        rightElbow: 20,
        rightWrist: 4,
        leftShoulder: 8,
        leftElbow: 18,
        leftWrist: -4,
        rightHip: 10,
        rightKnee: 20,
        rightAnkle: 10,
        leftHip: 10,
        leftKnee: 20,
        leftAnkle: 10,
      }),
      ease: "easeInOut",
    },
    {
      t: 1.6,
      pose: poseEuler({
        pelvis: 0,
        torso: -2,
        head: 2,
        rightShoulder: 7,
        rightElbow: 15,
        rightWrist: 0,
        leftShoulder: 6,
        leftElbow: 14,
        leftWrist: 0,
        rightHip: 7,
        rightKnee: 14,
        rightAnkle: 7,
        leftHip: 7,
        leftKnee: 14,
        leftAnkle: 7,
      }),
      ease: "easeInOut",
    },
    {
      t: 2.4,
      pose: poseEuler({
        pelvis: 4,
        torso: -7,
        head: 5,
        rightShoulder: 9,
        rightElbow: 18,
        rightWrist: -3,
        leftShoulder: 9,
        leftElbow: 20,
        leftWrist: 4,
        rightHip: 9,
        rightKnee: 18,
        rightAnkle: 9,
        leftHip: 9,
        leftKnee: 18,
        leftAnkle: 9,
      }),
      ease: "easeInOut",
    },
    {
      t: 3.2,
      pose: poseEuler({
        pelvis: 0,
        torso: 0,
        head: 0,
        rightShoulder: 6,
        rightElbow: 14,
        rightWrist: 0,
        leftShoulder: 5,
        leftElbow: 12,
        leftWrist: 0,
        rightHip: 6,
        rightKnee: 12,
        rightAnkle: 6,
        leftHip: 6,
        leftKnee: 12,
        leftAnkle: 6,
      }),
    },
  ],
};

export const aimClip: Clip = {
  name: "aim",
  duration: 1.2,
  loop: false,
  keys: [
    {
      t: 0,
      pose: poseEuler({
        pelvis: -2,
        torso: 4,
        head: -2,
        rightShoulder: 12,
        rightElbow: 24,
        rightWrist: 4,
        leftShoulder: 10,
        leftElbow: 20,
        leftWrist: -4,
        rightHip: 8,
        rightKnee: 16,
        rightAnkle: 8,
        leftHip: 8,
        leftKnee: 16,
        leftAnkle: 8,
      }),
      ease: "easeInOut",
    },
    {
      t: 0.55,
      pose: poseEuler({
        pelvis: -6,
        torso: 12,
        head: -8,
        rightShoulder: 16,
        rightElbow: 26,
        rightWrist: 4,
        leftShoulder: 20,
        leftElbow: 38,
        leftWrist: -8,
        rightHip: 11,
        rightKnee: 22,
        rightAnkle: 11,
        leftHip: 11,
        leftKnee: 22,
        leftAnkle: 11,
      }),
      ease: "easeInOut",
    },
    {
      t: 1.0,
      pose: poseEuler({
        pelvis: -10,
        torso: 18,
        head: -10,
        rightShoulder: 22,
        rightElbow: 34,
        rightWrist: 6,
        leftShoulder: 26,
        leftElbow: 48,
        leftWrist: -10,
        rightHip: 14,
        rightKnee: 28,
        rightAnkle: 14,
        leftHip: 14,
        leftKnee: 28,
        leftAnkle: 14,
      }),
      ease: "easeInOut",
    },
    {
      t: 1.2,
      pose: poseEuler({
        pelvis: -10,
        torso: 18,
        head: -10,
        rightShoulder: 22,
        rightElbow: 34,
        rightWrist: 6,
        leftShoulder: 26,
        leftElbow: 48,
        leftWrist: -10,
        rightHip: 14,
        rightKnee: 28,
        rightAnkle: 14,
        leftHip: 14,
        leftKnee: 28,
        leftAnkle: 14,
      }),
    },
  ],
};

export const swingClip: Clip = {
  name: "swing",
  duration: 1.8,
  loop: false,
  next: "idle",
  keys: [
    {
      t: 0,
      pose: poseEuler({
        pelvis: 6,
        torso: -12,
        head: 8,
        rightShoulder: 28,
        rightElbow: 46,
        rightWrist: 8,
        leftShoulder: 14,
        leftElbow: 28,
        leftWrist: -6,
        rightHip: 12,
        rightKnee: 24,
        rightAnkle: 12,
        leftHip: 12,
        leftKnee: 24,
        leftAnkle: 12,
      }),
      ease: "easeInOut",
    },
    {
      t: 0.45,
      pose: poseEuler({
        pelvis: 14,
        torso: -28,
        head: 18,
        rightShoulder: 60,
        rightElbow: 82,
        rightWrist: 20,
        leftShoulder: 25,
        leftElbow: 48,
        leftWrist: -10,
        rightHip: 18,
        rightKnee: 36,
        rightAnkle: 18,
        leftHip: 18,
        leftKnee: 36,
        leftAnkle: 18,
      }),
      ease: "easeInOut",
    },
    {
      t: 0.85,
      pose: poseEuler({
        pelvis: -16,
        torso: 32,
        head: -20,
        rightShoulder: -14,
        rightElbow: 18,
        rightWrist: -18,
        leftShoulder: 38,
        leftElbow: 64,
        leftWrist: -14,
        rightHip: 26,
        rightKnee: 52,
        rightAnkle: 26,
        leftHip: 26,
        leftKnee: 52,
        leftAnkle: 26,
      }),
      ease: "easeInOut",
    },
    {
      t: 1.25,
      pose: poseEuler({
        pelvis: -12,
        torso: 24,
        head: -14,
        rightShoulder: -8,
        rightElbow: 24,
        rightWrist: -10,
        leftShoulder: 28,
        leftElbow: 48,
        leftWrist: -8,
        rightHip: 22,
        rightKnee: 44,
        rightAnkle: 22,
        leftHip: 22,
        leftKnee: 44,
        leftAnkle: 22,
      }),
      ease: "easeInOut",
    },
    {
      t: 1.8,
      pose: poseEuler({
        pelvis: 0,
        torso: 0,
        head: 0,
        rightShoulder: 6,
        rightElbow: 14,
        rightWrist: 0,
        leftShoulder: 5,
        leftElbow: 12,
        leftWrist: 0,
        rightHip: 6,
        rightKnee: 12,
        rightAnkle: 6,
        leftHip: 6,
        leftKnee: 12,
        leftAnkle: 6,
      }),
    },
  ],
};

export const CLIPS: Record<ActionName, Clip> = {
  idle: idleClip,
  aim: aimClip,
  swing: swingClip,
};

export const raiseArm: Clip = {
  name: "raise",
  duration: 6,
  loop: false,
  keys: [
    { t: 0, pose: {}, ease: "easeInOut" },
    {
      t: 2,
      pose: poseEuler({
        pelvis: -12,
        torso: 24,
        head: -18,
        rightShoulder: 35,
        rightElbow: 65,
        rightWrist: 12,
        leftShoulder: 30,
        leftElbow: 55,
        leftWrist: -12,
        rightHip: 20,
        rightKnee: 40,
        rightAnkle: 20,
        leftHip: 20,
        leftKnee: 40,
        leftAnkle: 20,
      }),
      ease: "easeInOut",
    },
    {
      t: 3.5,
      pose: poseEuler({
        pelvis: -12,
        torso: 24,
        head: -18,
        rightShoulder: 35,
        rightElbow: 65,
        rightWrist: 12,
        leftShoulder: 30,
        leftElbow: 55,
        leftWrist: -12,
        rightHip: 20,
        rightKnee: 40,
        rightAnkle: 20,
        leftHip: 20,
        leftKnee: 40,
        leftAnkle: 20,
      }),
      ease: "easeInOut",
    },
    { t: 6, pose: {} },
  ],
};
