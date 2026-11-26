import test from "node:test";
import assert from "node:assert/strict";
import { Euler, Group, MathUtils, Object3D, Quaternion, Vector3 } from "three";
import {
  clampSwingTwist,
  prepareTwoBone,
  reachForBend,
  solveTwoBone,
  twoBoneEnd,
  twoBoneMid,
} from "../src/animation/ik";
import type { PreparedTwoBone, TwoBoneMemory } from "../src/animation/ik";
import { Animator } from "../src/animation/animator";
import { FOOT_IK_CONFIG } from "../src/mecha/rigConfig";
import { JOINTS } from "../src/mecha/types";
import type { ArmPreviewRig, JointName } from "../src/mecha/types";

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

function randomUnit(rand: () => number): Vector3 {
  const v = new Vector3();
  do v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
  while (v.lengthSq() > 1 || v.lengthSq() < 1e-6);
  return v.normalize();
}

function randomRotation(rand: () => number): Quaternion {
  return new Quaternion().setFromAxisAngle(
    randomUnit(rand),
    rand() * Math.PI,
  );
}

/** Bent bind arm with a slightly skewed hinge (similar bone vectors to the test rig). */
function skewedArm(): PreparedTwoBone {
  const root = new Vector3(-0.333, 0.263, -0.18);
  const mid = root.clone().add(new Vector3(-0.04, -0.145, -0.05));
  const end = mid.clone().add(new Vector3(-0.09, -0.305, 0.105));
  const upper = mid.clone().sub(root);
  const lower = end.clone().sub(mid);
  const hinge = new Vector3()
    .crossVectors(upper, lower)
    .normalize()
    .add(new Vector3(0.15, 0.05, -0.1))
    .normalize();
  return prepareTwoBone({
    root,
    mid,
    end,
    hingeAxis: hinge,
    minBend: 0,
    maxBend: Math.PI / 2,
  });
}

/** Straight bind arm, hinge perpendicular to the bend plane: the textbook case. */
function straightArm(): PreparedTwoBone {
  return prepareTwoBone({
    root: new Vector3(0, 0, 0),
    mid: new Vector3(0, -0.24, 0),
    end: new Vector3(0, -0.5, 0),
    hingeAxis: new Vector3(1, 0, 0),
    minBend: 0,
    maxBend: Math.PI / 2,
  });
}

function poleBeside(prep: PreparedTwoBone, elbow: Vector3, target: Vector3) {
  const line = target.clone().sub(prep.root).normalize();
  const m = elbow.clone().sub(prep.root);
  m.addScaledVector(line, -m.dot(line));
  return elbow.clone().add(m.setLength(0.3));
}

test("IK: straight arm reach range is [sqrt(a²+b²), a+b] with a 90° elbow limit", () => {
  const prep = straightArm();
  assert.ok(Math.abs(prep.maxReach - 0.5) < 1e-12);
  assert.ok(Math.abs(prep.minReach - Math.hypot(0.24, 0.26)) < 1e-12);
  // generalized law of cosines matches FK distance
  for (const bend of [0, 0.3, 0.9, Math.PI / 2]) {
    const fk = twoBoneEnd(prep, new Quaternion(), bend).distanceTo(prep.root);
    assert.ok(Math.abs(fk - reachForBend(prep, bend)) < 1e-12);
  }
});

test("IK: end-effector error ≈ 0 over 1000 random reachable targets (skewed hinge, bent bind)", () => {
  const prep = skewedArm();
  const rand = mulberry32(16);
  const memory: TwoBoneMemory = {};
  let maxErr = 0;
  for (let i = 0; i < 1000; i++) {
    const Q = randomRotation(rand);
    const bend = (0.01 + 0.98 * rand()) * (Math.PI / 2);
    const target = twoBoneEnd(prep, Q, bend);
    const pole = poleBeside(prep, twoBoneMid(prep, Q), target);
    const sol = solveTwoBone(prep, target, pole, memory);
    assert.ok(sol.reachable);
    assert.ok(sol.bend >= 0 && sol.bend <= Math.PI / 2 + 1e-12);
    const err = twoBoneEnd(prep, sol.rootRotation, sol.bend).distanceTo(target);
    maxErr = Math.max(maxErr, err);
    // pole beside the sampled elbow → the sampled rotation itself, even with a
    // skewed hinge (no extra twist about the root→target line)
    assert.ok(
      Math.abs(sol.bend - bend) > 1e-6 || sol.rootRotation.angleTo(Q) < 1e-6,
      `extra root twist ${sol.rootRotation.angleTo(Q)} rad at sample ${i}`,
    );
  }
  assert.ok(maxErr < 1e-9, `max error ${maxErr}`);
});

