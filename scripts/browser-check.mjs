import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 1520, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [],
  failedRequests = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400)
    failedRequests.push({ url: r.url(), status: r.status() });
});
const base = process.env.HANGAR_URL ?? "http://127.0.0.1:5174/";

const TEST_POSE_ORDER = [
  "bind",
  "rightArmAim",
  "leftArmGuard",
  "dualArmReady",
  "torsoTwist",
  "crouch",
  "deepCrouchAim",
  "fullBodyTwistCrouch",
  "maxArticulation",
];

const JOINTS_15 = [
  "pelvis",
  "torso",
  "head",
  "rightShoulder",
  "rightElbow",
  "rightWrist",
  "leftShoulder",
  "leftElbow",
  "leftWrist",
  "rightHip",
  "rightKnee",
  "rightAnkle",
  "leftHip",
  "leftKnee",
  "leftAnkle",
];

const GAP_VIEWS_6 = [
  { id: "front", target: [0, 0.96, 0], pos: [0, 1.0, 4.1] },
  { id: "back", target: [0, 0.96, 0], pos: [0, 1.0, -4.1] },
  { id: "right", target: [0, 0.96, 0], pos: [-4.1, 1.0, 0] },
  { id: "left", target: [0, 0.96, 0], pos: [4.1, 1.0, 0] },
  { id: "frontRight34", target: [0, 0.96, 0], pos: [-2.85, 1.05, 2.95] },
  { id: "frontLeft34", target: [0, 0.96, 0], pos: [2.85, 1.05, 2.95] },
];

async function measureFrameTimes(page, mode, frames = 90) {
  return await page.evaluate(
    async ({ mode, frames }) => {
      window.__hangar.commands.setSkinningMode(mode);
      window.__hangar.commands.pose("deepCrouchAim");
      const deltas = [];
      let prev = performance.now();
      for (let i = 0; i < frames; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const now = performance.now();
        if (i >= 5) deltas.push(now - prev);
        prev = now;
      }
      const sorted = [...deltas].sort((a, b) => a - b);
      const mean =
        deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      return {
        mode,
        samples: deltas.length,
        meanMs: Number(mean.toFixed(3)),
        medianMs: Number(median.toFixed(3)),
        p95Ms: Number(p95.toFixed(3)),
      };
    },
    { mode, frames },
  );
}

