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
const base = process.env.HANGAR_URL ?? "http://127.0.0.1:5173/";
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__hangar?.getState().ready, {
    timeout: 30000,
  });
  checks.push("GLB and textures loaded");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "docs/results/viewer-rest.png" });
  const seamTests = [];
  for (const [s, e, w] of [
    [0, 0, 0],
    [20, 40, 0],
    [30, 55, 0],
    [55, 85, 20],
  ]) {
    await page.evaluate(
      ([s, e, w]) => {
        const c = window.__hangar.commands;
        c.setJoint("shoulder", s);
        c.setJoint("elbow", e);
        c.setJoint("wrist", w);
      },
      [s, e, w],
    );
    await page.waitForTimeout(120);
    const d = await page.evaluate(() => window.__hangar.diagnostics());
    assert.ok(d.boundaryGroups > 0);
    assert.ok(d.skinSeamGap < 1e-5, `Skin boundary separated ${d.skinSeamGap}`);
    assert.ok(d.attachmentError < 1e-6);
    seamTests.push({ angles: [s, e, w], ...d });
  }
  checks.push(
    "shared boundaries and weapon attachment remain aligned in four poses",
  );
  await page.getByRole("button", { name: "举枪", exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "docs/results/viewer-raised.png" });
  for (const view of ["side", "top", "back"]) {
    await page.evaluate((view) => {
      window.__hangar.commands.seek(1.61);
      window.__hangar.commands.camera(view);
      window.__hangar.commands.zoom("in");
    }, view);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `docs/results/seam-fix-${view}.png` });
  }
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
  await page.getByRole("button", { name: "单臂处理版", exact: true }).click();
  assert.equal(await page.locator("#play").isDisabled(), false);
  checks.push("original/prepared switching, inappropriate controls disabled");
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
      "Headless Chrome acceptance run; not a device performance benchmark.",
  };
  await fs.writeFile(
    "docs/results/browser-validation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
