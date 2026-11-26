import { MathUtils, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import type { ArmPreviewRig } from "../mecha/types";
import { FOOT_IK_CONFIG, IK_CONFIG, JOINT_LIMITS } from "../mecha/rigConfig";
import type { Animator } from "./animator";
import { reachForBend, twoBoneEnd, twoBoneMid } from "./ik";

/**
 * T16 evaluation on the loaded rig: end-effector error over random reachable
 * targets, clamping behaviour for unreachable targets, and a smoothness sweep
 * through full extension. Targets are generated with our own FK inside the joint
 * limits, so "reachable" means reachable by distance AND by the limits.
 */

export interface IkEvalOptions {
  reachableSamples?: number;
  unreachableSamples?: number;
  sweepSteps?: number;
  seed?: number;
}

export interface ErrorSummary {
  count: number;
  limitedCount: number;
  meanM: number;
  medianM: number;
  p95M: number;
  maxM: number;
  fractionUnder1mm: number;
}

export interface IkEvalRow {
  i: number;
  target: [number, number, number];
  distance: number;
  /** For reachable rows: the bend used to generate the target. */
  sampleBendDeg?: number;
  bendDeg: number;
  /** Reachable: |hand − target|. Unreachable: |hand − closest reachable point on the ray|. */
  errorM: number;
  limited: boolean;
}

export interface IkSweepRow {
  step: number;
  distance: number;
  bendDeg: number;
  errorM: number;
  reachable: boolean;
  shoulderStepDeg: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function summarize(values: number[], limited: number): ErrorSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]
      : 0;
  return {
    count: values.length,
    limitedCount: limited,
    meanM: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
    medianM: at(0.5),
    p95M: at(0.95),
    maxM: sorted.length ? sorted[sorted.length - 1] : 0,
    fractionUnder1mm:
      values.filter((v) => v < 1e-3).length / Math.max(1, values.length),
  };
}