test("IK: too-far targets straighten the arm toward them; too-close targets hit the bend limit", () => {
  for (const prep of [straightArm(), skewedArm()]) {
    const rand = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const d = randomUnit(rand);
      const pole = prep.root.clone().add(randomUnit(rand));
      const far = prep.root.clone().addScaledVector(d, prep.maxReach * 2);
      const solFar = solveTwoBone(prep, far, pole);
      assert.equal(solFar.reachable, false);
      const hand = twoBoneEnd(prep, solFar.rootRotation, solFar.bend);
      const ideal = prep.root.clone().addScaledVector(d, prep.maxReach);
      assert.ok(hand.distanceTo(ideal) < 1e-9);
      assert.ok(Number.isFinite(solFar.rootRotation.w));

      const near = prep.root.clone().addScaledVector(d, prep.minReach * 0.3);
      const solNear = solveTwoBone(prep, near, pole);
      assert.equal(solNear.reachable, false);
      assert.ok(
        Math.abs(reachForBend(prep, solNear.bend) - prep.minReach) < 1e-9,
      );
    }
  }
});

test("IK: the elbow bends toward the pole vector", () => {
  const prep = straightArm();
  const rand = mulberry32(3);
  for (let i = 0; i < 300; i++) {
    const d = randomUnit(rand);
    const dist = prep.minReach + (0.05 + 0.9 * rand()) * (prep.maxReach - prep.minReach);
    const target = prep.root.clone().addScaledVector(d, dist);
    const pole = prep.root.clone().addScaledVector(d, 0.2 * dist).add(randomUnit(rand).multiplyScalar(0.4));
    const pPerp = pole.clone().sub(prep.root);
    pPerp.addScaledVector(d, -pPerp.dot(d));
    if (pPerp.length() < 0.05) continue;
    const sol = solveTwoBone(prep, target, pole);
    const elbow = twoBoneMid(prep, sol.rootRotation).sub(prep.root);
    elbow.addScaledVector(d, -elbow.dot(d));
    // elbow lies in the root–target–pole plane, on the pole side
    assert.ok(elbow.normalize().dot(pPerp.normalize()) > 1 - 1e-9);
  }
});

test("IK: sweeping the target through full extension has no elbow or shoulder flip", () => {
  // case A: textbook straight arm; case B: bind bent slightly the "wrong" way, so the
  // straight-arm point lies inside the elbow limits and two branches exist.
  const bentBack = prepareTwoBone({
    root: new Vector3(0, 0, 0),
    mid: new Vector3(0, -0.24, 0),
    end: new Vector3(0, -0.24, 0).add(
      new Vector3(0, -0.26, 0).applyAxisAngle(new Vector3(1, 0, 0), -0.2),
    ),
    hingeAxis: new Vector3(1, 0, 0),
    minBend: 0,
    maxBend: Math.PI / 2,
  });
  for (const prep of [straightArm(), bentBack]) {
    const dir = new Vector3(0.3, -0.8, 0.5).normalize();
    const pole = new Vector3(0, -0.2, -0.4);
    const memory: TwoBoneMemory = {};
    let prevBend: number | undefined;
    const prevQ = new Quaternion();
    // Near full extension bend ~ sqrt(Δc), so use fine steps: a real flip would be a
    // jump of ~2×bend, far above the 0.08 rad threshold.
    const steps = 2000;
    const d0 = prep.minReach * 0.95;
    const d1 = prep.maxReach * 1.3;
    for (let k = 0; k <= steps; k++) {
      const dist = d0 + ((d1 - d0) * k) / steps;
      const target = dir.clone().multiplyScalar(dist);
      const sol = solveTwoBone(prep, target, pole, memory);
      assert.ok(Number.isFinite(sol.bend));
      if (prevBend !== undefined) {
        assert.ok(
          Math.abs(sol.bend - prevBend) < 0.08,
          `bend jumped ${prevBend} → ${sol.bend} at step ${k}`,
        );
        assert.ok(
          sol.rootRotation.angleTo(prevQ) < 0.08,
          `shoulder jumped at step ${k}`,
        );
      }
      prevBend = sol.bend;
      prevQ.copy(sol.rootRotation);
    }
  }
});

