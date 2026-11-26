import { MathUtils, Quaternion, Vector3 } from "three";

/**
 * Analytic two-bone IK (method M7, task T16).
 *
 * Pure math: only Vector3 / Quaternion, no rig or scene. Everything is expressed
 * in the parent space of the root joint (the torso for the right arm), using the
 * BIND-pose geometry of the chain:
 *
 *   root (shoulder S) ── upper bone ── mid (elbow E) ── lower bone ── end (wrist W)
 *
 * The mid joint is a hinge: bending it by `bend` rotates the lower bone about
 * `hingeAxis` (through E) by +bend. The arm does not have to be straight in the
 * bind pose and the hinge does not have to be perpendicular to the bones, so the
 * law of cosines is applied to the bone components perpendicular to the hinge:
 *
 *   s = S − E, f = W − E, s⊥/f⊥ = components perpendicular to the hinge axis h
 *   c(bend)² = A − 2B·cos(ψ0 + bend)
 *   A = |s|² + |f|² − 2(s·h)(f·h),  B = |s⊥||f⊥|,  ψ0 = signed angle s⊥ → f⊥ about h
 *
 * For a straight bind arm with a perpendicular hinge this is exactly
 * c² = a² + b² − 2ab·cos(interior), with interior = π − bend.
 */

const EPS = 1e-9;

function smoothstep01(u: number): number {
  const x = MathUtils.clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
}

export interface TwoBoneBind {
  /** Root joint position (shoulder / hip) in root-parent space. */
  root: Vector3;
  /** Mid joint position (elbow / knee) in root-parent space, bind pose. */
  mid: Vector3;
  /** End effector position (wrist / ankle) in root-parent space, bind pose. */
  end: Vector3;
  /** Hinge axis of the mid joint in root-parent space, bind pose. +bend rotates about it. */
  hingeAxis: Vector3;
  /** Mid-joint limits, radians, relative to the bind pose. */
  minBend: number;
  maxBend: number;
}

export interface PreparedTwoBone {
  readonly root: Vector3;
  readonly mid: Vector3;
  readonly end: Vector3;
  readonly hinge: Vector3;
  readonly upperLength: number;
  readonly lowerLength: number;
  readonly minBend: number;
  readonly maxBend: number;
  readonly A: number;
  readonly B: number;
  readonly psi0: number;
  /** Closest reachable root→end distance allowed by the mid-joint limits. */
  readonly minReach: number;
  /** Farthest reachable root→end distance allowed by the mid-joint limits. */
  readonly maxReach: number;
  /** +1/−1: which side of the root→end line the mid joint bulges, relative to (end dir × hinge). */
  readonly sideSign: 1 | -1;
}

/** Per-chain memory between frames: keeps the solution continuous. */
export interface TwoBoneMemory {
  bend?: number;
  poleDir?: Vector3;
}

export interface TwoBoneSolution {
  /** Rotation to apply to the root joint, in root-parent space (pre-multiplies the bind rotation). */
  rootRotation: Quaternion;
  /** Mid-joint bend, radians, within [minBend, maxBend]. */
  bend: number;
  /** |target − root| before clamping. */
  distance: number;
  /** Distance actually solved for, clamped into [minReach, maxReach]. */
  clampedDistance: number;
  /** True when the target distance is inside the reachable range. */
  reachable: boolean;
}

