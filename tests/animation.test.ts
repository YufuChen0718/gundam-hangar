import test from "node:test";
import assert from "node:assert/strict";
import { Group, Object3D, Quaternion, Vector3 } from "three";
import {
  compileClip,
  emptyPose,
  samplePose,
} from "../src/animation/samplePose";
import { Animator } from "../src/animation/animator";
import { JOINTS } from "../src/mecha/types";
import type { ArmPreviewRig } from "../src/mecha/types";
function rig(): ArmPreviewRig {
  const root = new Group();
  const joints = Object.fromEntries(
    JOINTS.map((j) => [j, new Object3D()]),
  ) as ArmPreviewRig["joints"];
  for (const j of Object.values(joints)) root.add(j);
  return {
    displayRoot: root,
    joints,
    bindPose: Object.fromEntries(
      JOINTS.map((j) => [j, new Quaternion()]),
    ) as ArmPreviewRig["bindPose"],
    sockets: {
      rightHand: new Object3D(),
      leftHand: new Object3D(),
      back: new Object3D(),
    },
    parts: {},
    originalMaterials: new Map(),
  };
}
const clip = compileClip({
  name: "test",
  duration: 2,
  loop: false,
  keys: [
    { t: 0, pose: {} },
    { t: 2, pose: { rightElbow: [90, 0, 0] } },
  ],
});
test("midpoint follows the expected 45-degree rotation", () => {
  const p = samplePose(clip, 1, emptyPose());
  const v = new Vector3(0, 1, 0).applyQuaternion(p.rightElbow);
  assert.ok(Math.abs(v.y - Math.SQRT1_2) < 1e-10);
  assert.ok(Math.abs(v.z - Math.SQRT1_2) < 1e-10);
});
test("negative and over-duration time clamp to endpoints", () => {
  assert.equal(
    samplePose(clip, -10, emptyPose()).rightElbow.angleTo(new Quaternion()),
    0,
  );
  assert.ok(
    Math.abs(
      samplePose(clip, 20, emptyPose()).rightElbow.angleTo(new Quaternion()) -
        Math.PI / 2,
    ) < 1e-10,
  );
});
test("omitted joint resets to identity offset rather than retaining stale pose", () => {
  const out = emptyPose();
  out.rightShoulder.setFromAxisAngle(new Vector3(1, 0, 0), 1);
  samplePose(clip, 1, out);
  assert.equal(out.rightShoulder.angleTo(new Quaternion()), 0);
});
test("loop samples wrap without changing timing", () => {
  const loop = { ...clip, loop: true };
  const a = samplePose(loop, 0.3, emptyPose());
  const b = samplePose(loop, 2.3, emptyPose());
  assert.ok(a.rightElbow.angleTo(b.rightElbow) < 1e-7);
});
test("non-monotonic keys are rejected", () => {
  assert.throws(() =>
    compileClip({
      name: "bad",
      duration: 1,
      loop: false,
      keys: [
        { t: 0.5, pose: {} },
        { t: 0.5, pose: {} },
      ],
    }),
  );
});
test("elapsed time determines pose independently of update frequency", () => {
  const r1 = rig(),
    r2 = rig();
  const a = new Animator(r1),
    b = new Animator(r2);
  a.play();
  b.play();
  for (let i = 0; i < 120; i++) a.update(1 / 60);
  for (let i = 0; i < 20; i++) b.update(0.1);
  for (const j of JOINTS)
    assert.ok(r1.joints[j].quaternion.angleTo(r2.joints[j].quaternion) < 1e-7);
});
test("pause freezes time; reset restores bind pose; manual pose restarts timeline", () => {
  const r = rig(),
    a = new Animator(r);
  a.play();
  a.update(1);
  a.pause();
  const t = a.time;
  a.update(1);
  assert.equal(a.time, t);
  a.manual({ shoulder: 20, elbow: 40, wrist: 0 });
  assert.equal(a.time, 0);
  a.reset();
  for (const j of JOINTS)
    assert.ok(r.joints[j].quaternion.angleTo(r.bindPose[j]) < 1e-7);
});
test("large elapsed interval ends on the final pose rather than overshooting", () => {
  const r = rig(),
    a = new Animator(r);
  a.play();
  a.update(20);
  assert.equal(a.playing, false);
  assert.equal(a.time, a.duration);
  for (const j of JOINTS)
    assert.ok(r.joints[j].quaternion.angleTo(r.bindPose[j]) < 1e-7);
});
