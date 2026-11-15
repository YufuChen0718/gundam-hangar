import { MathUtils, Quaternion, Vector3 } from "three";
import type { ArmPreviewRig, JointAngles, PoseInput } from "../mecha/types";
import { JOINTS } from "../mecha/types";
import {
  clampJointAngle,
  jointAngleToEuler,
  jointQuatToAngle,
  normalizePoseInput,
} from "../mecha/rigConfig";
import { raiseArm } from "./clips";
import { compileClip, emptyPose, samplePose } from "./samplePose";

export class Animator {
  readonly duration = raiseArm.duration;
  time = 0;
  playing = false;
  private clip = compileClip(raiseArm);
  private pose = emptyPose();
  private start = emptyPose();
  private temp = emptyPose();
  private blendElapsed = 1;
  private tmpA = new Vector3();
  private tmpB = new Vector3();

  constructor(private rig: ArmPreviewRig) {}

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
    }
  }

  play() {
    for (const j of JOINTS)
      this.start[j]
        .copy(this.rig.bindPose[j])
        .invert()
        .multiply(this.rig.joints[j].quaternion);
    this.time = 0;
    this.blendElapsed = 0;
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  resume() {
    if (this.time >= this.duration) this.play();
    else this.playing = true;
  }

  seek(t: number) {
    this.time = MathUtils.clamp(t, 0, this.duration);
    this.playing = false;
    this.blendElapsed = 1;
    samplePose(this.clip, this.time, this.pose);
    this.apply();
  }

  reset() {
    this.seek(0);
  }

  manual(input: PoseInput) {
    const normalized = normalizePoseInput(input);
    this.time = 0;
    this.playing = false;
    this.blendElapsed = 1;
    for (const j of JOINTS) {
      this.pose[j].setFromEuler(jointAngleToEuler(j, normalized[j]));
    }
    this.apply();
  }

  update(dt: number) {
    if (!this.playing) return;
    if (!Number.isFinite(dt) || dt < 0) throw new Error("Invalid dt");
    this.time = Math.min(this.duration, this.time + dt);
    this.blendElapsed += dt;
    samplePose(this.clip, this.time, this.pose);
    const w = Math.min(1, this.blendElapsed / 0.3),
      smooth = w * w * (3 - 2 * w);
    if (w < 1) {
      samplePose(this.clip, this.time, this.temp);
      for (const j of JOINTS)
        this.pose[j].copy(this.start[j]).slerp(this.temp[j], smooth);
    }
    this.apply();
    if (this.time >= this.duration) this.playing = false;
  }

  angles(): JointAngles {
    const q = new Quaternion();
    const out = {} as JointAngles;
    for (const j of JOINTS) {
      q.copy(this.rig.bindPose[j])
        .invert()
        .multiply(this.rig.joints[j].quaternion);
      out[j] = clampJointAngle(j, jointQuatToAngle(j, q));
    }
    return out;
  }
}