function wrapAround(x: number, center: number): number {
  const t = (x - center + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI + center;
}

/**
 * Unit direction (bind frame, ⟂ root→end) toward which the mid joint bulges at
 * this bend. The solver turns this direction onto the pole, so a pole placed
 * along R · bendPlaneSide(bend) reproduces root rotation R exactly.
 *
 * Base: sideSign · (root→end × hinge), continuous in the bend. With a hinge that
 * is skewed relative to the bones, the mid joint's actual offset from the
 * root→end line is not exactly along that, so we blend toward the actual offset
 * (otherwise the root picks up an extra twist about the root→target line). The
 * offset is ill-conditioned when the chain is nearly straight, so the blend is a
 * smoothstep over 0…10% of the upper bone length. `vHatOut` gets root→end.
 */
export function bendPlaneSide(
  prep: PreparedTwoBone,
  bend: number,
  out = new Vector3(),
  vHatOut = new Vector3(),
): Vector3 {
  const upper = new Vector3().subVectors(prep.mid, prep.root);
  const vHat = vHatOut
    .copy(upper)
    .add(lowerBoneAt(prep, bend, new Vector3()))
    .normalize();
  const side = out.crossVectors(vHat, prep.hinge);
  if (side.lengthSq() < EPS) {
    // hinge parallel to root→end: any perpendicular works
    side.set(1, 0, 0).cross(vHat);
    if (side.lengthSq() < EPS) side.set(0, 1, 0).cross(vHat);
  }
  side.normalize().multiplyScalar(prep.sideSign);
  const midOff = upper.addScaledVector(vHat, -upper.dot(vHat));
  const offLen = midOff.length();
  const t = smoothstep01(offLen / (0.1 * prep.upperLength));
  if (t > 0) {
    midOff.divideScalar(offLen);
    if (midOff.dot(side) < 0) midOff.negate();
    side.multiplyScalar(1 - t).addScaledVector(midOff, t).normalize();
  }
  return side;
}

/** Is some angle `target + 2πk` inside [lo, hi]? */
function angleInRange(lo: number, hi: number, target: number): boolean {
  const k = Math.ceil((lo - target) / (2 * Math.PI));
  return target + 2 * Math.PI * k <= hi;
}

function lowerBoneAt(
  prep: Pick<PreparedTwoBone, "mid" | "end" | "hinge">,
  bend: number,
  out: Vector3,
): Vector3 {
  return out.subVectors(prep.end, prep.mid).applyAxisAngle(prep.hinge, bend);
}

export function prepareTwoBone(bind: TwoBoneBind): PreparedTwoBone {
  if (!(bind.maxBend >= bind.minBend))
    throw new Error("Two-bone IK: maxBend must be >= minBend");
  const hinge = bind.hingeAxis.clone().normalize();
  if (!(hinge.lengthSq() > 0.5))
    throw new Error("Two-bone IK: hinge axis must be non-zero");
  const s = new Vector3().subVectors(bind.root, bind.mid);
  const f = new Vector3().subVectors(bind.end, bind.mid);
  const sh = s.dot(hinge);
  const fh = f.dot(hinge);
  const sPerp = s.clone().addScaledVector(hinge, -sh);
  const fPerp = f.clone().addScaledVector(hinge, -fh);
  const B = sPerp.length() * fPerp.length();
  if (B < EPS)
    throw new Error("Two-bone IK: a bone is parallel to the hinge axis");
  const A = s.lengthSq() + f.lengthSq() - 2 * sh * fh;
  const psi0 = Math.atan2(
    hinge.dot(new Vector3().crossVectors(sPerp, fPerp)),
    sPerp.dot(fPerp),
  );

  const lo = psi0 + bind.minBend;
  const hi = psi0 + bind.maxBend;
  let gMin = Math.min(Math.cos(lo), Math.cos(hi));
  let gMax = Math.max(Math.cos(lo), Math.cos(hi));
  if (angleInRange(lo, hi, Math.PI)) gMin = -1;
  if (angleInRange(lo, hi, 0)) gMax = 1;
  const minReach = Math.sqrt(Math.max(0, A - 2 * B * gMax));
  const maxReach = Math.sqrt(Math.max(0, A - 2 * B * gMin));

  // Which way does the mid joint stick out of the root→end line? Measured where it
  // sticks out the most, so it is well defined even if the bind arm is straight.
  const base = {
    root: bind.root.clone(),
    mid: bind.mid.clone(),
    end: bind.end.clone(),
    hinge,
  };
  const upper = new Vector3().subVectors(bind.mid, bind.root);
  const lower = new Vector3();
  const v = new Vector3();
  const m = new Vector3();
  const r = new Vector3();
  let bestOffset = -1;
  let sideSign: 1 | -1 = 1;
  for (let i = 0; i <= 8; i++) {
    const bend = bind.minBend + ((bind.maxBend - bind.minBend) * i) / 8;
    v.copy(upper).add(lowerBoneAt(base, bend, lower));
    if (v.lengthSq() < EPS) continue;
    v.normalize();
    m.copy(upper).addScaledVector(v, -upper.dot(v));
    const offset = m.length();
    if (offset > bestOffset) {
      bestOffset = offset;
      r.crossVectors(v, hinge);
      sideSign = r.dot(m) >= 0 ? 1 : -1;
    }
  }

  return {
    ...base,
    upperLength: upper.length(),
    lowerLength: f.length(),
    minBend: bind.minBend,
    maxBend: bind.maxBend,
    A,
    B,
    psi0,
    minReach,
    maxReach,
    sideSign,
  };
}

/** Root→end distance produced by a given bend (law of cosines, generalized). */
export function reachForBend(prep: PreparedTwoBone, bend: number): number {
  return Math.sqrt(
    Math.max(0, prep.A - 2 * prep.B * Math.cos(prep.psi0 + bend)),
  );
}

/** Mid joint (elbow) position for a root rotation, root-parent space. */
export function twoBoneMid(
  prep: PreparedTwoBone,
  rootRotation: Quaternion,
  out = new Vector3(),
): Vector3 {
  return out
    .subVectors(prep.mid, prep.root)
    .applyQuaternion(rootRotation)
    .add(prep.root);
}

/** Forward kinematics of the chain: end effector position, root-parent space. */
export function twoBoneEnd(
  prep: PreparedTwoBone,
  rootRotation: Quaternion,
  bend: number,
  out = new Vector3(),
): Vector3 {
  const lower = lowerBoneAt(prep, bend, new Vector3());
  return out
    .subVectors(prep.mid, prep.root)
    .add(lower)
    .applyQuaternion(rootRotation)
    .add(prep.root);
}

/**
 * Solve the chain so the end effector reaches `target`, with the mid joint bending
 * toward `pole`. Both points are in root-parent space. Out-of-range targets are
 * clamped: too far → the chain is as straight as the limits allow and points at the
 * target; too close → the mid joint is at its bend limit.
 */
export function solveTwoBone(
  prep: PreparedTwoBone,
  target: Vector3,
  pole: Vector3,
  memory: TwoBoneMemory = {},
): TwoBoneSolution {
  const toTarget = new Vector3().subVectors(target, prep.root);
  const distance = toTarget.length();
  const d = new Vector3();
  if (distance > EPS) d.copy(toTarget).divideScalar(distance);
  else d.subVectors(prep.end, prep.root).normalize();

  // 1. Mid-joint bend from the (generalized) law of cosines.
  const c = MathUtils.clamp(distance, prep.minReach, prep.maxReach);
  const k = MathUtils.clamp((prep.A - c * c) / (2 * prep.B), -1, 1);
  const phi = Math.acos(k);
  const center = 0.5 * (prep.minBend + prep.maxBend);
  const tol = 1e-7;
  const candidates = [
    wrapAround(phi - prep.psi0, center),
    wrapAround(-phi - prep.psi0, center),
  ];
  const inRange = candidates.filter(
    (b) => b >= prep.minBend - tol && b <= prep.maxBend + tol,
  );
  let bend: number;
  if (inRange.length === 0) {
    const dist = (b: number) =>
      b < prep.minBend ? prep.minBend - b : b - prep.maxBend;
    bend = dist(candidates[0]) <= dist(candidates[1])
      ? candidates[0]
      : candidates[1];
  } else if (inRange.length === 1 || Math.abs(inRange[0] - inRange[1]) < tol) {
    bend = inRange[0];
  } else if (memory.bend !== undefined) {
    // Both branches valid (straight-arm point is inside the limits): stay on the
    // branch we were on last frame, so the elbow never flips at full extension.
    const prev = memory.bend;
    bend =
      Math.abs(inRange[0] - prev) <= Math.abs(inRange[1] - prev)
        ? inRange[0]
        : inRange[1];
  } else {
    bend = Math.max(inRange[0], inRange[1]);
  }
  bend = MathUtils.clamp(bend, prep.minBend, prep.maxBend);

  // 2. Root→end direction and mid-joint side direction in the bind frame, with this bend.
  const vHat = new Vector3();
  const side = bendPlaneSide(prep, bend, new Vector3(), vHat);

  // 3. Pole vector: the bend plane contains root, target and pole.
  const pPerp = new Vector3().subVectors(pole, prep.root);
  pPerp.addScaledVector(d, -pPerp.dot(d));
  let poleDir: Vector3 | null = null;
  if (pPerp.lengthSq() > 1e-12) {
    poleDir = pPerp.normalize();
  } else if (memory.poleDir) {
    // pole is on the root→target line: reuse last frame's direction (no flip)
    const prev = memory.poleDir.clone();
    prev.addScaledVector(d, -prev.dot(d));
    if (prev.lengthSq() > 1e-12) poleDir = prev.normalize();
  }
  if (poleDir) memory.poleDir = poleDir.clone();

  // 4. Root rotation: (vHat, side) in the bind frame → (d, poleDir) now.
  const rootRotation = new Quaternion().setFromUnitVectors(vHat, d);
  if (poleDir) {
    const side1 = side.applyQuaternion(rootRotation);
    side1.addScaledVector(d, -side1.dot(d));
    if (side1.lengthSq() > 1e-12) {
      side1.normalize();
      const gamma = Math.atan2(
        d.dot(new Vector3().crossVectors(side1, poleDir)),
        side1.dot(poleDir),
      );
      rootRotation.premultiply(new Quaternion().setFromAxisAngle(d, gamma));
    }
  }
  memory.bend = bend;

  return {
    rootRotation,
    bend,
    distance,
    clampedDistance: c,
    reachable:
      distance >= prep.minReach - 1e-9 && distance <= prep.maxReach + 1e-9,
  };
}

export interface SwingTwistLimitResult {
  limited: boolean;
  swingRad: number;
  twistRad: number;
}

/**
 * Limit a joint-local rotation `q` (in place) with a cone on its swing and a
 * range on its twist about `axis` (unit, joint-local; the bone direction).
 * q = swing · twist, twist about `axis`.
 */
export function clampSwingTwist(
  q: Quaternion,
  axis: Vector3,
  maxSwingRad: number,
  maxTwistRad: number,
): SwingTwistLimitResult {
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const proj = axis.x * q.x + axis.y * q.y + axis.z * q.z;
  const twist = new Quaternion(axis.x * proj, axis.y * proj, axis.z * proj, q.w);
  if (twist.lengthSq() < EPS) twist.identity();
  else twist.normalize();
  const swing = q.clone().multiply(twist.clone().invert());

  let twistAngle = 2 * Math.atan2(
    axis.x * twist.x + axis.y * twist.y + axis.z * twist.z,
    twist.w,
  );
  twistAngle = wrapAround(twistAngle, 0);
  const swingAngle = 2 * Math.acos(MathUtils.clamp(Math.abs(swing.w), 0, 1));

  let limited = false;
  if (swingAngle > maxSwingRad) {
    const sAxis = new Vector3(swing.x, swing.y, swing.z);
    if (swing.w < 0) sAxis.negate();
    if (sAxis.lengthSq() > EPS) {
      swing.setFromAxisAngle(sAxis.normalize(), maxSwingRad);
      limited = true;
    }
  }
  const clampedTwist = MathUtils.clamp(twistAngle, -maxTwistRad, maxTwistRad);
  if (Math.abs(clampedTwist - twistAngle) > 1e-9) limited = true;
  twist.setFromAxisAngle(axis, clampedTwist);
  q.copy(swing).multiply(twist);
  return {
    limited,
    swingRad: Math.min(swingAngle, maxSwingRad),
    twistRad: clampedTwist,
  };
}

export interface EllipseSwingLimit {
  /** Unit axis (joint-local, ⟂ bone) whose positive rotation is the joint's positive pitch. */
  pitchAxis: Vector3;
  minPitchRad: number;
  maxPitchRad: number;
  /** Sideways swing (about bone × pitchAxis), ± this much. */
  sideMaxRad: number;
  maxTwistRad: number;
}

/**
 * Anatomical (elliptical) swing–twist limit for a joint such as the hip, in
 * place on the joint-local rotation `q`. q = swing · twist, twist about the bone
 * `axis`. The swing is written as a rotation vector s ⟂ bone with components
 * (pitch, side) on (pitchAxis, bone × pitchAxis). Pitch must lie in
 * [minPitch, maxPitch], and (pitch / P)² + (side / S)² ≤ 1 with P the pitch
 * limit on that side; outside, the vector is pulled back radially onto the
 * ellipse. So the joint swings mainly in its pitch plane (walking) and only a
 * little sideways, unlike a circular cone.
 */
export function clampSwingEllipse(
  q: Quaternion,
  axis: Vector3,
  lim: EllipseSwingLimit,
): SwingTwistLimitResult & { pitchRad: number; sideRad: number } {
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const proj = axis.x * q.x + axis.y * q.y + axis.z * q.z;
  const twist = new Quaternion(axis.x * proj, axis.y * proj, axis.z * proj, q.w);
  if (twist.lengthSq() < EPS) twist.identity();
  else twist.normalize();
  const swing = q.clone().multiply(twist.clone().invert());
  if (swing.w < 0) swing.set(-swing.x, -swing.y, -swing.z, -swing.w);

  let twistAngle = wrapAround(
    2 * Math.atan2(axis.x * twist.x + axis.y * twist.y + axis.z * twist.z, twist.w),
    0,
  );
  // swing as a rotation vector
  const v = new Vector3(swing.x, swing.y, swing.z);
  const sinHalf = v.length();
  const angle = 2 * Math.atan2(sinHalf, MathUtils.clamp(swing.w, -1, 1));
  const s = sinHalf > EPS ? v.multiplyScalar(angle / sinHalf) : v.set(0, 0, 0);
  const p = lim.pitchAxis.clone().addScaledVector(axis, -lim.pitchAxis.dot(axis)).normalize();
  const side = new Vector3().crossVectors(axis, p);
  let pitch = s.dot(p);
  let sideA = s.dot(side);

  let limited = false;
  const clampedPitch = MathUtils.clamp(pitch, lim.minPitchRad, lim.maxPitchRad);
  if (Math.abs(clampedPitch - pitch) > 1e-9) {
    pitch = clampedPitch;
    limited = true;
  }
  const P = pitch >= 0 ? lim.maxPitchRad : -lim.minPitchRad;
  const S = lim.sideMaxRad;
  if (S <= 0) {
    if (Math.abs(sideA) > 1e-9) limited = true;
    sideA = 0;
  } else if (P > 0) {
    const e = (pitch / P) ** 2 + (sideA / S) ** 2;
    if (e > 1 + 1e-12) {
      const k = 1 / Math.sqrt(e);
      pitch *= k;
      sideA *= k;
      limited = true;
    }
  } else if (Math.abs(sideA) > S) {
    sideA = Math.sign(sideA) * S;
    limited = true;
  }
  const clampedTwist = MathUtils.clamp(twistAngle, -lim.maxTwistRad, lim.maxTwistRad);
  if (Math.abs(clampedTwist - twistAngle) > 1e-9) limited = true;
  twistAngle = clampedTwist;

  const sv = p.multiplyScalar(pitch).addScaledVector(side, sideA);
  const sAngle = sv.length();
  if (sAngle > EPS) swing.setFromAxisAngle(sv.divideScalar(sAngle), sAngle);
  else swing.identity();
  twist.setFromAxisAngle(axis, twistAngle);
  q.copy(swing).multiply(twist);
  return {
    limited,
    swingRad: sAngle,
    twistRad: twistAngle,
    pitchRad: pitch,
    sideRad: sideA,
  };
}
