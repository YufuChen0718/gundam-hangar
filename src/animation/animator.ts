import { Euler, MathUtils } from "three";
import type { ArmPreviewRig, JointAngles } from "../mecha/types";
import { JOINTS } from "../mecha/types";
import { raiseArm } from "./clips";
import { compileClip, emptyPose, samplePose } from "./samplePose";
export class Animator {
  readonly duration = raiseArm.duration;
  time = 0;
  playing = false;
  private clip = compileClip(raiseArm);
  private pose = emptyPose();
  private start = emptyPose();
  private blendElapsed = 1;
  constructor(private rig: ArmPreviewRig) {}
  private apply() {
    for (const j of JOINTS)
      this.rig.joints[j].quaternion
        .copy(this.rig.bindPose[j])
        .multiply(this.pose[j]);
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
  manual(a: JointAngles) {
    this.time = 0;
    this.playing = false;
    this.blendElapsed = 1;
    for (const j of JOINTS) this.pose[j].identity();
    this.pose.rightShoulder.setFromEuler(
      new Euler(MathUtils.degToRad(-a.shoulder), 0, 0),
    );
    this.pose.rightElbow.setFromEuler(
      new Euler(MathUtils.degToRad(-a.elbow), 0, 0),
    );
    this.pose.rightWrist.setFromEuler(
      new Euler(0, 0, MathUtils.degToRad(a.wrist)),
    );
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
  private temp = emptyPose();
  angles(): JointAngles {
    const s = new Euler().setFromQuaternion(
      this.rig.bindPose.rightShoulder
        .clone()
        .invert()
        .multiply(this.rig.joints.rightShoulder.quaternion),
    );
    const e = new Euler().setFromQuaternion(
      this.rig.bindPose.rightElbow
        .clone()
        .invert()
        .multiply(this.rig.joints.rightElbow.quaternion),
    );
    const w = new Euler().setFromQuaternion(
      this.rig.bindPose.rightWrist
        .clone()
        .invert()
        .multiply(this.rig.joints.rightWrist.quaternion),
    );
    return {
      shoulder: -MathUtils.radToDeg(s.x),
      elbow: -MathUtils.radToDeg(e.x),
      wrist: MathUtils.radToDeg(w.z),
    };
  }
}
