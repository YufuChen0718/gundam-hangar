import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import type {
  ArmPreviewRig,
  JointAngles,
  JointName,
  PoseInput,
  SkirtJointName,
} from "../mecha/types";
import { JOINTS } from "../mecha/types";
import {
  clampJointAngle,
  FOOT_IK_CONFIG,
  IK_CONFIG,
  JOINT_LIMITS,
  jointAngleToEuler,
  jointQuatToAngle,
  normalizePoseInput,
  SKIRT_FK_CONFIG,
} from "../mecha/rigConfig";
import { CLIPS, raiseArm } from "./clips";
import type { ActionName, AnimatorStatus, TransitionMode } from "./clips";
import {
  compileClip,
  emptyPose,
  samplePelvisDrop,
  samplePose,
} from "./samplePose";
import type { PreparedClip } from "./samplePose";
import {
  bendPlaneSide,
  clampSwingEllipse,
  clampSwingTwist,
  prepareTwoBone,
  solveTwoBone,
} from "./ik";
import type { EllipseSwingLimit, PreparedTwoBone, TwoBoneMemory } from "./ik";
import type { Object3D } from "three";

/** Result of solving one two-bone chain this frame. */
export interface ChainSolveStatus {
  /** Target distance is within [minReach, maxReach]. */
  reachable: boolean;
  /** The shoulder swing/twist limit had to clamp the solution. */
  limited: boolean;
  /** |end effector − target| after solving, displayRoot space (m). */
  error: number;
  /** |target − shoulder| (m). */
  distance: number;
  minReach: number;
  maxReach: number;
  /** Elbow bend from IK (deg). */
  bendDeg: number;
  /** Shoulder swing away from bind (deg). */
  swingDeg: number;
  /** Shoulder twist about the upper arm (deg). */
  twistDeg: number;
}

/** Snapshot of the right-arm IK layer, for the UI, diagnostics and evaluation. */
export interface IkStatus extends ChainSolveStatus {
  enabled: boolean;
  /** Blend weight actually applied this frame (smoothstep of the ramp), 0..1. */
  weight: number;
}

/** Snapshot of the foot-planting layer (both legs). */
export interface FootIkStatus {
  enabled: boolean;
  weight: number;
  /** Pelvis drop actually applied this frame, m: max(requested crouch, autoDrop). */
  crouch: number;
  /** Drop needed so both planted ankles are within reach (spread feet), m. */
  autoDrop: number;
  /** Horizontal pelvis shift toward the feet midpoint, m. */
  pelvisShift: number;
  /** Pelvis yaw following the foot-to-foot line, deg. */
  pelvisYawDeg: number;
  /** Both ankles can reach their planted positions. */
  reachable: boolean;
  /** A hip swing/twist limit clamped either leg. */
  limited: boolean;
  /** Worst |ankle − planted position| of the two legs (m). */
  error: number;
  /** [right, left], in FOOT_IK_CONFIG.legs order. */
  legs: FootLegStatus[];
}

export interface FootLegStatus extends ChainSolveStatus {
  /** Ankle offset the foot needs to stay at its planted orientation (deg, XYZ Euler of bind⁻¹·desired). */
  ankleWantDeg: [number, number, number];
  /** Angle between the foot's planted and achieved orientation (deg). */
  footTiltDeg: number;
}

interface ChainSpec {
  root: JointName;
  mid: JointName;
  end: JointName;
  swingMaxDeg: number;
  twistMaxDeg: number;
  /** Anatomical root limit: pitch from JOINT_LIMITS[root], small sideways swing. */
  sideMaxDeg?: number;
}

const ARM_CHAIN: ChainSpec = {
  root: IK_CONFIG.root,
  mid: IK_CONFIG.mid,
  end: IK_CONFIG.end,
  swingMaxDeg: IK_CONFIG.shoulderSwingMaxDeg,
  twistMaxDeg: IK_CONFIG.shoulderTwistMaxDeg,
};

const LEG_CHAINS: ChainSpec[] = FOOT_IK_CONFIG.legs.map((l) => ({
  ...l,
  swingMaxDeg: 180,
  twistMaxDeg: FOOT_IK_CONFIG.hipTwistMaxDeg,
  sideMaxDeg: FOOT_IK_CONFIG.hipSideMaxDeg,
}));

const EMPTY_CHAIN_STATUS: ChainSolveStatus = {
  reachable: true,
  limited: false,
  error: 0,
  distance: 0,
  minReach: 0,
  maxReach: 0,
  bendDeg: 0,
  swingDeg: 0,
  twistDeg: 0,
};

/** Chain data the evaluation code needs to sample poses with our own FK. */
export interface IkChainInfo {
  prep: PreparedTwoBone;
  /** Parent of the shoulder: root-parent space of `prep`. */
  parent: Object3D;
  rootBind: Quaternion;
  /** Upper-arm direction in the shoulder's local frame (twist axis). */
  upperAxisLocal: Vector3;
  maxSwingRad: number;
  maxTwistRad: number;
  /** Set for chains with an anatomical (elliptical) root limit, e.g. hips. */
  ellipse?: EllipseSwingLimit;
}

function smoothstep01(u: number): number {
  const x = MathUtils.clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
}

export class Animator {
  action: ActionName = "idle";
  status: AnimatorStatus = "holding";
  transitionMode: TransitionMode = "blend";
  transitionDuration = 0.3;
  time = 0;
  playing = false;

