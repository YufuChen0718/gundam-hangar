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
  jointAngleToEuler,
  jointQuatToAngle,
  normalizePoseInput,
  SKIRT_FK_CONFIG,
} from "../mecha/rigConfig";
import { CLIPS, raiseArm } from "./clips";
import type { ActionName, AnimatorStatus, TransitionMode } from "./clips";
import { compileClip, emptyPose, samplePose } from "./samplePose";
import type { PreparedClip } from "./samplePose";

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

  constructor(private rig: ArmPreviewRig) {}

  setRig(rig: ArmPreviewRig) {
    this.rig = rig;
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

  private snapshotCurrentPose() {
    for (const j of JOINTS) {
      this.start[j]
        .copy(this.rig.bindPose[j])
        .invert()
        .multiply(this.rig.joints[j].quaternion);
    }
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
    // Secondary skirt armor FK (Requirement 6): driven directly from hip pitch in our FK update
    const rigidActive = (this.rig.lbs?.getMode() ?? "rigid") === "rigid";
    const rightHipDeg = rigidActive
      ? clampJointAngle("rightHip", jointQuatToAngle("rightHip", this.pose.rightHip))
      : 0;
    const leftHipDeg = rigidActive
      ? clampJointAngle("leftHip", jointQuatToAngle("leftHip", this.pose.leftHip))
      : 0;
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
    this.rig.lbs?.updateBoneMatrices();
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
    this.apply();
  }

  private evaluateCurrentTime() {
    samplePose(this.activeClip, this.time, this.temp);
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
      this.status = "transitioning";
    } else {
      for (const j of JOINTS) {
        this.pose[j].copy(this.temp[j]);
      }
      if (this.playing) this.status = "playing";
    }
  }

  update(dt: number) {
    if (!this.playing) return;
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
