import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Group, Object3D, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  compileClip,
  emptyPose,
  samplePose,
} from "../src/animation/samplePose";
import { Animator } from "../src/animation/animator";
import { LbsManager } from "../src/mecha/lbs";
import { JOINTS } from "../src/mecha/types";
import type { ArmPreviewRig, JointName, SocketName } from "../src/mecha/types";
import { JOINT_LIMITS, rigConfig, TEST_POSES } from "../src/mecha/rigConfig";

function rig(): ArmPreviewRig {
  const root = new Group();
  const joints = Object.fromEntries(
    JOINTS.map((j) => [j, new Object3D()]),
  ) as ArmPreviewRig["joints"];
  const parents: Partial<Record<JointName, JointName>> = {
    torso: "pelvis",
    head: "torso",
    rightShoulder: "torso",
    rightElbow: "rightShoulder",
    rightWrist: "rightElbow",
    leftShoulder: "torso",
    leftElbow: "leftShoulder",
    leftWrist: "leftElbow",
    rightHip: "pelvis",
    rightKnee: "rightHip",
    rightAnkle: "rightKnee",
    leftHip: "pelvis",
    leftKnee: "leftHip",
    leftAnkle: "leftKnee",
  };
  root.add(joints.pelvis);
  joints.pelvis.position.set(0, 1.036, -0.055);
  joints.torso.position.set(0.048, 0.192, 0);
  joints.head.position.set(-0.036, 0.393, -0.018);
  joints.rightShoulder.position.set(-0.333, 0.263, -0.18);
  joints.rightElbow.position.set(-0.04, -0.145, -0.05);
  joints.rightWrist.position.set(-0.09, -0.305, 0.105);
  joints.leftShoulder.position.set(0.182, 0.304, -0.129);
  joints.leftElbow.position.set(0.136, -0.17, 0.224);
  joints.leftWrist.position.set(0.028, -0.318, 0.109);
  joints.rightHip.position.set(-0.161, -0.116, -0.165);
  joints.rightKnee.position.set(-0.076, -0.342, 0);
  joints.rightAnkle.position.set(-0.071, -0.343, 0);
  joints.leftHip.position.set(0.162, -0.116, 0.105);
  joints.leftKnee.position.set(0.086, -0.342, 0);
  joints.leftAnkle.position.set(0.116, -0.343, 0);
  for (const [child, parent] of Object.entries(parents) as [
    JointName,
    JointName,
  ][]) {
    joints[parent].add(joints[child]);
  }
  root.updateMatrixWorld(true);
  const bindAnkleY = Math.min(
    joints.leftAnkle.getWorldPosition(new Vector3()).y,
    joints.rightAnkle.getWorldPosition(new Vector3()).y,
  );
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
    pelvisBindPosition: joints.pelvis.position.clone(),
    bindAnkleY,
    bindFootMinY: 0,
    footGroundSamples: [
      {
        ankleJoint: joints.leftAnkle,
        localPoint: new Vector3(0, -bindAnkleY, 0),
      },
      {
        ankleJoint: joints.rightAnkle,
        localPoint: new Vector3(0, -bindAnkleY, 0),
      },
    ],
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

test("joint limits clamp out-of-range angles including one-way knees and elbows", () => {
  const r = rig(),
    a = new Animator(r);
  a.manual({
    pelvis: 999,
    torso: -999,
    rightKnee: -40,
    leftKnee: 200,
    rightElbow: -25,
    leftElbow: 150,
  });
  const angles = a.angles();
  assert.ok(Math.abs(angles.pelvis - JOINT_LIMITS.pelvis[1]) < 1e-5);
  assert.ok(Math.abs(angles.torso - JOINT_LIMITS.torso[0]) < 1e-5);
  assert.ok(Math.abs(angles.rightKnee - 0) < 1e-5);
  assert.ok(Math.abs(angles.leftKnee - JOINT_LIMITS.leftKnee[1]) < 1e-5);
  assert.ok(Math.abs(angles.rightElbow - 0) < 1e-5);
  assert.ok(Math.abs(angles.leftElbow - JOINT_LIMITS.leftElbow[1]) < 1e-5);
});

test("moving pelvis moves the whole body while feet stay grounded in test poses", () => {
  const r = rig(),
    a = new Animator(r);
  const restPositions = Object.fromEntries(
    JOINTS.map((j) => [j, r.joints[j].getWorldPosition(new Vector3())]),
  ) as Record<JointName, Vector3>;

  a.manual({ pelvis: 25 });
  for (const j of JOINTS) {
    if (j === "pelvis") continue;
    const moved = r.joints[j]
      .getWorldPosition(new Vector3())
      .distanceTo(restPositions[j]);
    assert.ok(moved > 1e-3, `Expected ${j} to move when pelvis rotates`);
  }

  for (const preset of TEST_POSES) {
    a.manual(preset.angles);
    const leftAnkleY = r.joints.leftAnkle.getWorldPosition(new Vector3()).y;
    const rightAnkleY = r.joints.rightAnkle.getWorldPosition(new Vector3()).y;
    assert.ok(
      Math.abs(leftAnkleY - r.bindAnkleY!) < 1e-5,
      `Left ankle left platform on ${preset.id}`,
    );
    assert.ok(
      Math.abs(rightAnkleY - r.bindAnkleY!) < 1e-5,
      `Right ankle left platform on ${preset.id}`,
    );
  }
});

test("custom LBS CPU reference matches Three.js skinning and reports distinct per-pose seam gaps on gundam-rigged.glb", async () => {
  Object.assign(globalThis, {
    self: globalThis,
    createImageBitmap: async () => ({ width: 1, height: 1, close() {} }),
  });
  const buf = fs.readFileSync("public/assets/models/gundam-rigged.glb");
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    "",
  );
  const displayRoot = new Group();
  displayRoot.add(gltf.scene);
  const joints = Object.fromEntries(
    JOINTS.map((j) => [j, gltf.scene.getObjectByName(j)!]),
  ) as Record<JointName, Object3D>;
  const bindPose = Object.fromEntries(
    JOINTS.map((j) => [j, joints[j].quaternion.clone()]),
  ) as Record<JointName, Quaternion>;
  const sockets = Object.fromEntries(
    Object.entries(rigConfig.sockets).map(([s, n]) => [
      s,
      gltf.scene.getObjectByName(n)!,
    ]),
  ) as Record<SocketName, Object3D>;
  const rifleOffset = gltf.scene.getObjectByName("rifleOffset");
  if (rifleOffset) {
    rifleOffset.quaternion.copy(sockets.rightHand.quaternion).invert();
  }
  const parts = Object.fromEntries(
    rigConfig.partNames.map((n) => [n, gltf.scene.getObjectByName(n)!]),
  );
  displayRoot.updateMatrixWorld(true);
  const lbs = new LbsManager(displayRoot, parts);
  const pelvisBindPosition = joints.pelvis.position.clone();
  const bindAnkleY = Math.min(
    displayRoot.worldToLocal(joints.leftAnkle.getWorldPosition(new Vector3()))
      .y,
    displayRoot.worldToLocal(joints.rightAnkle.getWorldPosition(new Vector3()))
      .y,
  );
  const fullRig: ArmPreviewRig = {
    displayRoot,
    joints,
    bindPose,
    sockets,
    parts,
    originalMaterials: new Map(),
    pelvisBindPosition,
    bindAnkleY,
    bindFootMinY: 0,
    lbs,
  };
  const animator = new Animator(fullRig);

  const seamMaxs: number[] = [];
  const vsThreeMaxs: number[] = [];
  for (const preset of TEST_POSES) {
    animator.manual(preset.angles);
    const seam = lbs.computeSeamStats("lbs");
    const rigidSeam = lbs.computeSeamStats("rigid");
    const vsThree = lbs.compareWithThreeSkinning();
    assert.equal(seam.boundaryGroups, 367);
    assert.ok(
      seam.maxGap < 1e-5,
      `LBS seam gap exceeded threshold on ${preset.id}: ${seam.maxGap}`,
    );
    assert.ok(
      vsThree.maxDiff < 1e-6,
      `LBS vs Three.js max diff exceeded threshold on ${preset.id}: ${vsThree.maxDiff}`,
    );
    if (preset.id !== "bind") {
      assert.ok(
        rigidSeam.maxGap > 0.01,
        `Expected rigid-parts mode to show visible seam crack (>10 mm) on ${preset.id}, got ${rigidSeam.maxGap}`,
      );
    }
    seamMaxs.push(Number(seam.maxGap.toExponential(4)));
    vsThreeMaxs.push(Number(vsThree.maxDiff.toExponential(4)));
  }
  assert.equal(
    new Set(seamMaxs).size,
    TEST_POSES.length,
    `Expected per-pose LBS seam gaps to differ across all 9 poses: ${seamMaxs.join(", ")}`,
  );
  assert.equal(
    new Set(vsThreeMaxs).size,
    TEST_POSES.length,
    `Expected per-pose LBS vs Three.js diffs to differ across all 9 poses: ${vsThreeMaxs.join(", ")}`,
  );
});