  private compiledClips: Record<ActionName, PreparedClip> = {
    idle: compileClip(CLIPS.idle),
    aim: compileClip(CLIPS.aim),
    swing: compileClip(CLIPS.swing),
    squat: compileClip(CLIPS.squat),
  };
  private demoClip = compileClip(raiseArm);
  private activeClip: PreparedClip = this.demoClip;
  private pose = emptyPose();
  private start = emptyPose();
  private temp = emptyPose();
  private blendElapsed = 1;
  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpQ = new Quaternion();
  private tmpSkirtEuler = new Euler();
  private tmpSkirtQ = new Quaternion();
  private lastSkirtAngles: Record<SkirtJointName, number> = {
    frontRightSkirt: 0,
    frontLeftSkirt: 0,
    sideRightSkirt: 0,
    sideLeftSkirt: 0,
    rearRightSkirt: 0,
    rearLeftSkirt: 0,
  };

  // ── Two-bone IK layer (T16) ────────────────────────────────────────────
  private ikEnabled = false;
  /** Linear ramp 0..1; the applied weight is smoothstep(ikRamp). */
  private ikRamp = 0;
  /** Target and pole in displayRoot space. */
  private ikTarget = new Vector3();
  private ikPole = new Vector3();
  private ikHasTarget = false;
  private chainCache = new Map<
    JointName,
    { rig: ArmPreviewRig; info: IkChainInfo }
  >();
  private ikMemory: TwoBoneMemory = {};
  private ikLast: IkStatus = {
    ...EMPTY_CHAIN_STATUS,
    enabled: false,
    weight: 0,
  };
  private ikTmpT = new Vector3();
  private ikTmpP = new Vector3();
  private ikTmpQ = new Quaternion();
  private ikTmpQ2 = new Quaternion();

  // ── Foot planting layer (T16 step 7) ──────────────────────────────────
  private footEnabled = false;
  private footRamp = 0;
  /** Requested pelvis drop (m); applied as crouch × weight. */
  private crouchDepth = 0;
  private footHasPlant = false;
  /** Planted ankle positions and orientations, displayRoot space, [right, left]. */
  private footPlant = [new Vector3(), new Vector3()];
  private footPlantQ = [new Quaternion(), new Quaternion()];
  private footMemory: TwoBoneMemory[] = [{}, {}];
  /** Ankle positions when the feet were planted: reference for the body follow. */
  private footRest = [new Vector3(), new Vector3()];
  /** User-dragged knee poles (displayRoot space); null = automatic. */
  private footPoleOverride: (Vector3 | null)[] = [null, null];
  /** Knee poles actually used last solve (displayRoot space), for the gizmo. */
  private footPoleUsed = [new Vector3(), new Vector3()];
  /** Pelvis offset applied last frame, undone first on rigs without grounding. */
  private footAppliedOffset = new Vector3();
  /** Pelvis drop keyed by the active clip (e.g. squat), blended like the pose. */
  private clipDrop = 0;
  private startDrop = 0;
  private footLast: FootIkStatus = {
    enabled: false,
    weight: 0,
    crouch: 0,
    autoDrop: 0,
    pelvisShift: 0,
    pelvisYawDeg: 0,
    reachable: true,
    limited: false,
    error: 0,
    legs: [0, 1].map(() => ({
      ...EMPTY_CHAIN_STATUS,
      ankleWantDeg: [0, 0, 0] as [number, number, number],
      footTiltDeg: 0,
    })),
  };

  constructor(private rig: ArmPreviewRig) {}

  setRig(rig: ArmPreviewRig) {
    this.rig = rig;
    this.chainCache.clear();
    this.ikMemory = {};
    this.footHasPlant = false;
    this.footMemory = [{}, {}];
    this.footPoleOverride = [null, null];
    this.footAppliedOffset.set(0, 0, 0);
    this.apply();
  }

  reapply() {
    this.apply();
  }

  skirtAngles(): Record<SkirtJointName, number> {
    return { ...this.lastSkirtAngles };
  }

  get duration(): number {
    return this.activeClip.duration;
  }

  /**
   * Start pose of a transition: the FK pose currently shown (this.pose is kept
   * equal to bind⁻¹ · joint after apply()'s clamp). Taken from this.pose rather
   * than the joints so IK / body-follow offsets are not baked into the blend.
   */
  private snapshotCurrentPose() {
    for (const j of JOINTS) this.start[j].copy(this.pose[j]);
    this.startDrop = this.clipDrop;
  }

  private apply() {
    for (const j of JOINTS) {
      const rawDeg = jointQuatToAngle(j, this.pose[j]);
      const clampedDeg = clampJointAngle(j, rawDeg);
      if (Math.abs(rawDeg - clampedDeg) > 1e-6) {
        this.pose[j].setFromEuler(jointAngleToEuler(j, clampedDeg));
      }
      this.rig.joints[j].quaternion
        .copy(this.rig.bindPose[j])
        .multiply(this.pose[j]);
    }
    if (this.rig.pelvisBindPosition && this.rig.bindAnkleY !== undefined) {
      this.rig.joints.pelvis.position.copy(this.rig.pelvisBindPosition);
      this.rig.displayRoot.updateMatrixWorld(true);
      this.rig.joints.leftAnkle.getWorldPosition(this.tmpA);
      this.rig.joints.rightAnkle.getWorldPosition(this.tmpB);
      this.rig.displayRoot.worldToLocal(this.tmpA);
      this.rig.displayRoot.worldToLocal(this.tmpB);
      let dy = this.rig.bindAnkleY - Math.min(this.tmpA.y, this.tmpB.y);
      if (this.rig.footGroundSamples && this.rig.footGroundSamples.length > 0) {
        let minFootY = Infinity;
        for (const s of this.rig.footGroundSamples) {
          this.tmpA.copy(s.localPoint);
          s.ankleJoint.localToWorld(this.tmpA);
          this.rig.displayRoot.worldToLocal(this.tmpA);
          if (this.tmpA.y < minFootY) minFootY = this.tmpA.y;
        }
        const targetFloor = this.rig.bindFootMinY ?? 0;
        if (Number.isFinite(minFootY) && minFootY + dy < targetFloor - 1e-4) {
          dy = targetFloor - minFootY;
        }
      }
      this.rig.joints.pelvis.position.y += dy;
      this.rig.displayRoot.updateMatrixWorld(true);
    } else {
      this.rig.displayRoot.updateMatrixWorld(true);
    }
    // Foot planting runs after grounding (it lowers the pelvis from the grounded
    // height and pins the ankles), then skirts follow the final hip angles, and
    // the arm IK runs last because it needs the torso's final world transform.
    this.applyFootIk();
    this.applySkirts();
    this.applyIk();
    this.rig.lbs?.updateBoneMatrices();
  }