test("IK: pole exactly on the shoulder→target line reuses the last direction (no NaN, no flip)", () => {
  const prep = straightArm();
  const memory: TwoBoneMemory = {};
  const target = new Vector3(0, -0.3, 0.2);
  const solA = solveTwoBone(prep, target, new Vector3(0, -0.1, -0.3), memory);
  const onLine = target.clone().multiplyScalar(2);
  const solB = solveTwoBone(prep, target, onLine, memory);
  assert.ok(Number.isFinite(solB.rootRotation.w));
  assert.ok(solA.rootRotation.angleTo(solB.rootRotation) < 1e-9);
});

test("IK: swing-twist limit leaves in-range rotations alone and clamps the cone", () => {
  const axis = new Vector3(0, -1, 0);
  const inRange = new Quaternion().setFromEuler(new Euler(0.3, 0.2, 0.1));
  const copy = inRange.clone();
  const r1 = clampSwingTwist(copy, axis, Math.PI / 2, Math.PI / 3);
  assert.equal(r1.limited, false);
  // angleTo uses acos, which only resolves ~1e-8 near identity
  assert.ok(copy.angleTo(inRange) < 1e-6);

  const big = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 2.5);
  const r2 = clampSwingTwist(big, axis, Math.PI / 2, Math.PI / 3);
  assert.equal(r2.limited, true);
  const boneDir = axis.clone().applyQuaternion(big);
  assert.ok(Math.abs(boneDir.angleTo(axis) - Math.PI / 2) < 1e-9);

  const twisted = new Quaternion().setFromAxisAngle(axis, 2);
  const r3 = clampSwingTwist(twisted, axis, Math.PI / 2, Math.PI / 3);
  assert.equal(r3.limited, true);
  assert.ok(Math.abs(r3.twistRad - Math.PI / 3) < 1e-9);
});

// ── Animator integration on a synthetic rig ─────────────────────────────────

function armRig(): ArmPreviewRig {
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
  joints.rightShoulder.position.set(-0.333, 0.263, -0.18);
  joints.rightElbow.position.set(-0.04, -0.145, -0.05);
  joints.rightWrist.position.set(-0.09, -0.305, 0.105);
  // legs: thigh 0.43 m, shin 0.44 m, slightly bent in bind like a real asset
  joints.rightHip.position.set(-0.1, -0.06, 0);
  joints.rightKnee.position.set(0, -0.43, 0.03);
  joints.rightAnkle.position.set(0, -0.44, -0.04);
  joints.leftHip.position.set(0.1, -0.06, 0);
  joints.leftKnee.position.set(0, -0.43, 0.03);
  joints.leftAnkle.position.set(0, -0.44, -0.04);
  // non-identity bind rotations, like a real glTF skeleton
  joints.rightShoulder.quaternion.setFromEuler(new Euler(0.2, -0.4, 0.1));
  joints.rightElbow.quaternion.setFromEuler(new Euler(-0.1, 0.3, 0.05));
  joints.rightHip.quaternion.setFromEuler(new Euler(0.05, 0.1, -0.03));
  joints.leftHip.quaternion.setFromEuler(new Euler(0.05, -0.1, 0.03));
  for (const [child, parent] of Object.entries(parents) as [
    JointName,
    JointName,
  ][]) {
    joints[parent].add(joints[child]);
  }
  root.updateMatrixWorld(true);
  return {
    variant: "sentinel",
    hasEmbeddedEquipment: false,
    displayRoot: root,
    joints,
    bindPose: Object.fromEntries(
      JOINTS.map((j) => [j, joints[j].quaternion.clone()]),
    ) as ArmPreviewRig["bindPose"],
    sockets: {
      rightHand: new Object3D(),
      leftHand: new Object3D(),
      leftForearm: new Object3D(),
      back: new Object3D(),
    },
    parts: {},
    originalMaterials: new Map(),
  };
}

