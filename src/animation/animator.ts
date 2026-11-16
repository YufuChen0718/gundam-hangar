import { MathUtils, Quaternion, Vector3 } from "three";
import type {
  ArmPreviewRig,
  JointAngles,
  JointName,
  PoseInput,
} from "../mecha/types";
import { JOINTS } from "../mecha/types";
import {
  clampJointAngle,
  jointAngleToEuler,
  jointQuatToAngle,
  normalizePoseInput,
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

  constructor(private rig: ArmPreviewRig) {}

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