  /**
   * Secondary skirt armor FK (Requirement 6): driven from hip pitch. Reads the
   * hip joints themselves so foot planting (which re-solves the hips) is followed.
   */
  private applySkirts() {
    const rigidActive = (this.rig.lbs?.getMode() ?? "rigid") === "rigid";
    const hipDeg = (j: "rightHip" | "leftHip") =>
      clampJointAngle(
        j,
        jointQuatToAngle(
          j,
          this.tmpQ
            .copy(this.rig.bindPose[j])
            .invert()
            .multiply(this.rig.joints[j].quaternion),
        ),
      );
    const rightHipDeg = rigidActive ? hipDeg("rightHip") : 0;
    const leftHipDeg = rigidActive ? hipDeg("leftHip") : 0;
    const frontRightDeg = MathUtils.clamp(
      SKIRT_FK_CONFIG.frontK * rightHipDeg,
      0,
      SKIRT_FK_CONFIG.frontMaxDeg,
    );
    const frontLeftDeg = MathUtils.clamp(
      SKIRT_FK_CONFIG.frontK * leftHipDeg,
      0,
      SKIRT_FK_CONFIG.frontMaxDeg,
    );
    const sideRightDeg = MathUtils.clamp(
      SKIRT_FK_CONFIG.sideK * rightHipDeg,
      0,
      SKIRT_FK_CONFIG.sideMaxDeg,
    );
    const sideLeftDeg = MathUtils.clamp(
      SKIRT_FK_CONFIG.sideK * leftHipDeg,
      0,
      SKIRT_FK_CONFIG.sideMaxDeg,
    );
    const rearRightDeg = MathUtils.clamp(
      SKIRT_FK_CONFIG.rearK * Math.max(0, -rightHipDeg),
      0,
      SKIRT_FK_CONFIG.rearMaxDeg,
    );
    const rearLeftDeg = MathUtils.clamp(
      SKIRT_FK_CONFIG.rearK * Math.max(0, -leftHipDeg),
      0,
      SKIRT_FK_CONFIG.rearMaxDeg,
    );
    this.lastSkirtAngles = {
      frontRightSkirt: frontRightDeg,
      frontLeftSkirt: frontLeftDeg,
      sideRightSkirt: sideRightDeg,
      sideLeftSkirt: sideLeftDeg,
      rearRightSkirt: rearRightDeg,
      rearLeftSkirt: rearLeftDeg,
    };
    if (this.rig.skirtJoints && this.rig.skirtBindPose) {
      const applySkirt = (
        name: SkirtJointName,
        rxDeg: number,
        rzDeg: number,
      ) => {
        const joint = this.rig.skirtJoints?.[name];
        const bind = this.rig.skirtBindPose?.[name];
        if (!joint || !bind) return;
        this.tmpSkirtEuler.set(
          MathUtils.degToRad(rxDeg),
          0,
          MathUtils.degToRad(rzDeg),
          "XYZ",
        );
        this.tmpSkirtQ.setFromEuler(this.tmpSkirtEuler);
        joint.quaternion.copy(bind).multiply(this.tmpSkirtQ);
      };
      // Front skirts swing forward (-X); side skirts flare outward (-Z right, +Z left); rear skirts swing back (+X)
      applySkirt("frontRightSkirt", -frontRightDeg, 0);
      applySkirt("frontLeftSkirt", -frontLeftDeg, 0);
      applySkirt("sideRightSkirt", 0, -sideRightDeg);
      applySkirt("sideLeftSkirt", 0, sideLeftDeg);
      applySkirt("rearRightSkirt", rearRightDeg, 0);
      applySkirt("rearLeftSkirt", rearLeftDeg, 0);
      // skirts are leaves; refresh their world matrices for skinning
      for (const name of Object.keys(this.rig.skirtJoints) as SkirtJointName[])
        this.rig.skirtJoints[name]?.updateMatrixWorld(true);
    }
  }

  // ── Two-bone IK ────────────────────────────────────────────────────────

  /** Right-arm chain (shoulder → elbow → wrist) in shoulder-parent space. */
  ikChainInfo(): IkChainInfo {
    return this.chainInfo(ARM_CHAIN);
  }

  /** Leg chain (hip → knee → ankle) in hip-parent space; 0 = right, 1 = left. */
  footChainInfo(leg: 0 | 1): IkChainInfo {
    return this.chainInfo(LEG_CHAINS[leg]);
  }

