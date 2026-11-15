import type { JointName } from "../mecha/types";

export type Ease = "linear" | "easeInOut";

export interface Keyframe {
  t: number;
  pose: Partial<Record<JointName, [number, number, number]>>;
  ease?: Ease;
}

export interface Clip {
  name: string;
  duration: number;
  loop: boolean;
  keys: Keyframe[];
}

export const raiseArm: Clip = {
  name: "raise",
  duration: 6,
  loop: false,
  keys: [
    {
      t: 0,
      pose: {},
      ease: "easeInOut",
    },
    {
      t: 2,
      pose: {
        pelvis: [0, -12, 0],
        torso: [0, 24, 0],
        head: [0, -18, 0],
        rightShoulder: [-35, 0, 0],
        rightElbow: [-65, 0, 0],
        rightWrist: [0, 0, 12],
        leftShoulder: [-30, 0, 0],
        leftElbow: [-55, 0, 0],
        leftWrist: [0, 0, -12],
        rightHip: [-20, 0, 0],
        rightKnee: [40, 0, 0],
        rightAnkle: [-20, 0, 0],
        leftHip: [-20, 0, 0],
        leftKnee: [40, 0, 0],
        leftAnkle: [-20, 0, 0],
      },
      ease: "easeInOut",
    },
    {
      t: 3.5,
      pose: {
        pelvis: [0, -12, 0],
        torso: [0, 24, 0],
        head: [0, -18, 0],
        rightShoulder: [-35, 0, 0],
        rightElbow: [-65, 0, 0],
        rightWrist: [0, 0, 12],
        leftShoulder: [-30, 0, 0],
        leftElbow: [-55, 0, 0],
        leftWrist: [0, 0, -12],
        rightHip: [-20, 0, 0],
        rightKnee: [40, 0, 0],
        rightAnkle: [-20, 0, 0],
        leftHip: [-20, 0, 0],
        leftKnee: [40, 0, 0],
        leftAnkle: [-20, 0, 0],
      },
      ease: "easeInOut",
    },
    {
      t: 6,
      pose: {},
    },
  ],
};