function handInRoot(r: ArmPreviewRig): Vector3 {
  r.displayRoot.updateMatrixWorld(true);
  return r.displayRoot.worldToLocal(
    r.joints.rightWrist.getWorldPosition(new Vector3()),
  );
}

/** Hand position of an FK pose plus a pole beside that pose's elbow (displayRoot space). */
function fkTargetAndPole(r: ArmPreviewRig) {
  r.displayRoot.updateMatrixWorld(true);
  const local = (j: JointName) =>
    r.displayRoot.worldToLocal(r.joints[j].getWorldPosition(new Vector3()));
  const S = local("rightShoulder");
  const E = local("rightElbow");
  const target = local("rightWrist");
  const line = target.clone().sub(S).normalize();
  const m = E.clone().sub(S);
  m.addScaledVector(line, -m.dot(line));
  return { target, pole: E.clone().add(m.setLength(0.3)) };
}

test("IK layer: hand reaches an FK-generated target and keeps solving while no clip plays", () => {
  const r = armRig();
  const a = new Animator(r);
  a.setTransitionMode("cut");
  // elbow 60° keeps the target well inside the reach range even after the
  // torso turn below moves the shoulder (at 20° it ends up out of reach).
  a.manual({ rightShoulder: 30, rightElbow: 60, torso: 20 });
  const { target, pole } = fkTargetAndPole(r);
  a.manual({ torso: 20 });
  a.setIkEnabled(true);
  a.setIkPole(pole.x, pole.y, pole.z);
  a.setIkTarget(target.x, target.y, target.z);
  assert.equal(a.playing, false);
  assert.ok(handInRoot(r).distanceTo(target) < 1e-6);

  // torso turns while holding: IK re-solves in the new torso frame on update()
  a.manual({ torso: 10 });
  a.update(1 / 60);
  assert.ok(handInRoot(r).distanceTo(target) < 1e-6);
  const s = a.ikStatus();
  assert.equal(s.reachable, true);
  assert.ok(s.error < 1e-6);
  // elbow stays a one-way hinge inside its limit
  assert.ok(s.bendDeg >= 0 && s.bendDeg <= 90);
});

test("IK layer: switching IK on/off blends over transitionDuration instead of snapping", () => {
  const r = armRig();
  const a = new Animator(r);
  a.manual({ rightShoulder: 40, rightElbow: 20 });
  const { target, pole } = fkTargetAndPole(r);
  a.manual({});
  const bindHand = handInRoot(r);
  a.setIkPole(pole.x, pole.y, pole.z);
  a.setIkTarget(target.x, target.y, target.z);
  a.setIkEnabled(true);
  // blend mode: nothing moves until time passes
  assert.ok(handInRoot(r).distanceTo(bindHand) < 1e-9);
  a.update(a.transitionDuration / 2);
  const mid = handInRoot(r);
  assert.ok(mid.distanceTo(bindHand) > 1e-3);
  assert.ok(mid.distanceTo(target) > 1e-3);
  a.update(a.transitionDuration);
  assert.ok(handInRoot(r).distanceTo(target) < 1e-6);

  a.setIkEnabled(false);
  a.update(a.transitionDuration * 2);
  assert.ok(handInRoot(r).distanceTo(bindHand) < 1e-9);
  assert.equal(a.ikIsActive, false);
});

// ── Foot planting (T16 step 7) ──────────────────────────────────────────────

function modelPos(r: ArmPreviewRig, j: JointName): Vector3 {
  r.displayRoot.updateMatrixWorld(true);
  return r.displayRoot.worldToLocal(r.joints[j].getWorldPosition(new Vector3()));
}

function modelQ(r: ArmPreviewRig, j: JointName): Quaternion {
  r.displayRoot.updateMatrixWorld(true);
  return r.displayRoot
    .getWorldQuaternion(new Quaternion())
    .invert()
    .multiply(r.joints[j].getWorldQuaternion(new Quaternion()));
}