  /** Build (once per rig) the bind-pose chain geometry in root-parent space. */
  private chainInfo(spec: ChainSpec): IkChainInfo {
    const cached = this.chainCache.get(spec.root);
    if (cached && cached.rig === this.rig) return cached.info;
    const { joints, bindPose } = this.rig;
    const rootJ = joints[spec.root];
    const midJ = joints[spec.mid];
    const endJ = joints[spec.end];
    const parent = rootJ.parent;
    if (!parent) throw new Error(`IK root joint ${spec.root} has no parent`);

    const savedRoot = rootJ.quaternion.clone();
    const savedMid = midJ.quaternion.clone();
    rootJ.quaternion.copy(bindPose[spec.root]);
    midJ.quaternion.copy(bindPose[spec.mid]);
    parent.updateWorldMatrix(true, false);
    rootJ.updateMatrixWorld(true);
    const toParent = (o: Object3D) =>
      parent.worldToLocal(o.getWorldPosition(new Vector3()));
    const S = toParent(rootJ);
    const E = toParent(midJ);
    const W = toParent(endJ);
    rootJ.quaternion.copy(savedRoot);
    midJ.quaternion.copy(savedMid);
    rootJ.updateMatrixWorld(true);

    // Hinge axis: the axis jointAngleToEuler(mid, +θ) rotates about, in the elbow's
    // local frame, carried into shoulder-parent space by the bind rotations.
    const unit = new Quaternion().setFromEuler(
      jointAngleToEuler(spec.mid, 45),
    );
    const hinge = new Vector3(unit.x, unit.y, unit.z)
      .normalize()
      .applyQuaternion(
        bindPose[spec.root].clone().multiply(bindPose[spec.mid]),
      );
    const [minDeg, maxDeg] = JOINT_LIMITS[spec.mid];
    const prep = prepareTwoBone({
      root: S,
      mid: E,
      end: W,
      hingeAxis: hinge,
      minBend: MathUtils.degToRad(minDeg),
      maxBend: MathUtils.degToRad(maxDeg),
    });
    const info: IkChainInfo = {
      prep,
      parent,
      rootBind: bindPose[spec.root].clone(),
      upperAxisLocal: midJ.position.clone().normalize(),
      maxSwingRad: MathUtils.degToRad(spec.swingMaxDeg),
      maxTwistRad: MathUtils.degToRad(spec.twistMaxDeg),
    };
    if (spec.sideMaxDeg !== undefined) {
      const u = new Quaternion().setFromEuler(jointAngleToEuler(spec.root, 45));
      const [minP, maxP] = JOINT_LIMITS[spec.root];
      info.ellipse = {
        pitchAxis: new Vector3(u.x, u.y, u.z).normalize(),
        minPitchRad: MathUtils.degToRad(minP),
        maxPitchRad: MathUtils.degToRad(maxP),
        sideMaxRad: MathUtils.degToRad(spec.sideMaxDeg),
        maxTwistRad: info.maxTwistRad,
      };
    }
    this.chainCache.set(spec.root, { rig: this.rig, info });
    return info;
  }

  /**
   * Solve one chain for a target and pole given in displayRoot space and write
   * root + mid joints, blended by `weight` from the clip / manual pose. The
   * chain's parent world matrix must be current. this.pose is left untouched,
   * so ramping the weight down returns to the clip without a jump.
   */
  private solveChain(
    spec: ChainSpec,
    targetModel: Vector3,
    poleModel: Vector3,
    memory: TwoBoneMemory,
    weight: number,
  ): ChainSolveStatus {
    const info = this.chainInfo(spec);
    const { joints, bindPose, displayRoot } = this.rig;
    const rootJ = joints[spec.root];
    const midJ = joints[spec.mid];
    const endJ = joints[spec.end];

    // displayRoot space → root-parent space, using this frame's parent transform
    const T = this.ikTmpT.copy(targetModel);
    displayRoot.localToWorld(T);
    info.parent.worldToLocal(T);
    const P = this.ikTmpP.copy(poleModel);
    displayRoot.localToWorld(P);
    info.parent.worldToLocal(P);

    const sol = solveTwoBone(info.prep, T, P, memory);

    // Root: parent-space rotation Q → local offset = bind⁻¹ · Q · bind, then limit.
    const rootOffset = this.ikTmpQ
      .copy(info.rootBind)
      .invert()
      .multiply(sol.rootRotation)
      .multiply(info.rootBind);
    const lim = info.ellipse
      ? clampSwingEllipse(rootOffset, info.upperAxisLocal, info.ellipse)
      : clampSwingTwist(
          rootOffset,
          info.upperAxisLocal,
          info.maxSwingRad,
          info.maxTwistRad,
        );
    const bendDeg = MathUtils.radToDeg(sol.bend);
    const midOffset = this.ikTmpQ2.setFromEuler(
      jointAngleToEuler(spec.mid, bendDeg),
    );

    rootJ.quaternion
      .copy(bindPose[spec.root])
      .multiply(this.tmpQ.copy(this.pose[spec.root]).slerp(rootOffset, weight));
    midJ.quaternion
      .copy(bindPose[spec.mid])
      .multiply(this.tmpQ.copy(this.pose[spec.mid]).slerp(midOffset, weight));
    rootJ.updateMatrixWorld(true);

    const end = displayRoot.worldToLocal(endJ.getWorldPosition(new Vector3()));
    return {
      reachable: sol.reachable,
      limited: lim.limited,
      error: end.distanceTo(targetModel),
      distance: sol.distance,
      minReach: info.prep.minReach,
      maxReach: info.prep.maxReach,
      bendDeg,
      swingDeg: MathUtils.radToDeg(lim.swingRad),
      twistDeg: MathUtils.radToDeg(lim.twistRad),
    };
  }

  private ikActive(): boolean {
    return this.ikEnabled || this.ikRamp > 0;
  }

  private footActive(): boolean {
    return this.footEnabled || this.footRamp > 0;
  }

  private stepRamp(ramp: number, on: boolean, dt: number): number {
    const goal = on ? 1 : 0;
    if (this.transitionMode === "cut" || !(this.transitionDuration > 0))
      return goal;
    if (!Number.isFinite(dt) || dt <= 0) return ramp;
    const step = dt / this.transitionDuration;
    return goal > ramp
      ? Math.min(goal, ramp + step)
      : Math.max(goal, ramp - step);
  }

  /** Advance the IK on/off ramps. Same duration and smoothstep as clip blending. */
  private advanceIk(dt: number) {
    this.ikRamp = this.stepRamp(this.ikRamp, this.ikEnabled, dt);
    this.footRamp = this.stepRamp(this.footRamp, this.footEnabled, dt);
  }