export function runIkEvaluation(
  animator: Animator,
  rig: ArmPreviewRig,
  opts: IkEvalOptions = {},
) {
  const reachableSamples = opts.reachableSamples ?? 500;
  const unreachableSamples = opts.unreachableSamples ?? 200;
  const sweepSteps = opts.sweepSteps ?? 240;
  const rand = mulberry32(opts.seed ?? 184);

  animator.reset();
  animator.setIkEnabled(true);
  animator.setIkWeightImmediate(1);
  const info = animator.ikChainInfo();
  const { prep, parent, rootBind, upperAxisLocal } = info;
  const rootBindInv = rootBind.clone().invert();
  const endJoint = rig.joints[IK_CONFIG.end];
  const rootJoint = rig.joints[IK_CONFIG.root];
  rig.displayRoot.updateMatrixWorld(true);

  const toDisplay = (p: Vector3) =>
    rig.displayRoot.worldToLocal(parent.localToWorld(p.clone()));
  const handDisplay = () =>
    rig.displayRoot.worldToLocal(endJoint.getWorldPosition(new Vector3()));
  const arr = (v: Vector3): [number, number, number] => [v.x, v.y, v.z];
  const randomUnit = () => {
    const v = new Vector3();
    do {
      v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    } while (v.lengthSq() > 1 || v.lengthSq() < 1e-6);
    return v.normalize();
  };
  /** Pole beside the elbow, pushed away from the shoulder→target line. */
  const poleFor = (elbow: Vector3, target: Vector3, fallback: Vector3) => {
    const line = new Vector3().subVectors(target, prep.root).normalize();
    const m = new Vector3().subVectors(elbow, prep.root);
    m.addScaledVector(line, -m.dot(line));
    if (m.length() < 1e-4) m.copy(fallback);
    return elbow.clone().add(m.setLength(IK_CONFIG.poleDistance));
  };
  const randomPerp = (d: Vector3) => {
    const p = randomUnit();
    p.addScaledVector(d, -p.dot(d));
    return p.lengthSq() > 1e-8 ? p.normalize() : new Vector3(0, 0, -1);
  };
  const bendRange = prep.maxBend - prep.minBend;

  // 1. Random reachable targets from our own FK inside the limits.
  const reachableRows: IkEvalRow[] = [];
  let reachableLimited = 0;
  for (let i = 0; i < reachableSamples; i++) {
    let axis = randomUnit().cross(upperAxisLocal);
    while (axis.lengthSq() < 1e-6) axis = randomUnit().cross(upperAxisLocal);
    axis.normalize();
    const offset = new Quaternion()
      .setFromAxisAngle(axis, rand() * info.maxSwingRad * 0.9)
      .multiply(
        new Quaternion().setFromAxisAngle(
          upperAxisLocal,
          (rand() * 2 - 1) * info.maxTwistRad * 0.9,
        ),
      );
    const Q = rootBind.clone().multiply(offset).multiply(rootBindInv);
    const bend = prep.minBend + (0.02 + 0.96 * rand()) * bendRange;
    const Tp = twoBoneEnd(prep, Q, bend);
    const Ep = twoBoneMid(prep, Q);
    const Pp = poleFor(Ep, Tp, randomPerp(Tp.clone().sub(prep.root).normalize()));
    const T = toDisplay(Tp);
    const P = toDisplay(Pp);
    animator.setIkPole(P.x, P.y, P.z);
    animator.setIkTarget(T.x, T.y, T.z);
    const s = animator.ikStatus();
    if (s.limited) reachableLimited++;
    reachableRows.push({
      i,
      target: arr(T),
      distance: s.distance,
      sampleBendDeg: MathUtils.radToDeg(bend),
      bendDeg: s.bendDeg,
      errorM: handDisplay().distanceTo(T),
      limited: s.limited,
    });
  }

  // 2. Unreachable targets: too far (arm straightens toward them) and too close.
  const closeBend =
    Math.abs(reachForBend(prep, prep.maxBend) - prep.minReach) <=
    Math.abs(reachForBend(prep, prep.minBend) - prep.minReach)
      ? prep.maxBend
      : prep.minBend;
  const farRows: IkEvalRow[] = [];
  const closeRows: IkEvalRow[] = [];
  let farLimited = 0;
  let closeLimited = 0;
  for (let i = 0; i < unreachableSamples; i++) {
    const d = randomUnit();
    const far = prep.maxReach * (1.2 + 0.8 * rand());
    const Tp = prep.root.clone().addScaledVector(d, far);
    const ideal = toDisplay(prep.root.clone().addScaledVector(d, prep.maxReach));
    const Pp = prep.root.clone().addScaledVector(d, 0.5 * far).addScaledVector(randomPerp(d), IK_CONFIG.poleDistance);
    const T = toDisplay(Tp);
    const P = toDisplay(Pp);
    animator.setIkPole(P.x, P.y, P.z);
    animator.setIkTarget(T.x, T.y, T.z);
    const s = animator.ikStatus();
    if (s.limited) farLimited++;
    farRows.push({
      i,
      target: arr(T),
      distance: s.distance,
      bendDeg: s.bendDeg,
      errorM: handDisplay().distanceTo(ideal),
      limited: s.limited,
    });

    const nearDist = prep.minReach * (0.2 + 0.6 * rand());
    const Tn = toDisplay(prep.root.clone().addScaledVector(d, nearDist));
    animator.setIkTarget(Tn.x, Tn.y, Tn.z);
    const sn = animator.ikStatus();
    if (sn.limited) closeLimited++;
    closeRows.push({
      i,
      target: arr(Tn),
      distance: sn.distance,
      bendDeg: sn.bendDeg,
      // too close: the elbow should sit on the bend limit that gives minReach
      errorM: Math.abs(MathUtils.degToRad(sn.bendDeg) - closeBend),
      limited: sn.limited,
    });
  }

  // 3. Sweep the target outward along one line through full extension.
  const sweepRows: IkSweepRow[] = [];
  const midBend = prep.minBend + 0.5 * bendRange;
  const sweepDir = twoBoneEnd(prep, new Quaternion(), midBend)
    .sub(prep.root)
    .normalize();
  const sweepPole = poleFor(
    twoBoneMid(prep, new Quaternion()),
    prep.root.clone().add(sweepDir),
    randomPerp(sweepDir),
  );
  const Psw = toDisplay(sweepPole);
  animator.setIkPole(Psw.x, Psw.y, Psw.z);
  const d0 = prep.minReach * 0.9;
  const d1 = prep.maxReach * 1.3;
  const prevShoulder = new Quaternion();
  let maxBendStep = 0;
  let maxShoulderStep = 0;
  let increasing = 0;
  let decreasing = 0;
  for (let k = 0; k <= sweepSteps; k++) {
    const dist = d0 + ((d1 - d0) * k) / sweepSteps;
    const T = toDisplay(prep.root.clone().addScaledVector(sweepDir, dist));
    animator.setIkTarget(T.x, T.y, T.z);
    const s = animator.ikStatus();
    const shoulderStep =
      k === 0 ? 0 : MathUtils.radToDeg(rootJoint.quaternion.angleTo(prevShoulder));
    prevShoulder.copy(rootJoint.quaternion);
    if (k > 0) {
      const db = s.bendDeg - sweepRows[k - 1].bendDeg;
      maxBendStep = Math.max(maxBendStep, Math.abs(db));
      if (db > 1e-7) increasing++;
      if (db < -1e-7) decreasing++;
    }
    maxShoulderStep = Math.max(maxShoulderStep, shoulderStep);
    sweepRows.push({
      step: k,
      distance: dist,
      bendDeg: s.bendDeg,
      errorM: s.reachable ? handDisplay().distanceTo(T) : NaN,
      reachable: s.reachable,
      shoulderStepDeg: shoulderStep,
    });
  }

  animator.setIkEnabled(false);
  animator.setIkWeightImmediate(0);
  animator.reset();

  return {
    chain: {
      upperLength: prep.upperLength,
      lowerLength: prep.lowerLength,
      minReach: prep.minReach,
      maxReach: prep.maxReach,
      minBendDeg: MathUtils.radToDeg(prep.minBend),
      maxBendDeg: MathUtils.radToDeg(prep.maxBend),
      shoulderSwingMaxDeg: IK_CONFIG.shoulderSwingMaxDeg,
      shoulderTwistMaxDeg: IK_CONFIG.shoulderTwistMaxDeg,
    },
    reachable: {
      summary: summarize(
        reachableRows.map((r) => r.errorM),
        reachableLimited,
      ),
      rows: reachableRows,
    },
    unreachableFar: {
      summary: summarize(
        farRows.map((r) => r.errorM),
        farLimited,
      ),
      /** Same, excluding directions the shoulder cone cannot point at. */
      summaryWithinShoulderLimits: summarize(
        farRows.filter((r) => !r.limited).map((r) => r.errorM),
        0,
      ),
      rows: farRows,
    },
    /** errorM here is |bend − bend limit| in radians, not meters. */
    tooClose: {
      summary: summarize(
        closeRows.map((r) => r.errorM),
        closeLimited,
      ),
      rows: closeRows,
    },
    sweep: {
      fromDistance: d0,
      toDistance: d1,
      maxBendStepDeg: maxBendStep,
      maxShoulderStepDeg: maxShoulderStep,
      bendMonotonic: increasing === 0 || decreasing === 0,
      rows: sweepRows,
    },
  };
}

