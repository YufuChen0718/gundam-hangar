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
      pose: {
        rightShoulder: [0, 0, 0],
        rightElbow: [0, 0, 0],
        rightWrist: [0, 0, 0],
      },
      ease: "easeInOut",
    },
    {
      t: 2,
      pose: {
        rightShoulder: [-20, 0, 0],
        rightElbow: [-40, 0, 0],
        rightWrist: [0, 0, 0],
      },
      ease: "easeInOut",
    },
    {
      t: 3.5,
      pose: {
        rightShoulder: [-20, 0, 0],
        rightElbow: [-40, 0, 0],
        rightWrist: [0, 0, 0],
      },
      ease: "easeInOut",
    },
    {
      t: 6,
      pose: {
        rightShoulder: [0, 0, 0],
        rightElbow: [0, 0, 0],
        rightWrist: [0, 0, 0],
      },
    },
  ],
};