  /** Default target = current hand position; default pole = beside the current elbow. */
  private initIkTargets() {
    const { joints, displayRoot } = this.rig;
    const S = joints[IK_CONFIG.root].getWorldPosition(new Vector3());
    const E = joints[IK_CONFIG.mid].getWorldPosition(new Vector3());
    const W = joints[IK_CONFIG.end].getWorldPosition(new Vector3());
    displayRoot.worldToLocal(S);
    displayRoot.worldToLocal(E);
    displayRoot.worldToLocal(W);
    this.ikTarget.copy(W);
    const line = new Vector3().subVectors(W, S);
    const offset = new Vector3().subVectors(E, S);
    if (line.lengthSq() > 1e-12) {
      line.normalize();
      offset.addScaledVector(line, -offset.dot(line));
    }
    if (offset.length() > 1e-3) {
      offset.setLength(IK_CONFIG.poleDistance);
      this.ikPole.copy(E).add(offset);
    } else {
      const [x, y, z] = IK_CONFIG.defaultPoleOffset;
      this.ikPole.copy(E).add(new Vector3(x, y, z));
    }
    this.ikHasTarget = true;
  }

  private applyIk() {
    const weight = smoothstep01(this.ikRamp);
    if (!(weight > 0)) {
      if (this.ikLast.weight !== 0 || this.ikLast.enabled !== this.ikEnabled)
        this.ikLast = { ...this.ikLast, enabled: this.ikEnabled, weight: 0 };
      return;
    }
    if (!this.ikHasTarget) this.initIkTargets();
    const res = this.solveChain(
      ARM_CHAIN,
      this.ikTarget,
      this.ikPole,
      this.ikMemory,
      weight,
    );
    this.ikLast = { ...res, enabled: this.ikEnabled, weight };
  }

  // ── Foot planting ──────────────────────────────────────────────────────

  /** Plant both feet where the current (grounded, un-crouched) pose puts them. */
  private captureFootPlant() {
    const { joints, displayRoot } = this.rig;
    const rootInv = displayRoot.getWorldQuaternion(new Quaternion()).invert();
    LEG_CHAINS.forEach((spec, i) => {
      const ankle = joints[spec.end];
      this.footPlant[i].copy(
        displayRoot.worldToLocal(ankle.getWorldPosition(new Vector3())),
      );
      this.footPlantQ[i]
        .copy(rootInv)
        .multiply(ankle.getWorldQuaternion(new Quaternion()));
      this.footRest[i].copy(this.footPlant[i]);
    });
    this.footMemory = [{}, {}];
    this.footHasPlant = true;
  }

  /** Rotate a joint about the model's vertical axis (+Y of displayRoot). */
  private yawJointInModel(j: JointName, rad: number) {
    const joint = this.rig.joints[j];
    const parent = joint.parent;
    if (!parent || rad === 0) return;
    const axis = new Vector3(0, 1, 0)
      .applyQuaternion(this.rig.displayRoot.getWorldQuaternion(new Quaternion()))
      .applyQuaternion(parent.getWorldQuaternion(new Quaternion()).invert())
      .normalize();
    joint.quaternion.premultiply(new Quaternion().setFromAxisAngle(axis, rad));
  }

