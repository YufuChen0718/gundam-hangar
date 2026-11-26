import { Euler, MathUtils, Quaternion } from "three";
import { JOINTS } from "../mecha/types";
import type { JointName } from "../mecha/types";
import type { ActionName, Clip, Ease } from "./clips";
export type Pose = Record<JointName, Quaternion>;
export interface PreparedClip {
  name: string;
  duration: number;
  loop: boolean;
  next?: ActionName;
  keys: { t: number; pose: Pose; ease: Ease; pelvisDrop: number }[];
  /** True if any key sets pelvisDrop (the clip lowers the body via foot planting). */
  hasPelvisDrop: boolean;
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
    hasPelvisDrop: clip.keys.some((k) => (k.pelvisDrop ?? 0) !== 0),
    keys: clip.keys.map((k) => ({
      t: k.t,
      ease: k.ease ?? "linear",
      pelvisDrop: k.pelvisDrop ?? 0,
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
  const { a, b, u } = segmentAt(clip, time);
  for (const j of JOINTS) out[j].slerpQuaternions(a.pose[j], b.pose[j], u);
  return out;
}

/** Pelvis drop (m) at `time`, same keys and easing as the joint channels. */
export function samplePelvisDrop(clip: PreparedClip, time: number): number {
  const { a, b, u } = segmentAt(clip, time);
  return a.pelvisDrop + (b.pelvisDrop - a.pelvisDrop) * u;
}

function segmentAt(clip: PreparedClip, time: number) {
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
  return { a, b, u };
}
