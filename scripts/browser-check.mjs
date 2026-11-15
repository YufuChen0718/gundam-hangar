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

try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__hangar?.getState().ready, {
    timeout: 30000,
  });
  checks.push("GLB and textures loaded");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "docs/results/viewer-rest.png" });

  const bindDiag = await page.evaluate(() => window.__hangar.diagnostics());
  assert.equal(bindDiag.boundaryGroups, 367);
  const bindLeftFootY = bindDiag.leftFootMinY;
  const bindRightFootY = bindDiag.rightFootMinY;

  // 1. Verify all 9 full-body test poses pass seam, attachment, and foot-platform checks
  const seamTests = [];
  for (const poseName of TEST_POSE_ORDER) {
    await page.locator(`[data-pose="${poseName}"]`).click();
    await page.waitForTimeout(120);
    const d = await page.evaluate(() => window.__hangar.diagnostics());
    const state = await page.evaluate(() => window.__hangar.getState());
    assert.equal(d.boundaryGroups, 367);
    assert.ok(
      d.skinSeamGap < 1e-5,
      `Skin boundary separated in ${poseName}: ${d.skinSeamGap}`,
    );
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
    seamTests.push({
      pose: poseName,
      angles: state.angles,
      boundaryGroups: d.boundaryGroups,
      skinSeamGap: d.skinSeamGap,
      attachmentError: d.attachmentError,
      leftFootMinY: d.leftFootMinY,
      rightFootMinY: d.rightFootMinY,
    });
  }
  checks.push(
    "all 9 full-body test poses pass seam check (<1e-5 m), attachment check (<1e-6 m), and keep feet on platform",
  );

  // 2. Capture front and side pose gallery screenshots
  for (const poseName of GALLERY_POSES) {
    await page.locator(`[data-pose="${poseName}"]`).click();
    await page.evaluate(() => window.__hangar.commands.camera("front"));
    await page.waitForTimeout(180);
    await page.screenshot({
      path: `docs/results/pose-gallery-front-${poseName}.png`,
    });
    await page.evaluate(() => window.__hangar.commands.camera("side"));
    await page.waitForTimeout(180);
    await page.screenshot({
      path: `docs/results/pose-gallery-side-${poseName}.png`,
    });
  }
  checks.push("captured front and side pose gallery screenshots");

  // 3. Verify every one of the 15 joints can be posed from the viewer sliders and moving pelvis moves the whole body
  await page.locator("#reset-pose-panel").click();
  await page.waitForTimeout(100);
  const bindPositions = (
    await page.evaluate(() => window.__hangar.diagnostics())
  ).jointWorldPositions;

  // Test moving pelvis moves the whole body (both pelvis rotation and pelvis vertical translation in crouch)
  await page.evaluate(() => {
    const slider = document.getElementById("pelvis");
    slider.value = "20";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(100);
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
  await page.waitForTimeout(100);
  const crouchPositions = (
    await page.evaluate(() => window.__hangar.diagnostics())
  ).jointWorldPositions;
  assert.ok(
    bindPositions.pelvis[1] - crouchPositions.pelvis[1] > 0.04,
    "Expected pelvis root to lower during crouch while keeping feet on platform",
  );
  await page.locator("#reset-pose-panel").click();

  // Test each of the 15 joint sliders individually
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
  await page.waitForTimeout(250);
  await page.screenshot({ path: "docs/results/viewer-raised.png" });
  for (const view of ["side", "top", "back"]) {
    await page.evaluate((view) => {
      window.__hangar.commands.seek(1.6);
      window.__hangar.commands.camera(view);
      window.__hangar.commands.zoom("in");
    }, view);
    await page.waitForTimeout(250);
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

  // 6. Inspect tab checks (17 mesh parts + 15 joint axes + wireframe)
  await page.getByRole("tab", { name: "检查", exact: true }).click();
  await page.locator("#parts").check();
  await page.locator("#joints").check();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().parts),
    true,
  );
  await page.screenshot({ path: "docs/results/viewer-parts.png" });
  await page.locator("#parts").uncheck();
  await page.locator("#joints").uncheck();
  await page.locator("#wireframe").check();
  assert.equal(
    await page.evaluate(() => window.__hangar.getState().wireframe),
    true,
  );
  await page.locator("#wireframe").uncheck();
  checks.push("part colors, joint axes, wireframe");

  // 7. Original vs prepared switching
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

  // 8. Play, pause, and reset
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

  // 9. Mobile 390px layout check
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
    seamTests,
    errors,
    failedRequests,
    notes:
      "Headless Chrome acceptance run for T13 15-joint full-body rig; not a device performance benchmark.",
  };
  await fs.writeFile(
    "docs/results/browser-validation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