test("foot planting: ankles stay put and feet stay flat while the pelvis lowers", () => {
  const r = armRig();
  const a = new Animator(r);
  a.setTransitionMode("cut");
  a.manual({ rightHip: 5, leftHip: 5, rightKnee: 10, leftKnee: 10 });
  const planted = (["rightAnkle", "leftAnkle"] as const).map((j) => ({
    p: modelPos(r, j),
    q: modelQ(r, j),
  }));
  const pelvisY0 = modelPos(r, "pelvis").y;
  const fkLeg = (["rightHip", "rightKnee", "leftHip", "leftKnee"] as const).map(
    (j) => r.joints[j].quaternion.clone(),
  );
  a.setFootIkEnabled(true);
  // zero crouch: IK reproduces the FK legs exactly (no jump when switching on)
  (["rightHip", "rightKnee", "leftHip", "leftKnee"] as const).forEach((j, i) =>
    assert.ok(r.joints[j].quaternion.angleTo(fkLeg[i]) < 1e-6, `${j} moved at zero crouch`),
  );

  for (const depth of [0, 0.02, 0.05, 0.08]) {
    a.setCrouch(depth);
    assert.ok(Math.abs(modelPos(r, "pelvis").y - (pelvisY0 - depth)) < 1e-9);
    (["rightAnkle", "leftAnkle"] as const).forEach((j, i) => {
      assert.ok(modelPos(r, j).distanceTo(planted[i].p) < 1e-6, `${j} slid at ${depth}`);
      // the ankle is a 1-axis pitch joint: with this rig's slightly rolled hip
      // bind it cannot cancel the last fraction of a degree of foot roll
      assert.ok(modelQ(r, j).angleTo(planted[i].q) < MathUtils.degToRad(0.5), `${j} tilted at ${depth}`);
    });
    const s = a.footStatus();
    assert.equal(s.reachable, true);
    assert.ok(s.error < 1e-6);
    for (const leg of s.legs) assert.ok(leg.bendDeg >= 0 && leg.bendDeg <= 55);
  }

  // updates while holding must not accumulate the drop
  a.update(1 / 60);
  a.update(1 / 60);
  assert.ok(Math.abs(modelPos(r, "pelvis").y - (pelvisY0 - 0.08)) < 1e-9);
  assert.ok(modelPos(r, "rightAnkle").distanceTo(planted[0].p) < 1e-6);

  // deeper than the knee limit allows: clamped, finite, reported
  a.setCrouch(FOOT_IK_CONFIG.maxCrouch);
  const deep = a.footStatus();
  assert.equal(deep.reachable, false);
  assert.ok(Number.isFinite(deep.error) && deep.error > 1e-3);
  for (const leg of deep.legs) assert.ok(Math.abs(leg.bendDeg - 55) < 1e-6);

  // off: pelvis and legs return to the FK pose
  a.setFootIkEnabled(false);
  assert.ok(Math.abs(modelPos(r, "pelvis").y - pelvisY0) < 1e-9);
  assert.ok(modelPos(r, "rightAnkle").distanceTo(planted[0].p) < 1e-9);
});

test("foot planting: the knee bends forward (toward +Z) and arm IK still works on top", () => {
  const r = armRig();
  const a = new Animator(r);
  a.setTransitionMode("cut");
  a.manual({ rightShoulder: 30, rightElbow: 60, torso: 20 });
  const { target, pole } = fkTargetAndPole(r);
  a.setFootIkEnabled(true);
  a.setCrouch(0.06);
  for (const [hip, knee, ankle] of [
    ["rightHip", "rightKnee", "rightAnkle"],
    ["leftHip", "leftKnee", "leftAnkle"],
  ] as const) {
    const H = modelPos(r, hip);
    const K = modelPos(r, knee);
    const A = modelPos(r, ankle);
    const line = A.clone().sub(H).normalize();
    const off = K.clone().sub(H);
    off.addScaledVector(line, -off.dot(line));
    assert.ok(off.z > 0, `${knee} bends backward`);
  }
  // hand target given in model space is still reached after the crouch moved the torso
  a.setIkEnabled(true);
  a.setIkPole(pole.x, pole.y, pole.z);
  a.setIkTarget(target.x, target.y - 0.03, target.z);
  assert.ok(a.ikStatus().error < 1e-6);
  assert.ok(a.footStatus().error < 1e-6);
});

