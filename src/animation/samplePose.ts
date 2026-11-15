import { Euler, MathUtils, Quaternion } from "three";
import { JOINTS } from "../mecha/types";
import type { JointName } from "../mecha/types";
import type { Clip, Ease } from "./clips";
export type Pose = Record<JointName, Quaternion>;
export interface PreparedClip {
  duration: number;
  loop: boolean;
  keys: { t: number; pose: Pose; ease: Ease }[];
}
export function emptyPose(): Pose {
  return Object.fromEntries(JOINTS.map((j) => [j, new Quaternion()])) as Pose;
}
export function compileClip(clip: Clip): PreparedClip {
  if (!(clip.duration > 0) || clip.keys.length === 0)
    throw new Error("Clip needs positive duration and keyframes");
  for (let i = 0; i < clip.keys.length; i++) {
    const t = clip.keys[i].t;
    if (
      !Number.isFinite(t) ||
      t < 0 ||
      t > clip.duration ||
      (i > 0 && t <= clip.keys[i - 1].t)
    )
      throw new Error("Invalid keyframe times");
  }
  return {
    ...clip,
    keys: clip.keys.map((k) => ({
      t: k.t,
      ease: k.ease ?? "linear",
      pose: Object.fromEntries(
        JOINTS.map((j) => {
          const v = k.pose[j] ?? [0, 0, 0];
          return [
            j,
            new Quaternion().setFromEuler(
              new Euler(
                ...(v.map(MathUtils.degToRad) as [number, number, number]),
                "XYZ",
              ),
            ),
          ];
        }),
      ) as Pose,
    })),
  };
}
export function samplePose(clip: PreparedClip, time: number, out: Pose): Pose {
  if (!Number.isFinite(time)) throw new Error("Non-finite playback time");
  const t = clip.loop
    ? ((time % clip.duration) + clip.duration) % clip.duration
    : MathUtils.clamp(time, 0, clip.duration);
  let a = clip.keys[0],
    b = a;
  if (t >= clip.keys[clip.keys.length - 1].t)
    a = b = clip.keys[clip.keys.length - 1];
  else if (t > a.t)
    for (let i = 0; i < clip.keys.length - 1; i++)
      if (t <= clip.keys[i + 1].t) {
        a = clip.keys[i];
        b = clip.keys[i + 1];
        break;
      }
  let u = a === b ? 0 : MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
  if (a.ease === "easeInOut") u = u * u * (3 - 2 * u);
  for (const j of JOINTS) out[j].slerpQuaternions(a.pose[j], b.pose[j], u);
  return out;
}