  private applyFootIk() {
    const { joints, displayRoot } = this.rig;
    // Rigs without pelvis grounding never reset the pelvis position, so undo
    // last frame's body-follow offset first (rotations are reset every apply()).
    if (!this.rig.pelvisBindPosition && this.footAppliedOffset.lengthSq() > 0) {
      joints.pelvis.position.sub(this.footAppliedOffset);
      displayRoot.updateMatrixWorld(true);
    }
    this.footAppliedOffset.set(0, 0, 0);

    const weight = smoothstep01(this.footRamp);
    if (!(weight > 0)) {
      if (this.footLast.weight !== 0 || this.footLast.enabled !== this.footEnabled)
        this.footLast = {
          ...this.footLast,
          enabled: this.footEnabled,
          weight: 0,
          crouch: 0,
          autoDrop: 0,
          pelvisShift: 0,
          pelvisYawDeg: 0,
        };
      return;
    }
    if (!this.footHasPlant) this.captureFootPlant();
    const cfg = FOOT_IK_CONFIG;
    const [P0, P1] = this.footPlant;
    const [R0, R1] = this.footRest;

    // ── Body follows the feet ("hips follow feet", centre of mass over the
    // support). Only feet on the ground support the body: g = 1 on the floor,
    // fading to 0 once the foot is lifted `liftHeight` above its planted height.
    // (1) Pelvis yaw follows how much the foot-to-foot line has turned about +Y
    // since planting (both feet down); the torso turns part of it back so the
    // chest keeps facing forward. (2) Pelvis slides horizontally toward the
    // support point (weighted by g), so lifting one foot shifts the weight onto
    // the other.
    const g = [P0.y - R0.y, P1.y - R1.y].map(
      (lift) => 1 - smoothstep01(lift / cfg.liftHeight),
    );
    const restLine = new Vector3(R1.x - R0.x, 0, R1.z - R0.z);
    const nowLine = new Vector3(P1.x - P0.x, 0, P1.z - P0.z);
    let feetYaw = 0;
    if (restLine.lengthSq() > 1e-8 && nowLine.lengthSq() > 1e-8)
      // signed angle about +Y: atan2((rest × now)·ŷ, rest · now)
      feetYaw = Math.atan2(
        restLine.z * nowLine.x - restLine.x * nowLine.z,
        restLine.dot(nowLine),
      );
    const maxYaw = MathUtils.degToRad(cfg.maxPelvisYawDeg);
    const pelvisYaw =
      MathUtils.clamp(cfg.pelvisYawFollow * feetYaw, -maxYaw, maxYaw) *
      weight *
      g[0] *
      g[1];
    this.yawJointInModel("pelvis", pelvisYaw);
    this.yawJointInModel("torso", -cfg.torsoCounterYaw * pelvisYaw);

    const restMid = new Vector3().addVectors(R0, R1).multiplyScalar(0.5);
    const gSum = g[0] + g[1];
    const support =
      gSum > 1e-6
        ? new Vector3()
            .addScaledVector(P0, g[0] / gSum)
            .addScaledVector(P1, g[1] / gSum)
        : restMid.clone();
    const shift = support.sub(restMid);
    shift.set(
      shift.x * cfg.pelvisSideFollow * weight,
      0,
      shift.z * cfg.pelvisFollow * weight,
    );
    joints.pelvis.position.add(shift);
    this.footAppliedOffset.add(shift);
    displayRoot.updateMatrixWorld(true);

    // (3) Height: the requested crouch (slider + clip pelvisDrop), and at least
    // as low as needed for the supporting (grounded) ankles to be reachable; a
    // lifted foot that is out of reach just straightens its leg. For a hip H and ankle A
    // with horizontal distance h and height difference v = H.y − A.y, the leg
    // reaches when (v − drop)² + h² ≤ R² (R = max reach), i.e.
    //   drop ≥ v − √(R² − h²).
    const requested = (this.crouchDepth + this.clipDrop) * weight;
    let needed = 0;
    LEG_CHAINS.forEach((spec, i) => {
      const H = displayRoot.worldToLocal(
        joints[spec.root].getWorldPosition(new Vector3()),
      );
      const A = this.footPlant[i];
      const R = this.chainInfo(spec).prep.maxReach;
      const h = Math.hypot(H.x - A.x, H.z - A.z);
      const v = H.y - A.y;
      const d = h < R ? v - Math.sqrt(R * R - h * h) : cfg.maxAutoDrop;
      needed = Math.max(needed, g[i] * d);
    });
    const autoDrop = MathUtils.clamp(needed, 0, cfg.maxAutoDrop) * weight;
    const drop = Math.max(requested, autoDrop);
    if (drop !== 0) {
      joints.pelvis.position.y -= drop;
      this.footAppliedOffset.y -= drop;
    }
    displayRoot.updateMatrixWorld(true);

    const rootQ = displayRoot.getWorldQuaternion(new Quaternion());
    const legs = LEG_CHAINS.map((spec, i) => {
      // Knee pole. Default: the FK leg's own bend-plane side (the solver's
      // convention, rotated by the FK hip rotation), placed beside the knee.
      // Its component ⟂ hip→ankle is exactly that side, so with feet and pelvis
      // at rest IK reproduces the FK leg (no extra hip twist). A user-dragged
      // knee pole overrides it.
      const info = this.chainInfo(spec);
      let pole: Vector3;
      const override = this.footPoleOverride[i];
      if (override) {
        pole = override.clone();
      } else {
        const fkBend = MathUtils.degToRad(
          jointQuatToAngle(spec.mid, this.pose[spec.mid]),
        );
        const fkRootQ = this.ikTmpQ
          .copy(info.rootBind)
          .multiply(this.pose[spec.root])
          .multiply(this.ikTmpQ2.copy(info.rootBind).invert());
        const sideParent = bendPlaneSide(info.prep, fkBend).applyQuaternion(
          fkRootQ,
        );
        const hip = info.prep.root;
        const dHat = info.parent
          .worldToLocal(displayRoot.localToWorld(this.footPlant[i].clone()))
          .sub(hip)
          .normalize();
        const along = info.prep.mid.clone().sub(hip).length();
        pole = displayRoot.worldToLocal(
          info.parent.localToWorld(
            hip
              .clone()
              .addScaledVector(dHat, along)
              .addScaledVector(sideParent, cfg.poleForward),
          ),
        );
      }
      this.footPoleUsed[i].copy(pole);
      const res = this.solveChain(
        spec,
        this.footPlant[i],
        pole,
        this.footMemory[i],
        weight,
      );
      // Foot orientation: as close to its planted orientation (flat) as the
      // ankle allows. Desired local = parentWorld⁻¹ · displayRootWorld ·
      // plantedModelQ. Its offset from bind, as XYZ Euler angles: pitch (X)
      // clamped to JOINT_LIMITS, plus small yaw (Y, ± ankleYawMax) and roll
      // (Z, ± ankleRollMax). Then blended by weight.
      const ankle = joints[spec.end];
      const parent = ankle.parent;
      let ankleWantDeg: [number, number, number] = [0, 0, 0];
      let footTiltDeg = 0;
      if (parent) {
        const desired = parent
          .getWorldQuaternion(new Quaternion())
          .invert()
          .multiply(rootQ)
          .multiply(this.footPlantQ[i]);
        const bind = this.rig.bindPose[spec.end];
        const offset = bind.clone().invert().multiply(desired);
        const want = new Euler().setFromQuaternion(offset, "XYZ");
        ankleWantDeg = [
          MathUtils.radToDeg(want.x),
          MathUtils.radToDeg(want.y),
          MathUtils.radToDeg(want.z),
        ];
        const pitchDeg = clampJointAngle(
          spec.end,
          jointQuatToAngle(spec.end, offset),
        );
        const rollMax = MathUtils.degToRad(cfg.ankleRollMaxDeg);
        const yawMax = MathUtils.degToRad(cfg.ankleYawMaxDeg);
        const e = jointAngleToEuler(spec.end, pitchDeg);
        e.y = MathUtils.clamp(want.y, -yawMax, yawMax);
        e.z = MathUtils.clamp(want.z, -rollMax, rollMax);
        const local = bind.clone().multiply(new Quaternion().setFromEuler(e));
        ankle.quaternion.slerp(local, weight);
        ankle.updateMatrixWorld(true);
        footTiltDeg = MathUtils.radToDeg(
          rootQ
            .clone()
            .invert()
            .multiply(ankle.getWorldQuaternion(new Quaternion()))
            .angleTo(this.footPlantQ[i]),
        );
      }
      return { ...res, ankleWantDeg, footTiltDeg };
    });

    this.footLast = {
      enabled: this.footEnabled,
      weight,
      crouch: drop,
      autoDrop,
      pelvisShift: Math.hypot(shift.x, shift.z),
      pelvisYawDeg: MathUtils.radToDeg(pelvisYaw),
      reachable: legs.every((l) => l.reachable),
      limited: legs.some((l) => l.limited),
      error: Math.max(...legs.map((l) => l.error)),
      legs,
    };
  }