test("foot drag: lifting a foot bends the knee forward like a high knee, weight shifts to the other foot", () => {
  const r = armRig();
  const a = new Animator(r);
  a.setTransitionMode("cut");
  a.manual({ rightHip: 5, leftHip: 5, rightKnee: 10, leftKnee: 10 });
  a.setFootIkEnabled(true);
  const pelvis0 = modelPos(r, "pelvis");
  const left0 = modelPos(r, "leftAnkle");
  const [rx, ry, rz] = a.footPlantPositions()[0];
  const bend0 = a.footStatus().legs[0].bendDeg;

  // lift the right foot 10 cm and 5 cm forward
  a.setFootPlant(0, rx, ry + 0.1, rz + 0.05);
  const s = a.footStatus();
  assert.ok(s.error < 1e-6, `lift error ${s.error}`);
  assert.equal(s.limited, false);
  assert.ok(s.legs[0].bendDeg > bend0 + 20, "knee did not bend");
  // knee goes forward/up: in front of the hip→ankle line
  const H = modelPos(r, "rightHip");
  const K = modelPos(r, "rightKnee");
  const A = modelPos(r, "rightAnkle");
  const line = A.clone().sub(H).normalize();
  const off = K.clone().sub(H);
  off.addScaledVector(line, -off.dot(line));
  assert.ok(off.z > 0.03, "knee not forward");
  // hip stays inside its anatomical limits (pitch ≤ 45°, little side swing)
  assert.ok(s.legs[0].swingDeg <= 45 + 1e-6);
  // the lifted foot no longer supports the body: pelvis moves over the left foot
  // (+X), no automatic drop, and the stance foot stays planted
  const p = modelPos(r, "pelvis");
  // (sideways follow 12 % of the half stance width 0.1 m → ≈ 1.2–1.5 cm)
  assert.ok(p.x > pelvis0.x + 0.01, `pelvis x ${p.x - pelvis0.x}`);
  assert.ok(Math.abs(s.autoDrop) < 1e-12);
  assert.ok(modelPos(r, "leftAnkle").distanceTo(left0) < 1e-6);

  // too high for the 55° knee: the leg stops at its limits and the handle
  // snaps back onto the foot (it does not float away from it)
  a.setFootPlant(0, rx, ry + 0.3, rz + 0.1);
  const hi = a.footStatus();
  assert.ok(a.footPlantPositions()[0][1] < ry + 0.3 - 0.05, "handle not snapped");
  assert.ok(hi.legs[0].bendDeg <= 55 + 1e-6);
  assert.ok(hi.error < 0.01, `snapped error ${hi.error}`);

  // cannot push the foot below the floor
  a.setFootPlant(0, rx, ry - 0.1, rz);
  assert.ok(Math.abs(a.footPlantPositions()[0][1] - ry) < 1e-12);

  // off: back to FK exactly
  a.setFootIkEnabled(false);
  assert.ok(modelPos(r, "pelvis").distanceTo(pelvis0) < 1e-9);
});

test("foot drag: stepping fore–aft turns the pelvis a little, legs do not splay, ankles exact", () => {
  const r = armRig();
  const a = new Animator(r);
  a.setTransitionMode("cut");
  a.manual({ rightHip: 5, leftHip: 5, rightKnee: 10, leftKnee: 10 });
  a.setFootIkEnabled(true);
  const [rx, ry, rz] = a.footPlantPositions()[0];
  const [lx, ly, lz] = a.footPlantPositions()[1];
  a.setFootPlant(0, rx, ry, rz + 0.12); // right foot steps forward
  a.setFootPlant(1, lx, ly, lz - 0.08); // left foot back
  const s = a.footStatus();
  assert.ok(s.error < 1e-6, `step error ${s.error}`);
  assert.equal(s.limited, false);
  assert.ok(Math.abs(s.pelvisYawDeg) > 1 && Math.abs(s.pelvisYawDeg) <= 10 + 1e-9);
  // knees stay in front of their legs (no sideways splay)
  for (const [hip, knee, ankle] of [
    ["rightHip", "rightKnee", "rightAnkle"],
    ["leftHip", "leftKnee", "leftAnkle"],
  ] as const) {
    const H = modelPos(r, hip);
    const off = modelPos(r, knee).sub(H);
    const line = modelPos(r, ankle).sub(H).normalize();
    off.addScaledVector(line, -off.dot(line));
    assert.ok(off.z > Math.abs(off.x), `${knee} splays sideways`);
  }
});