export type IkEvaluationReport = ReturnType<typeof runIkEvaluation>;

// ── Foot planting (T16 step 7) ─────────────────────────────────────────────

export interface FootEvalOptions {
  /** Knee angles sampled from 0 to the knee limit. */
  steps?: number;
  /** Crouch depths sampled for the reach sweep. */
  sweepSteps?: number;
}

export interface FootCrouchRow {
  step: number;
  /** FK crouch: hip = ankle = knee / 2 (the "Crouch" test pose family). */
  kneeDeg: number;
  /** Pelvis drop the FK crouch produces after grounding (m). Used as the IK crouch depth. */
  dropM: number;
  /** Worst horizontal (XZ) ankle displacement from the standing pose, either foot (m). */
  fkSlideM: number;
  fkDisp3dM: number;
  ikSlideM: number;
  ikDisp3dM: number;
  /** Worst angle between the foot's orientation and its planted orientation (deg). */
  ikFootTiltDeg: number;
  ikReachable: boolean;
  ikLimited: boolean;
}

export function runFootEvaluation(
  animator: Animator,
  rig: ArmPreviewRig,
  opts: FootEvalOptions = {},
) {
  const steps = opts.steps ?? 27;
  const sweepSteps = opts.sweepSteps ?? 50;
  const { joints, displayRoot } = rig;
  const legs = FOOT_IK_CONFIG.legs;
  const toModel = (o: Object3D) => {
    displayRoot.updateMatrixWorld(true);
    return displayRoot.worldToLocal(o.getWorldPosition(new Vector3()));
  };
  const ankles = () => legs.map((l) => toModel(joints[l.end]));
  const ankleModelQ = () => {
    const rootInv = displayRoot.getWorldQuaternion(new Quaternion()).invert();
    return legs.map((l) =>
      rootInv.clone().multiply(joints[l.end].getWorldQuaternion(new Quaternion())),
    );
  };
  const displacement = (from: Vector3[], to: Vector3[]) => {
    let slide = 0;
    let d3 = 0;
    from.forEach((a, i) => {
      const b = to[i];
      slide = Math.max(slide, Math.hypot(b.x - a.x, b.z - a.z));
      d3 = Math.max(d3, a.distanceTo(b));
    });
    return { slide, d3 };
  };

  animator.setCrouch(0);
  animator.setFootIkEnabled(false);
  animator.setFootWeightImmediate(0);
  animator.reset();
  const standing = ankles();
  const standingPelvisY = toModel(joints.pelvis).y;

  // FK crouch (no IK): the existing grounding only fixes height.
  const kneeMax = JOINT_LIMITS[legs[0].mid][1];
  const rows: FootCrouchRow[] = [];
  for (let s = 0; s <= steps; s++) {
    const k = (kneeMax * s) / steps;
    animator.manual({
      rightHip: k / 2,
      leftHip: k / 2,
      rightKnee: k,
      leftKnee: k,
      rightAnkle: k / 2,
      leftAnkle: k / 2,
    });
    const drop = standingPelvisY - toModel(joints.pelvis).y;
    const fk = displacement(standing, ankles());
    rows.push({
      step: s,
      kneeDeg: k,
      dropM: drop,
      fkSlideM: fk.slide,
      fkDisp3dM: fk.d3,
      ikSlideM: NaN,
      ikDisp3dM: NaN,
      ikFootTiltDeg: NaN,
      ikReachable: false,
      ikLimited: false,
    });
  }

  // Foot planting at the same pelvis drops, from the standing pose.
  animator.reset();
  animator.setFootIkEnabled(true);
  animator.setFootWeightImmediate(1);
  const plantQ = ankleModelQ();
  for (const row of rows) {
    animator.setCrouch(row.dropM);
    const ik = displacement(standing, ankles());
    const q = ankleModelQ();
    const st = animator.footStatus();
    row.ikSlideM = ik.slide;
    row.ikDisp3dM = ik.d3;
    row.ikFootTiltDeg = MathUtils.radToDeg(
      Math.max(...q.map((qi, i) => qi.angleTo(plantQ[i]))),
    );
    row.ikReachable = st.reachable;
    row.ikLimited = st.limited;
  }

  // How deep can the pelvis go before an ankle can no longer be reached?
  let maxReachableCrouch = 0;
  for (let s = 0; s <= sweepSteps; s++) {
    const depth = (FOOT_IK_CONFIG.maxCrouch * s) / sweepSteps;
    animator.setCrouch(depth);
    const st = animator.footStatus();
    if (st.reachable && !st.limited && st.error < 1e-4) maxReachableCrouch = depth;
    else break;
  }

  const kneeLimitDeg = kneeMax;
  animator.setCrouch(0);
  animator.setFootIkEnabled(false);
  animator.setFootWeightImmediate(0);
  animator.reset();

  const ok = rows.filter((r) => r.ikReachable && !r.ikLimited);
  return {
    kneeLimitDeg,
    maxCrouchSetting: FOOT_IK_CONFIG.maxCrouch,
    maxReachableCrouchM: maxReachableCrouch,
    fkMaxSlideM: Math.max(...rows.map((r) => r.fkSlideM)),
    fkMaxDisp3dM: Math.max(...rows.map((r) => r.fkDisp3dM)),
    ikMaxSlideM: ok.length ? Math.max(...ok.map((r) => r.ikSlideM)) : NaN,
    ikMaxDisp3dM: ok.length ? Math.max(...ok.map((r) => r.ikDisp3dM)) : NaN,
    ikMaxFootTiltDeg: ok.length
      ? Math.max(...ok.map((r) => r.ikFootTiltDeg))
      : NaN,
    ikReachableRows: ok.length,
    rows,
  };
}

export type FootEvaluationReport = ReturnType<typeof runFootEvaluation>;