  setFootIkEnabled(on: boolean) {
    if (on && !this.footEnabled && this.footRamp === 0) {
      this.footHasPlant = false;
      this.footPoleOverride = [null, null];
    }
    this.footEnabled = on;
    this.advanceIk(0);
    this.apply();
  }

  /** Jump the foot-planting weight (0..1) without ramping. Used by the evaluation. */
  setFootWeightImmediate(weight: number) {
    this.footRamp = MathUtils.clamp(weight, 0, 1);
    this.apply();
  }

  /** How far (m) the pelvis is lowered while foot planting is on. */
  setCrouch(depth: number) {
    if (!Number.isFinite(depth)) return;
    this.crouchDepth = MathUtils.clamp(depth, 0, FOOT_IK_CONFIG.maxCrouch);
    if (this.footActive()) this.apply();
  }

  get crouch(): number {
    return this.crouchDepth;
  }

  /** Drag a knee pole (displayRoot space; 0 = right, 1 = left): the knee bends toward it. */
  setFootPole(leg: 0 | 1, x: number, y: number, z: number) {
    if (![x, y, z].every(Number.isFinite)) return;
    this.footPoleOverride[leg] = new Vector3(x, y, z);
    if (this.footActive()) this.apply();
  }

  /** Knee poles used by the last solve (displayRoot space), [right, left]. */
  footPolePositions(): [number, number, number][] {
    return this.footPoleUsed.map((p) => [p.x, p.y, p.z]);
  }

  /** Re-plant both feet at the current clip / manual pose (knee poles back to automatic). */
  resetFootPlant() {
    this.footHasPlant = false;
    this.footPoleOverride = [null, null];
    const ramp = this.footRamp;
    this.footRamp = 0;
    this.apply();
    this.captureFootPlant();
    this.footRamp = ramp;
    this.apply();
  }

  /**
   * Move one planted ankle (displayRoot space; 0 = right, 1 = left). The foot
   * keeps its planted orientation, so it slides flat along the floor.
   */
  setFootPlant(leg: 0 | 1, x: number, y: number, z: number) {
    if (![x, y, z].every(Number.isFinite)) return;
    if (!this.footHasPlant) {
      const ramp = this.footRamp;
      this.footRamp = 0;
      this.apply();
      this.captureFootPlant();
      this.footRamp = ramp;
    }
    // the floor: a foot can be lifted, not pushed below its planted height
    this.footPlant[leg].set(x, Math.max(y, this.footRest[leg].y), z);
    if (!this.footActive()) return;
    this.apply();
    // Dragged past what the joint limits allow: keep the handle on the foot
    // (where the ankle actually got to), like a constrained rig control.
    if (this.footLast.legs[leg].error > 1e-4) {
      const { displayRoot, joints } = this.rig;
      const a = displayRoot.worldToLocal(
        joints[LEG_CHAINS[leg].end].getWorldPosition(new Vector3()),
      );
      this.footPlant[leg].set(a.x, Math.max(a.y, this.footRest[leg].y), a.z);
    }
    if (this.footActive()) this.apply();
  }

  footPlantPositions(): [number, number, number][] {
    return this.footPlant.map((p) => [p.x, p.y, p.z]);
  }

  get footIsEnabled(): boolean {
    return this.footEnabled;
  }

  get footIsActive(): boolean {
    return this.footActive();
  }

  footStatus(): FootIkStatus {
    return { ...this.footLast, legs: this.footLast.legs.map((l) => ({ ...l })) };
  }

  setIkEnabled(on: boolean) {
    this.ikEnabled = on;
    if (on && !this.ikHasTarget) {
      this.rig.displayRoot.updateMatrixWorld(true);
      this.initIkTargets();
    }
    this.advanceIk(0);
    this.apply();
  }

  /** Jump the IK blend weight (0..1) without ramping. Used by the evaluation. */
  setIkWeightImmediate(weight: number) {
    this.ikRamp = MathUtils.clamp(weight, 0, 1);
    this.apply();
  }

  /** Target in displayRoot space. */
  setIkTarget(x: number, y: number, z: number) {
    if (![x, y, z].every(Number.isFinite)) return;
    if (!this.ikHasTarget) {
      this.rig.displayRoot.updateMatrixWorld(true);
      this.initIkTargets();
    }
    this.ikTarget.set(x, y, z);
    if (this.ikActive()) this.apply();
  }

  /** Pole in displayRoot space. */
  setIkPole(x: number, y: number, z: number) {
    if (![x, y, z].every(Number.isFinite)) return;
    if (!this.ikHasTarget) {
      this.rig.displayRoot.updateMatrixWorld(true);
      this.initIkTargets();
    }
    this.ikPole.set(x, y, z);
    if (this.ikActive()) this.apply();
  }

  /** Put the target back on the hand of the clip / manual pose (pole beside its elbow). */
  resetIkTarget() {
    this.ikHasTarget = false;
    const ramp = this.ikRamp;
    this.ikRamp = 0;
    this.apply();
    this.initIkTargets();
    this.ikRamp = ramp;
    this.ikMemory = {};
    this.apply();
  }

  ikTargetPosition(): [number, number, number] {
    return [this.ikTarget.x, this.ikTarget.y, this.ikTarget.z];
  }

  ikPolePosition(): [number, number, number] {
    return [this.ikPole.x, this.ikPole.y, this.ikPole.z];
  }