test("hip limit: sideways (splay) swing is limited to a few degrees, pitch to JOINT_LIMITS", () => {
  const r = armRig();
  const a = new Animator(r);
  a.setTransitionMode("cut");
  a.manual({ rightHip: 5, leftHip: 5, rightKnee: 10, leftKnee: 10 });
  a.setFootIkEnabled(true);
  const [rx, ry, rz] = a.footPlantPositions()[0];
  // force the right foot 30 cm outward: the hip cannot abduct that far
  a.setFootPlant(0, rx - 0.3, ry + 0.05, rz);
  const s = a.footStatus();
  assert.ok(s.legs[0].swingDeg < 20, `swing ${s.legs[0].swingDeg}`);
  // the handle snapped back to where the limited leg could put the foot
  assert.ok(a.footPlantPositions()[0][0] > rx - 0.2, "foot splayed out");
});

test("knee pole: dragging it swings the knee toward it while the ankle stays planted", () => {
  const r = armRig();
  const a = new Animator(r);
  a.setTransitionMode("cut");
  a.manual({ rightHip: 5, leftHip: 5, rightKnee: 10, leftKnee: 10 });
  a.setFootIkEnabled(true);
  a.setCrouch(0.06);
  const ankle0 = modelPos(r, "rightAnkle");
  const H = modelPos(r, "rightHip");
  // knee pole turned 8° outward (toward −X) from straight ahead, at knee height
  const out8 = new Vector3(-Math.sin(0.14), 0, Math.cos(0.14));
  const pole = modelPos(r, "rightKnee").addScaledVector(out8, 0.5);
  a.setFootPole(0, pole.x, pole.y, pole.z);
  assert.equal(a.footStatus().limited, false);
  const K = modelPos(r, "rightKnee");
  const A = modelPos(r, "rightAnkle");
  const line = A.clone().sub(H).normalize();
  const kOff = K.clone().sub(H);
  kOff.addScaledVector(line, -kOff.dot(line));
  const pOff = pole.clone().sub(H);
  pOff.addScaledVector(line, -pOff.dot(line));
  assert.ok(kOff.normalize().dot(pOff.normalize()) > 0.99, "knee not toward pole");
  assert.ok(A.distanceTo(ankle0) < 1e-6);
  // knee pulled straight sideways needs ~90° hip twist: the ±15° limit clamps it
  const side = modelPos(r, "rightKnee").add(new Vector3(-0.5, 0, 0));
  a.setFootPole(0, side.x, side.y, side.z);
  assert.equal(a.footStatus().limited, true);
  // re-plant resets knees to automatic
  a.resetFootPlant();
  const auto = a.footPolePositions()[0];
  assert.ok(new Vector3(...auto).distanceTo(pole) > 0.1);
});

test("squat clip: the pelvis follows the keyed drop and the feet stay planted throughout", () => {
  const r = armRig();
  const a = new Animator(r);
  a.setTransitionMode("cut");
  a.manual({ rightHip: 6, leftHip: 6, rightKnee: 12, leftKnee: 12, rightAnkle: 6, leftAnkle: 6 });
  a.setFootIkEnabled(true);
  const plants = a.footPlantPositions().map((p) => new Vector3(...p));
  const pelvisY0 = modelPos(r, "pelvis").y;
  a.play("squat");
  let deepest = 0;
  for (let k = 0; k < 160; k++) {
    a.update(1 / 60);
    const s = a.footStatus();
    deepest = Math.max(deepest, pelvisY0 - modelPos(r, "pelvis").y);
    assert.equal(s.reachable, true, `unreachable at frame ${k}`);
    assert.ok(modelPos(r, "rightAnkle").distanceTo(plants[0]) < 1e-6);
    assert.ok(modelPos(r, "leftAnkle").distanceTo(plants[1]) < 1e-6);
  }
  assert.ok(Math.abs(deepest - 0.08) < 1e-3, `deepest ${deepest}`);
  // after the clip (→ idle) the pelvis is back up
  assert.ok(Math.abs(a.footStatus().crouch) < 1e-9);
});