try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__hangar?.getState().ready, {
    timeout: 30000,
  });
  checks.push(
    "gundam-sentinel.glb (Rigid armor default) and 3 external equipment GLBs loaded",
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/results/rigid-bind-orbit.png" });

  const bindDiag = await page.evaluate(() => window.__hangar.diagnostics());
  assert.equal(bindDiag.mode, "sentinel");
  assert.equal(bindDiag.skinningMode, "rigid");
  assert.ok(
    bindDiag.boundaryGroups > 500,
    `Expected >500 boundary groups, got ${bindDiag.boundaryGroups}`,
  );
  const bindLeftFootY = bindDiag.leftFootMinY;
  const bindRightFootY = bindDiag.rightFootMinY;

  // 1. Verify all 9 test poses: Rigid edge-length strain (~0), Smooth LBS edge-length strain,
  //    LBS seam continuity, LBS-vs-Three.js diff, skirt FK, per-item M6 attachment errors, and foot grounding.
  const poseResults = [];
  const lbsSeamSet = new Set();
  const vsThreeSet = new Set();

  for (const poseName of TEST_POSE_ORDER) {
    // Evaluate in Rigid armor (default)
    await page.evaluate(() => window.__hangar.commands.setSkinningMode("rigid"));
    await page.locator(`[data-pose="${poseName}"]`).click();
    await page.waitForTimeout(70);
    const dRigid = await page.evaluate(() => window.__hangar.diagnostics());
    const state = await page.evaluate(() => window.__hangar.getState());

    assert.ok(
      dRigid.edgeStrainRigid.maxStrain < 1e-5,
      `Rigid armor edge strain exceeded 1e-5 in ${poseName}: ${dRigid.edgeStrainRigid.maxStrain}`,
    );
    assert.ok(
      dRigid.equipmentAttachmentErrors.saber < 1e-6,
      `Saber attachment drifted in ${poseName}: ${dRigid.equipmentAttachmentErrors.saber}`,
    );
    assert.ok(
      dRigid.equipmentAttachmentErrors.rifle < 1e-6,
      `Rifle attachment drifted in ${poseName}: ${dRigid.equipmentAttachmentErrors.rifle}`,
    );
    assert.ok(
      dRigid.equipmentAttachmentErrors.shield < 1e-6,
      `Shield attachment drifted in ${poseName}: ${dRigid.equipmentAttachmentErrors.shield}`,
    );
    assert.ok(
      Math.abs(dRigid.leftFootMinY - bindLeftFootY) < 1e-3,
      `Left foot left platform in ${poseName}: ${dRigid.leftFootMinY} vs ${bindLeftFootY}`,
    );
    assert.ok(
      Math.abs(dRigid.rightFootMinY - bindRightFootY) < 1e-3,
      `Right foot left platform in ${poseName}: ${dRigid.rightFootMinY} vs ${bindRightFootY}`,
    );

    // Evaluate Smooth LBS comparison metrics on the exact same pose
    await page.evaluate(() => window.__hangar.commands.setSkinningMode("lbs"));
    await page.waitForTimeout(50);
    const dLbs = await page.evaluate(() => window.__hangar.diagnostics());
    assert.ok(
      dLbs.lbsSeamGapMax < 1e-5,
      `Smooth LBS boundary separated in ${poseName}: ${dLbs.lbsSeamGapMax}`,
    );
    assert.ok(
      dLbs.lbsVsThreeMaxDiff < 1e-6,
      `Smooth LBS vs Three.js diff too large in ${poseName}: ${dLbs.lbsVsThreeMaxDiff}`,
    );

    lbsSeamSet.add(dLbs.lbsSeamGapMax.toExponential(4));
    vsThreeSet.add(dLbs.lbsVsThreeMaxDiff.toExponential(4));

    poseResults.push({
      pose: poseName,
      angles: state.angles,
      skirtAngles: dRigid.skirtAngles,
      boundaryGroups: dLbs.boundaryGroups,
      skinnedVertexCount: dLbs.skinnedVertexCount,
      edgeStrainRigid: dRigid.edgeStrainRigid,
      edgeStrainLbs: dLbs.edgeStrainLbs,
      lbsSeamGapMax: dLbs.lbsSeamGapMax,
      lbsSeamGapMean: dLbs.lbsSeamGapMean,
      lbsVsThreeMaxDiff: dLbs.lbsVsThreeMaxDiff,
      lbsVsThreeMeanDiff: dLbs.lbsVsThreeMeanDiff,
      equipmentAttachmentErrors: dRigid.equipmentAttachmentErrors,
      leftFootMinY: dRigid.leftFootMinY,
      rightFootMinY: dRigid.rightFootMinY,
    });
  }
  await page.evaluate(() => window.__hangar.commands.setSkinningMode("rigid"));
  assert.equal(
    lbsSeamSet.size,
    TEST_POSE_ORDER.length,
    "Expected per-pose Smooth LBS seam gap to differ across all 9 poses",
  );
  assert.equal(
    vsThreeSet.size,
    TEST_POSE_ORDER.length,
    "Expected per-pose Smooth LBS vs Three.js max diff to differ across all 9 poses",
  );
  checks.push(
    "all 9 test poses pass Rigid armor zero-strain (<1e-5), skirt FK, Smooth LBS comparison (<1e-5 seam, <1e-6 vs Three.js), M6 attachment (<1e-6), and foot grounding",
  );

  // 2. Requirement 8b: Visible-gap check (6 views x 9 poses, background pixels showing through body silhouette)
  await page.evaluate(() => {
    const c = window.__hangar.commands;
    c.setRightHandItem("none");
    c.setShieldVisible(false);
  });
  await page.waitForTimeout(80);

  const visibleGapReport = [];
  for (const poseName of TEST_POSE_ORDER) {
    await page.locator(`[data-pose="${poseName}"]`).click();
    await page.waitForTimeout(60);
    const rigidViews = await page.evaluate((views) => {
      const c = window.__hangar.commands;
      c.setSkinningMode("rigid");
      c.setRigidInnerFrameVisible(true);
      return views.map((v) => ({
        view: v.id,
        ...c.measureSilhouetteHoleView(v.target, v.pos, 512),
      }));
    }, GAP_VIEWS_6);
    const rigidNoFillersViews = await page.evaluate((views) => {
      const c = window.__hangar.commands;
      c.setSkinningMode("rigid");
      c.setRigidInnerFrameVisible(false);
      const res = views.map((v) => ({
        view: v.id,
        ...c.measureSilhouetteHoleView(v.target, v.pos, 512),
      }));
      c.setRigidInnerFrameVisible(true);
      return res;
    }, GAP_VIEWS_6);
    const lbsViews = await page.evaluate((views) => {
      const c = window.__hangar.commands;
      c.setSkinningMode("lbs");
      return views.map((v) => ({
        view: v.id,
        ...c.measureSilhouetteHoleView(v.target, v.pos, 512),
      }));
    }, GAP_VIEWS_6);

    const rigidTotalHoles = rigidViews.reduce((a, b) => a + b.holePixels, 0);
    const rigidNoFillersTotalHoles = rigidNoFillersViews.reduce(
      (a, b) => a + b.holePixels,
      0,
    );
    const lbsTotalHoles = lbsViews.reduce((a, b) => a + b.holePixels, 0);
    assert.ok(
      rigidTotalHoles <= lbsTotalHoles,
      `Expected rigid hole pixels (${rigidTotalHoles}) <= smooth LBS (${lbsTotalHoles}) on ${poseName}`,
    );
    visibleGapReport.push({
      pose: poseName,
      rigidTotalHolePixels: rigidTotalHoles,
      rigidNoFillersTotalHolePixels: rigidNoFillersTotalHoles,
      lbsTotalHolePixels: lbsTotalHoles,
      rigidPerView: rigidViews.map((v) => ({
        view: v.view,
        holePixels: v.holePixels,
        bodyPixels: v.bodyPixels,
        componentCount: v.componentCount,
        largestComponentPx: v.largestComponentPx,
        topComponents: v.topComponents,
      })),
      rigidNoFillersPerView: rigidNoFillersViews.map((v) => ({
        view: v.view,
        holePixels: v.holePixels,
        componentCount: v.componentCount,
      })),
      lbsPerView: lbsViews.map((v) => ({
        view: v.view,
        holePixels: v.holePixels,
        componentCount: v.componentCount,
      })),
    });
  }
  await page.evaluate(() => window.__hangar.commands.setSkinningMode("rigid"));
  checks.push(
    "6-view x 9-pose silhouette visible-gap pixel check completed for Rigid armor vs Smooth LBS",
  );

  // 3. Requirement 8a: Strain heat-map screenshots (Smooth LBS at torsoTwist and maxArticulation + Rigid at maxArticulation)
  await page.evaluate(() => {
    const c = window.__hangar.commands;
    c.setRightHandItem("none");
    c.setShieldVisible(false);
    c.setLoadoutCollapsed(true);
  });
  await page.waitForTimeout(100);

  // torsoTwist LBS strain heatmap
  await page.evaluate(() => {
    const c = window.__hangar.commands;
    c.setSkinningMode("lbs");
    c.pose("torsoTwist");
    c.setStrainHeatmap(true);
    c.focusCamera([0.0, 1.15, 0.0], [-1.35, 1.32, 2.75]);
  });
  await page.waitForTimeout(220);
  await page.screenshot({
    path: "docs/results/rigid-strain-heatmap-torsoTwist.png",
  });

  // maxArticulation LBS strain heatmap
  await page.evaluate(() => {
    const c = window.__hangar.commands;
    c.setSkinningMode("lbs");
    c.pose("maxArticulation");
    c.setStrainHeatmap(true);
    c.focusCamera([0.0, 1.02, 0.0], [-1.55, 1.25, 2.95]);
  });
  await page.waitForTimeout(220);
  await page.screenshot({
    path: "docs/results/rigid-strain-heatmap-maxArticulation.png",
  });

  // maxArticulation Rigid armor strain heatmap (zero strain reference)
  await page.evaluate(() => {
    const c = window.__hangar.commands;
    c.setSkinningMode("rigid");
    c.pose("maxArticulation");
    c.setStrainHeatmap(true);
    c.focusCamera([0.0, 1.02, 0.0], [-1.55, 1.25, 2.95]);
  });
  await page.waitForTimeout(220);
  await page.screenshot({
    path: "docs/results/rigid-strain-heatmap-rigid-maxArticulation.png",
  });

  await page.evaluate(() => window.__hangar.commands.setStrainHeatmap(false));
  checks.push(
    "captured edge-length strain heat-map screenshots for torsoTwist and maxArticulation",
  );

  // 4. Requirement 8c: Before/after close-ups at the EXACT SAME camera (Smooth LBS vs Rigid armor)
  //    (1) shoulder decal, (2) front skirt, (3) waist twist, (4) knee bend
  const closeups = [
    {
      name: "shoulder",
      poseAngles: {
        pelvis: -10,
        torso: 28,
        head: -18,
        rightShoulder: 62,
        rightElbow: 18,
        leftShoulder: 10,
      },
      focusFn: (j) => {
        const [sx, sy, sz] = j.rightShoulder;
        return {
          target: [sx + 0.04, sy - 0.02, sz + 0.03],
          pos: [sx - 0.34, sy + 0.04, sz + 0.78],
        };
      },
    },
    {
      name: "skirt",
      poseAngles: {
        rightHip: 27,
        rightKnee: 54,
        rightAnkle: 27,
        leftHip: 27,
        leftKnee: 54,
        leftAnkle: 27,
        rightShoulder: 15,
        leftShoulder: 15,
      },
      focusFn: (j) => {
        const [px, py, pz] = j.pelvis;
        return {
          target: [px, py - 0.06, pz + 0.06],
          pos: [px - 0.42, py + 0.08, pz + 0.96],
        };
      },
    },
    {
      name: "waist",
      poseAngles: {
        pelvis: -18,
        torso: 38,
        head: -25,
        rightShoulder: 12,
        rightElbow: 10,
        leftShoulder: 12,
        leftElbow: 10,
      },
      focusFn: (j) => {
        const [tx, ty, tz] = j.torso;
        return {
          target: [tx, ty - 0.02, tz + 0.02],
          pos: [tx - 0.14, ty + 0.05, tz + 0.88],
        };
      },
    },
    {
      name: "knee-45",
      poseAngles: {
        rightHip: 22,
        rightKnee: 45,
        rightAnkle: 22,
        leftHip: 22,
        leftKnee: 45,
        leftAnkle: 22,
      },
      focusFn: (j) => {
        const [kx, ky, kz] = j.rightKnee;
        return {
          target: [kx, ky - 0.02, kz + 0.02],
          pos: [kx - 0.65, ky + 0.08, kz + 0.56],
        };
      },
    },
    {
      name: "knee",
      poseAngles: {
        rightHip: 27,
        rightKnee: 55,
        rightAnkle: 27,
        leftHip: 27,
        leftKnee: 55,
        leftAnkle: 27,
      },
      focusFn: (j) => {
        const [kx, ky, kz] = j.rightKnee;
        return {
          target: [kx, ky - 0.02, kz + 0.02],
          pos: [kx - 0.65, ky + 0.08, kz + 0.56],
        };
      },
    },
  ];

  for (const cu of closeups) {
    await page.evaluate((angles) => {
      const c = window.__hangar.commands;
      c.setRightHandItem("none");
      c.setShieldVisible(false);
      c.setPoseAngles(angles);
    }, cu.poseAngles);
    const jointsPos = (
      await page.evaluate(() => window.__hangar.diagnostics())
    ).jointWorldPositions;
    const cam = cu.focusFn(jointsPos);

    await page.evaluate(({ target, pos }) => {
      const c = window.__hangar.commands;
      c.setSkinningMode("lbs");
      c.focusCamera(target, pos);
    }, cam);
    await page.waitForTimeout(220);
    await page.screenshot({
      path: `docs/results/rigid-compare-${cu.name}-lbs.png`,
    });

    await page.evaluate(({ target, pos }) => {
      const c = window.__hangar.commands;
      c.setSkinningMode("rigid");
      c.focusCamera(target, pos);
    }, cam);
    await page.waitForTimeout(220);
    await page.screenshot({
      path: `docs/results/rigid-compare-${cu.name}-rigid.png`,
    });
  }
  checks.push(
    "captured before/after same-camera close-ups (LBS vs Rigid) for shoulder decal, front skirt, waist twist, and knee bend",
  );

  // Restore Loadout drawer & equipment for interactive UI / action / equipment checks
  await page.evaluate(() => {
    const c = window.__hangar.commands;
    c.setLoadoutCollapsed(false);
    c.setRightHandItem("rifle");
    c.setShieldVisible(true);
    c.camera("orbit");
  });
  await page.locator('[data-pose="bind"]').click();
  await page.waitForTimeout(160);

  // 5. Verify Loadout drawer & Actions (aim / swing / idle) with auto-equip in Rigid armor mode
  await page.locator('[data-right-hand="saber"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().rightHandItem),
    "saber",
  );
  assert.equal(await page.locator("#saber-blade-toggle").isDisabled(), false);
  await page.locator("#saber-blade-toggle").uncheck();
  await page.locator("#saber-blade-toggle").check();
  await page.locator('[data-right-hand="none"]').click();
  assert.equal(await page.locator("#saber-blade-toggle").isDisabled(), true);

  await page.locator('[data-action="aim"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().rightHandItem),
    "rifle",
  );
  await page.waitForTimeout(1300);
  const aimDiag = await page.evaluate(() => window.__hangar.diagnostics());
  assert.equal(aimDiag.status, "holding");
  assert.ok(aimDiag.equipmentAttachmentErrors.rifle < 1e-6);
  assert.ok(aimDiag.equipmentAttachmentErrors.shield < 1e-6);
  await page.screenshot({ path: "docs/results/rigid-action-aim.png" });

  await page.locator('[data-action="swing"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().rightHandItem),
    "saber",
  );
  await page.waitForTimeout(820);
  const swingDiag = await page.evaluate(() => window.__hangar.diagnostics());
  assert.ok(swingDiag.equipmentAttachmentErrors.saber < 1e-6);
  assert.ok(swingDiag.equipmentAttachmentErrors.shield < 1e-6);
  await page.screenshot({ path: "docs/results/rigid-action-swing.png" });

  await page.waitForTimeout(1300);
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().action),
    "idle",
  );
  await page.locator("#reset-pose-panel").click();
  checks.push(
    "Loadout drawer, aim/swing auto-equip, and exact M6 attachment verified in Rigid armor mode",
  );

  // 6. Verify all 15 sliders & Inspect tab 3-way toggle ("Rigid armor (default)" / "Smooth LBS" / "Three.js")
  for (const joint of JOINTS_15) {
    const testVal = joint.includes("Knee") || joint.includes("Elbow") ? 35 : 15;
    await page.evaluate(
      ([j, v]) => {
        const slider = document.getElementById(j);
        slider.value = String(v);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      },
      [joint, testVal],
    );
    const currentPose = await page.evaluate(
      () => window.__hangar.getState().angles,
    );
    assert.ok(
      Math.abs(currentPose[joint] - testVal) < 0.2,
      `Joint ${joint} slider failed: got ${currentPose[joint]}`,
    );
  }
  await page.locator("#reset-pose-panel").click();

  await page.getByRole("tab", { name: "检查", exact: true }).click();
  await page.locator('[data-skinning="lbs"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().skinning),
    "lbs",
  );
  await page.locator('[data-skinning="three"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().skinning),
    "three",
  );
  await page.locator('[data-skinning="rigid"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().skinning),
    "rigid",
  );

  await page.evaluate(() => {
    window.__hangar.commands.pose("deepCrouchAim");
    window.__hangar.commands.camera("orbit");
  });
  await page.locator("#parts").check();
  await page.waitForTimeout(180);
  await page.screenshot({ path: "docs/results/rigid-parts-crouch.png" });
  await page.locator("#parts").uncheck();

  // Frame time measurements
  const frameTimeRigid = await measureFrameTimes(page, "rigid", 90);
  const frameTimeLbs = await measureFrameTimes(page, "lbs", 90);
  const frameTimeThree = await measureFrameTimes(page, "three", 90);
  await page.locator('[data-skinning="rigid"]').click();
  checks.push(
    "3-way skinning toggle (Rigid armor / Smooth LBS / Three.js) and frame-time comparison verified",
  );

  // 7. Model switch ("Sentinel (new)" / "Legacy")
  await page.getByRole("button", { name: "Legacy", exact: true }).click();
  await page.waitForFunction(
    () =>
      window.__hangar.getState().mode === "legacy" &&
      !window.__hangar.getState().loading,
  );
  const legacyDiag = await page.evaluate(() => window.__hangar.diagnostics());
  assert.equal(legacyDiag.boundaryGroups, 367);
  assert.ok(legacyDiag.lbsSeamGapMax < 1e-5);
  await page
    .getByRole("button", { name: "Sentinel (new)", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      window.__hangar.getState().mode === "sentinel" &&
      !window.__hangar.getState().loading,
  );
  checks.push('model switch ("Sentinel (new)" / "Legacy") verified');

  // 8. Play, pause, reset & mobile 390px layout
  await page.getByRole("tab", { name: "姿态", exact: true }).click();
  await page.locator("#reset-pose").click();
  assert.ok(
    (await page.evaluate(() => window.__hangar.diagnostics())).bindError < 1e-7,
  );
  await page.locator("#play").click();
  await page.waitForTimeout(450);
  assert.ok((await page.evaluate(() => window.__hangar.getState())).time > 0);
  await page.locator("#play").click();
  await page.locator("#reset-pose").click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  checks.push("play/pause/reset and 390px mobile layout verified");

  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  checks.push("no console errors or failed HTTP responses");

  const report = {
    url: base,
    model: "gundam-sentinel.glb",
    defaultSkinningMode: "rigid",
    browser: await browser.version(),
    checks,
    frameTimes: {
      rigid: frameTimeRigid,
      lbs: frameTimeLbs,
      three: frameTimeThree,
    },
    actionAttachmentErrors: {
      aim: aimDiag.equipmentAttachmentErrors,
      swing: swingDiag.equipmentAttachmentErrors,
    },
    poseResults,
    visibleGapReport,
    errors,
    failedRequests,
  };
  await fs.writeFile(
    "docs/results/rigid-browser-validation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        checks,
        frameTimes: report.frameTimes,
        actionAttachmentErrors: report.actionAttachmentErrors,
        strainSummary: poseResults.map((r) => ({
          pose: r.pose,
          rigidMaxStrain: r.edgeStrainRigid.maxStrain,
          rigidMeanStrain: r.edgeStrainRigid.meanStrain,
          lbsMaxStrain: r.edgeStrainLbs.maxStrain,
          lbsMeanStrain: r.edgeStrainLbs.meanStrain,
          lbsStrainedTrisOver1Pct: r.edgeStrainLbs.strainedTrianglesOver1Pct,
          skirtAngles: r.skirtAngles,
        })),
        gapSummary: visibleGapReport.map((g) => ({
          pose: g.pose,
          rigidTotalHolePixels: g.rigidTotalHolePixels,
          rigidNoFillersTotalHolePixels: g.rigidNoFillersTotalHolePixels,
          lbsTotalHolePixels: g.lbsTotalHolePixels,
          rigidPerView: g.rigidPerView.map((v) => `${v.view}:${v.holePixels}`),
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