  get ikIsEnabled(): boolean {
    return this.ikEnabled;
  }

  /** True while IK is on or still blending out. */
  get ikIsActive(): boolean {
    return this.ikActive();
  }

  ikStatus(): IkStatus {
    return { ...this.ikLast };
  }

  setTransitionMode(mode: TransitionMode) {
    this.transitionMode = mode;
  }

  play(action?: ActionName) {
    this.snapshotCurrentPose();
    if (action) {
      this.action = action;
      this.activeClip = this.compiledClips[action];
    } else {
      this.activeClip = this.demoClip;
    }
    this.time = 0;
    this.playing = true;

    if (this.transitionMode === "blend" && this.transitionDuration > 0) {
      this.blendElapsed = 0;
      this.status = "transitioning";
      for (const j of JOINTS) {
        this.pose[j].copy(this.start[j]);
      }
      this.apply();
    } else {
      this.blendElapsed = this.transitionDuration;
      this.status = "playing";
      samplePose(this.activeClip, 0, this.pose);
      this.clipDrop = samplePelvisDrop(this.activeClip, 0);
      this.apply();
    }
  }

  pause() {
    this.playing = false;
    this.status = "holding";
  }

  resume() {
    if (!this.activeClip.loop && this.time >= this.activeClip.duration) {
      this.play();
    } else {
      this.playing = true;
      this.status =
        this.transitionMode === "blend" &&
        this.blendElapsed < this.transitionDuration
          ? "transitioning"
          : "playing";
    }
  }

  seek(t: number) {
    this.time = MathUtils.clamp(t, 0, this.activeClip.duration);
    this.playing = false;
    this.status = "holding";
    this.blendElapsed = this.transitionDuration;
    samplePose(this.activeClip, this.time, this.pose);
    this.clipDrop = samplePelvisDrop(this.activeClip, this.time);
    this.apply();
  }

  reset() {
    this.activeClip = this.demoClip;
    this.time = 0;
    this.playing = false;
    this.status = "holding";
    this.blendElapsed = this.transitionDuration;
    for (const j of JOINTS) {
      this.pose[j].identity();
    }
    this.clipDrop = 0;
    this.apply();
  }

  manual(input: PoseInput) {
    const normalized = normalizePoseInput(input);
    this.time = 0;
    this.playing = false;
    this.status = "holding";
    this.blendElapsed = this.transitionDuration;
    for (const j of JOINTS) {
      this.pose[j].setFromEuler(jointAngleToEuler(j, normalized[j]));
    }
    this.clipDrop = 0;
    this.apply();
  }

  private evaluateCurrentTime() {
    samplePose(this.activeClip, this.time, this.temp);
    const drop = samplePelvisDrop(this.activeClip, this.time);
    if (
      this.transitionMode === "blend" &&
      this.transitionDuration > 0 &&
      this.blendElapsed < this.transitionDuration
    ) {
      const u = MathUtils.clamp(
        this.blendElapsed / this.transitionDuration,
        0,
        1,
      );
      const smooth = u * u * (3 - 2 * u);
      for (const j of JOINTS) {
        this.pose[j].copy(this.start[j]).slerp(this.temp[j], smooth);
      }
      this.clipDrop = this.startDrop + (drop - this.startDrop) * smooth;
      this.status = "transitioning";
    } else {
      for (const j of JOINTS) {
        this.pose[j].copy(this.temp[j]);
      }
      this.clipDrop = drop;
      if (this.playing) this.status = "playing";
    }
  }

  update(dt: number) {
    // The IK layer must keep solving while no clip is playing (holding / manual
    // pose), otherwise dragging the target would not move the arm.
    const ikWasActive = this.ikActive() || this.footActive();
    this.advanceIk(dt);
    if (!this.playing) {
      if (ikWasActive) this.apply();
      return;
    }
    if (!Number.isFinite(dt) || dt < 0) throw new Error("Invalid dt");

    const nextTime = this.time + dt;
    this.blendElapsed += dt;

    if (this.activeClip.loop) {
      this.time =
        ((nextTime % this.activeClip.duration) + this.activeClip.duration) %
        this.activeClip.duration;
      this.evaluateCurrentTime();
      this.apply();
      return;
    }

    if (nextTime < this.activeClip.duration) {
      this.time = nextTime;
      this.evaluateCurrentTime();
      this.apply();
      return;
    }

    // Reached end of a non-looping clip
    const overflow = Math.max(0, nextTime - this.activeClip.duration);
    this.time = this.activeClip.duration;
    this.evaluateCurrentTime();
    this.apply();

    if (this.activeClip.next) {
      // Automatically transition to next action (e.g. swing -> idle)
      this.snapshotCurrentPose();
      this.action = this.activeClip.next;
      this.activeClip = this.compiledClips[this.action];
      this.time = this.activeClip.loop
        ? overflow % this.activeClip.duration
        : Math.min(this.activeClip.duration, overflow);
      if (this.transitionMode === "blend" && this.transitionDuration > 0) {
        this.blendElapsed = overflow;
        this.status =
          overflow < this.transitionDuration ? "transitioning" : "playing";
      } else {
        this.blendElapsed = this.transitionDuration;
        this.status = "playing";
      }
      this.evaluateCurrentTime();
      this.apply();
    } else {
      this.playing = false;
      this.status = "holding";
    }
  }

  jointAngleDeg(joint: JointName): number {
    this.tmpQ
      .copy(this.rig.bindPose[joint])
      .invert()
      .multiply(this.rig.joints[joint].quaternion);
    return clampJointAngle(joint, jointQuatToAngle(joint, this.tmpQ));
  }

  angles(): JointAngles {
    const out = {} as JointAngles;
    for (const j of JOINTS) {
      out[j] = this.jointAngleDeg(j);
    }
    return out;
  }
}
