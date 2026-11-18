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
  checks.push("gundam-guardian.glb and textures loaded by default");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "docs/results/guardian-bind-orbit.png" });

  const bindDiag = await page.evaluate(() => window.__hangar.diagnostics());
  assert.equal(bindDiag.mode, "guardian");
  assert.equal(bindDiag.boundaryGroups, 930);
  assert.equal(bindDiag.skinningMode, "lbs");
  const bindLeftFootY = bindDiag.leftFootMinY;
  const bindRightFootY = bindDiag.rightFootMinY;

  // 1. Verify all 9 full-body test poses on Guardian pass seam, LBS-vs-Three.js, attachment, and foot-platform checks
  const seamTests = [];
  const lbsSeamSet = new Set();
  const vsThreeSet = new Set();
  for (const poseName of TEST_POSE_ORDER) {
    await page.locator(`[data-pose="${poseName}"]`).click();
    await page.waitForTimeout(90);
    const d = await page.evaluate(() => window.__hangar.diagnostics());
    const state = await page.evaluate(() => window.__hangar.getState());
    assert.equal(d.boundaryGroups, 930);
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
    "all 9 full-body test poses on Guardian report distinct per-pose LBS seam gaps (<1e-5 m) and LBS-vs-Three.js diffs (<1e-6 m)",
  );

  // 2. Capture Guardian bind + action pose screenshots (front / side / orbit)
  await page.locator('[data-pose="bind"]').click();
  await page.evaluate(() => window.__hangar.commands.camera("front"));
  await page.waitForTimeout(150);
  await page.screenshot({ path: "docs/results/guardian-bind-front.png" });
  await page.evaluate(() => window.__hangar.commands.camera("side"));
  await page.waitForTimeout(150);
  await page.screenshot({ path: "docs/results/guardian-bind-side.png" });

  await page.evaluate(() => window.__hangar.commands.camera("orbit"));
  await page.locator('[data-action="aim"]').click();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: "docs/results/guardian-action-aim.png" });

  await page.locator('[data-action="swing"]').click();
  await page.waitForTimeout(850); // Strike peak
  await page.screenshot({ path: "docs/results/guardian-action-swing.png" });

  await page.locator('[data-pose="deepCrouchAim"]').click();
  await page.waitForTimeout(150);
  await page.screenshot({
    path: "docs/results/guardian-pose-deepCrouchAim.png",
  });
  checks.push("captured Guardian bind and action pose screenshots");

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

  // 4. Test T07 Action State Machine & Transitions (Idle / Aim / Swing + Blend / Cut toggle)
  await page.evaluate(() => window.__hangar.commands.camera("orbit"));
  await page.locator('[data-transition="blend"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().transitionMode),
    "blend",
  );
  await page.locator('[data-action="swing"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().action),
    "swing",
  );
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().status),
    "transitioning",
  );
  await page.waitForTimeout(2000);
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().action),
    "idle",
  );
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().playing),
    true,
  );
  await page.locator('[data-action="swing"]').click();
  await page.waitForTimeout(550);
  await page.locator('[data-action="aim"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().action),
    "aim",
  );
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().status),
    "transitioning",
  );
  await page.waitForTimeout(1400);
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().status),
    "holding",
  );
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().playing),
    false,
  );

  await page.locator('[data-transition="cut"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().transitionMode),
    "cut",
  );
  await page.locator('[data-action="swing"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().status),
    "playing",
  );
  await page.waitForTimeout(450);
  await page.locator('[data-action="aim"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().status),
    "playing",
  );
  await page.locator('[data-transition="blend"]').click();
  await page.locator("#reset-pose-panel").click();
  checks.push(
    "T07 action buttons (idle / aim / swing) and transition mode toggle (blend / cut) verified on Guardian",
  );

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

  // 6. Inspect tab: Guardian close-up comparison of right elbow and right knee (original texture, rigid parts vs our LBS)
  await page.getByRole("tab", { name: "检查", exact: true }).click();
  await page.locator("#parts").uncheck();
  await page.locator("#joints").uncheck();
  await page.locator("#wireframe").uncheck();

  // 6a. Right Elbow close-up on Guardian (original texture, rigid vs LBS)
  await page.evaluate(() => {
    const c = window.__hangar.commands;
    c.setWeaponVisible(false);
    c.setPoseAngles({
      rightShoulder: 25,
      rightElbow: 88,
      rightWrist: 0,
    });
    const [ex, ey, ez] =
      window.__hangar.diagnostics().jointWorldPositions.rightElbow;
    c.focusCamera([ex + 0.02, ey + 0.04, ez + 0.04], [
      ex - 0.52,
      ey - 0.06,
      ez - 0.28,
    ]);
  });
  await page.locator('[data-skinning="rigid"]').click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: "docs/results/guardian-elbow-rigid.png" });

  await page.locator('[data-skinning="lbs"]').click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: "docs/results/guardian-elbow-lbs.png" });

  // 6b. Right Knee close-up on Guardian (original texture, rigid vs LBS)
  await page.evaluate(() => {
    const c = window.__hangar.commands;
    c.setWeaponVisible(true);
    c.setPoseAngles({
      rightHip: 20,
      rightKnee: 75,
      rightAnkle: 20,
      leftHip: 20,
      leftKnee: 75,
      leftAnkle: 20,
    });
    const [kx, ky, kz] =
      window.__hangar.diagnostics().jointWorldPositions.rightKnee;
    c.focusCamera([kx - 0.02, ky - 0.02, kz + 0.02], [
      kx - 0.52,
      ky + 0.06,
      kz + 0.38,
    ]);
  });
  await page.locator('[data-skinning="rigid"]').click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: "docs/results/guardian-knee-rigid.png" });

  await page.locator('[data-skinning="lbs"]').click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: "docs/results/guardian-knee-lbs.png" });

  // 6c. Test Three.js skinning mode, part colors, joint axes, wireframe
  await page.locator('[data-skinning="three"]').click();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().skinning),
    "three",
  );
  await page.locator('[data-skinning="lbs"]').click();
  await page.evaluate(() => {
    window.__hangar.commands.pose("dualArmReady");
    window.__hangar.commands.camera("orbit");
  });
  await page.locator("#parts").check();
  await page.locator("#joints").check();
  await page.waitForTimeout(180);
  await page.screenshot({ path: "docs/results/guardian-parts.png" });
  await page.locator("#parts").uncheck();
  await page.locator("#joints").uncheck();
  await page.locator("#wireframe").check();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().wireframe),
    true,
  );
  await page.locator("#wireframe").uncheck();
  checks.push(
    "3-way skinning toggle, close-up elbow/knee rigid vs LBS screenshots, part colors, joint axes, wireframe on Guardian",
  );

  // 7. Frame time comparison across Three.js skinning, our LBS, and rigid parts on Guardian
  const frameTimeThree = await measureFrameTimes(page, "three", 90);
  const frameTimeLbs = await measureFrameTimes(page, "lbs", 90);
  const frameTimeRigid = await measureFrameTimes(page, "rigid", 90);
  await page.locator('[data-skinning="lbs"]').click();
  checks.push(
    "measured frame time for Three.js skinning, our LBS, and rigid parts on Guardian",
  );

  // 8. Switch between "Guardian (new)" and "Previous model" and verify both rigged models work
  await page
    .getByRole("button", { name: "Previous model", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      window.__hangar.getState().mode === "previous" &&
      !window.__hangar.getState().loading,
  );
  const prevDiag = await page.evaluate(() => window.__hangar.diagnostics());
  assert.equal(prevDiag.boundaryGroups, 367);
  assert.ok(prevDiag.lbsSeamGapMax < 1e-5);
  assert.equal(await page.locator("#play").isDisabled(), false);
  await page.evaluate(() => window.__hangar.commands.camera("orbit"));
  await page.waitForTimeout(180);
  await page.screenshot({ path: "docs/results/guardian-previous-model.png" });

  await page
    .getByRole("button", { name: "Guardian (new)", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      window.__hangar.getState().mode === "guardian" &&
      !window.__hangar.getState().loading,
  );
  const guardianDiagAgain = await page.evaluate(() =>
    window.__hangar.diagnostics(),
  );
  assert.equal(guardianDiagAgain.boundaryGroups, 930);
  checks.push(
    'model switch ("Guardian (new)" / "Previous model") verified with both GLBs working',
  );

  // 9. Play, pause, and reset
  await page.getByRole("tab", { name: "姿态", exact: true }).click();
  await page.locator("#reset-pose").click();
  assert.ok(
    (await page.evaluate(() => window.__hangar.diagnostics())).bindError < 1e-7,
  );
  await page.locator("#play").click();
  await page.waitForTimeout(600);
  assert.ok((await page.evaluate(() => window.__hangar.getState())).time > 0);
  await page.locator("#play").click();
  const paused = await page.evaluate(() => window.__hangar.getState().time);
  await page.waitForTimeout(250);
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
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "docs/results/guardian-mobile.png",
    fullPage: true,
  });
  checks.push("390px layout without horizontal overflow");

  // 11. Render guardian-transition-plot.svg to guardian-transition-plot.png
  const svgText = await fs.readFile(
    "docs/results/guardian-transition-plot.svg",
    "utf8",
  );
  const plotPage = await browser.newPage({
    viewport: { width: 1360, height: 780 },
    deviceScaleFactor: 2,
  });
  await plotPage.setContent(
    `<!doctype html><body style="margin:0;background:#141a21">${svgText}</body>`,
  );
  await plotPage.screenshot({
    path: "docs/results/guardian-transition-plot.png",
  });
  await plotPage.close();
  checks.push("rendered docs/results/guardian-transition-plot.png");

  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  checks.push("no console errors or failed HTTP responses");

  const report = {
    url: base,
    model: "gundam-guardian.glb",
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
      "Headless Chrome acceptance run for Gundam Guardian (30,043 tris, 15 joints, custom LBS, T07 transitions).",
  };
  await fs.writeFile(
    "docs/results/guardian-browser-validation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
