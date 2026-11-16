import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
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

const GALLERY_POSES = [
  "bind",
  "dualArmReady",
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
  checks.push("gundam-rigged.glb and textures loaded");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "docs/results/viewer-rest.png" });

  const bindDiag = await page.evaluate(() => window.__hangar.diagnostics());
  assert.equal(bindDiag.boundaryGroups, 367);
  assert.equal(bindDiag.skinningMode, "lbs");
  const bindLeftFootY = bindDiag.leftFootMinY;
  const bindRightFootY = bindDiag.rightFootMinY;

  // 1. Verify all 9 full-body test poses pass seam, LBS-vs-Three.js, attachment, and foot-platform checks
  const seamTests = [];
  const lbsSeamSet = new Set();
  const vsThreeSet = new Set();
  for (const poseName of TEST_POSE_ORDER) {
    await page.locator(`[data-pose="${poseName}"]`).click();
    await page.waitForTimeout(100);
    const d = await page.evaluate(() => window.__hangar.diagnostics());
    const state = await page.evaluate(() => window.__hangar.getState());
    assert.equal(d.boundaryGroups, 367);
    assert.ok(
      d.lbsSeamGapMax < 1e-5,
      `Skin boundary separated in ${poseName}: ${d.lbsSeamGapMax}`,
    );
    assert.ok(
      d.lbsVsThreeMaxDiff < 1e-6,
      `LBS vs Three.js diff too large in ${poseName}: ${d.lbsVsThreeMaxDiff}`,
    );
    if (poseName !== "bind") {
      assert.ok(
        d.rigidSeamGapMax > 0.01,
        `Expected rigid seam gap > 10 mm in ${poseName}, got ${d.rigidSeamGapMax}`,
      );
    }
    assert.ok(
      d.attachmentError < 1e-6,
      `Attachment drifted in ${poseName}: ${d.attachmentError}`,
    );
    assert.ok(
      Math.abs(d.leftFootMinY - bindLeftFootY) < 1e-4,
      `Left foot left platform in ${poseName}: ${d.leftFootMinY} vs ${bindLeftFootY}`,
    );
    assert.ok(
      Math.abs(d.rightFootMinY - bindRightFootY) < 1e-4,
      `Right foot left platform in ${poseName}: ${d.rightFootMinY} vs ${bindRightFootY}`,
    );
    lbsSeamSet.add(d.lbsSeamGapMax.toExponential(4));
    vsThreeSet.add(d.lbsVsThreeMaxDiff.toExponential(4));
    seamTests.push({
      pose: poseName,
      angles: state.angles,
      boundaryGroups: d.boundaryGroups,
      skinnedVertexCount: d.skinnedVertexCount,
      skinSeamGap: d.lbsSeamGapMax,
      skinSeamMeanGap: d.lbsSeamGapMean,
      rigidSeamGapMax: d.rigidSeamGapMax,
      rigidSeamGapMean: d.rigidSeamGapMean,
      lbsVsThreeMaxDiff: d.lbsVsThreeMaxDiff,
      lbsVsThreeMeanDiff: d.lbsVsThreeMeanDiff,
      attachmentError: d.attachmentError,
      leftFootMinY: d.leftFootMinY,
      rightFootMinY: d.rightFootMinY,
    });
  }
  assert.equal(
    lbsSeamSet.size,
    TEST_POSE_ORDER.length,
    "Expected per-pose LBS seam gap to differ across all 9 poses",
  );
  assert.equal(
    vsThreeSet.size,
    TEST_POSE_ORDER.length,
    "Expected per-pose LBS vs Three.js max diff to differ across all 9 poses",
  );
  checks.push(
    "all 9 full-body test poses report distinct per-pose LBS seam gaps (<1e-5 m) and LBS-vs-Three.js diffs (<1e-6 m)",
  );

  // 2. Capture front and side pose gallery screenshots
  for (const poseName of GALLERY_POSES) {
    await page.locator(`[data-pose="${poseName}"]`).click();
    await page.evaluate(() => window.__hangar.commands.camera("front"));
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `docs/results/pose-gallery-front-${poseName}.png`,
    });
    await page.evaluate(() => window.__hangar.commands.camera("side"));
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `docs/results/pose-gallery-side-${poseName}.png`,
    });
  }
  checks.push("captured front and side pose gallery screenshots");

  // 3. Verify every one of the 15 joints can be posed from the viewer sliders and moving pelvis moves the whole body
  await page.locator("#reset-pose-panel").click();
  await page.waitForTimeout(80);
  const bindPositions = (
    await page.evaluate(() => window.__hangar.diagnostics())
  ).jointWorldPositions;

  await page.evaluate(() => {
    const slider = document.getElementById("pelvis");
    slider.value = "20";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(80);
  const pelvisMovedPositions = (
    await page.evaluate(() => window.__hangar.diagnostics())
  ).jointWorldPositions;
  for (const joint of [
    "torso",
    "head",
    "rightShoulder",
    "rightWrist",
    "leftShoulder",
    "leftWrist",
    "rightKnee",
    "leftKnee",
  ]) {
    const p0 = bindPositions[joint];
    const p1 = pelvisMovedPositions[joint];
    const dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    assert.ok(
      dist > 0.0015,
      `Expected ${joint} to move when pelvis rotates, moved ${dist}`,
    );
  }
  await page.locator('[data-pose="crouch"]').click();
  await page.waitForTimeout(80);
  const crouchPositions = (
    await page.evaluate(() => window.__hangar.diagnostics())
  ).jointWorldPositions;
  assert.ok(
    bindPositions.pelvis[1] - crouchPositions.pelvis[1] > 0.04,
    "Expected pelvis root to lower during crouch while keeping feet on platform",
  );
  await page.locator("#reset-pose-panel").click();

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
    const d = await page.evaluate(() => window.__hangar.diagnostics());
    assert.ok(d.skinSeamGap < 1e-5, `Seam gap on ${joint}: ${d.skinSeamGap}`);
  }
  await page.locator("#reset-pose-panel").click();
  checks.push(
    "all 15 joints poseable via viewer sliders; pelvis moves entire body hierarchy",
  );

  // 4. Classic viewer screenshots & close-up views
  await page.evaluate(() => window.__hangar.commands.camera("orbit"));
  await page.locator('[data-pose="rightArmAim"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "docs/results/viewer-raised.png" });
  for (const view of ["side", "top", "back"]) {
    await page.evaluate((view) => {
      window.__hangar.commands.seek(1.6);
      window.__hangar.commands.camera(view);
      window.__hangar.commands.zoom("in");
    }, view);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `docs/results/seam-fix-${view}.png` });
  }

  // 5. Equipment tab checks
  await page.evaluate(() => window.__hangar.commands.camera("orbit"));
  await page.getByRole("tab", { name: "装备", exact: true }).click();
  await page.locator("#weapon").uncheck();
  assert.equal(
    await page.evaluate(() => window.__hangar.diagnostics().weaponVisible),
    false,
  );
  await page.locator("#weapon").check();
  checks.push("weapon hide/show");
  await page.locator("#shield").uncheck();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().shield),
    false,
  );
  await page.locator("#shield").check();
  checks.push("shield hide/show");

  // 6. Inspect tab: test 3-way skinning toggle (Three.js skinning / our LBS / rigid parts) and capture elbow/shoulder comparison screenshots
  await page.getByRole("tab", { name: "检查", exact: true }).click();
  await page.evaluate(() => {
    window.__hangar.commands.pose("dualArmReady");
    window.__hangar.commands.camera("side");
    window.__hangar.commands.zoom("in");
  });
  await page.waitForTimeout(200);

  // 6a. our LBS mode
  await page.locator('[data-skinning="lbs"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().skinning),
    "lbs",
  );
  await page.waitForTimeout(180);
  await page.screenshot({
    path: "docs/results/t14-lbs-shoulder-elbow.png",
  });

  // 6b. rigid parts mode (no blending -> shows elbow & shoulder seam cracks)
  await page.locator('[data-skinning="rigid"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().skinning),
    "rigid",
  );
  const rigidDiag = await page.evaluate(() => window.__hangar.diagnostics());
  assert.ok(
    rigidDiag.skinSeamGap > 0.02,
    `Expected rigid parts mode to report large seam crack, got ${rigidDiag.skinSeamGap}`,
  );
  await page.waitForTimeout(180);
  await page.screenshot({
    path: "docs/results/t14-rigid-shoulder-elbow.png",
  });

  // 6c. Three.js skinning mode
  await page.locator('[data-skinning="three"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().skinning),
    "three",
  );
  await page.waitForTimeout(180);
  await page.screenshot({
    path: "docs/results/t14-three-shoulder-elbow.png",
  });

  // 6d. Part colors + joint axes in both rigid and our LBS
  await page.locator("#parts").check();
  await page.locator("#joints").check();
  await page.locator('[data-skinning="rigid"]').click();
  await page.waitForTimeout(180);
  await page.screenshot({
    path: "docs/results/t14-rigid-parts-closeup.png",
  });
  await page.locator('[data-skinning="lbs"]').click();
  await page.waitForTimeout(180);
  await page.screenshot({
    path: "docs/results/t14-lbs-parts-closeup.png",
  });

  await page.evaluate(() => window.__hangar.commands.camera("orbit"));
  await page.waitForTimeout(180);
  await page.screenshot({ path: "docs/results/viewer-parts.png" });
  await page.locator("#parts").uncheck();
  await page.locator("#joints").uncheck();
  await page.locator("#wireframe").check();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().wireframe),
    true,
  );
  await page.locator("#wireframe").uncheck();
  checks.push(
    "3-way skinning toggle (Three.js skinning / our LBS / rigid parts), part colors, joint axes, wireframe",
  );

  // 7. Frame time comparison across Three.js skinning, our LBS, and rigid parts
  const frameTimeThree = await measureFrameTimes(page, "three", 90);
  const frameTimeLbs = await measureFrameTimes(page, "lbs", 90);
  const frameTimeRigid = await measureFrameTimes(page, "rigid", 90);
  await page.locator('[data-skinning="lbs"]').click();
  checks.push("measured frame time for Three.js skinning, our LBS, and rigid parts");

  // 8. Original vs prepared switching
  await page.getByRole("button", { name: "原始模型", exact: true }).click();
  await page.waitForFunction(
    () =>
      window.__hangar.getState().mode === "original" &&
      !window.__hangar.getState().loading,
  );
  assert.equal(await page.locator("#play").isDisabled(), true);
  await page.evaluate(() => window.__hangar.commands.camera("orbit"));
  await page.waitForTimeout(200);
  await page.screenshot({ path: "docs/results/viewer-original.png" });
  await page.getByRole("button", { name: "全身绑定版", exact: true }).click();
  assert.equal(await page.locator("#play").isDisabled(), false);
  checks.push("original/prepared switching, inappropriate controls disabled");

  // 9. Play, pause, and reset
  await page.getByRole("tab", { name: "姿态", exact: true }).click();
  await page.locator("#reset-pose").click();
  assert.ok(
    (await page.evaluate(() => window.__hangar.diagnostics())).bindError < 1e-7,
  );
  await page.locator("#play").click();
  await page.waitForTimeout(800);
  assert.ok((await page.evaluate(() => window.__hangar.getState())).time > 0);
  await page.locator("#play").click();
  const paused = await page.evaluate(() => window.__hangar.getState().time);
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().time),
    paused,
  );
  await page.locator("#reset-pose").click();
  assert.ok(
    (await page.evaluate(() => window.__hangar.diagnostics())).bindError < 1e-7,
  );
  checks.push("play, pause, and reset");

  // 10. Mobile 390px layout check
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "docs/results/viewer-mobile.png",
    fullPage: true,
  });
  checks.push("390px layout without horizontal overflow");

  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  checks.push("no console errors or failed HTTP responses");

  const report = {
    url: base,
    browser: await browser.version(),
    checks,
    frameTimes: {
      three: frameTimeThree,
      lbs: frameTimeLbs,
      rigid: frameTimeRigid,
    },
    seamTests,
    errors,
    failedRequests,
    notes:
      "Headless Chrome acceptance run for T13 + T14 (custom LBS shader & CPU reference); frame times measured in headless Chromium.",
  };
  await fs.writeFile(
    "docs/results/browser-validation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
