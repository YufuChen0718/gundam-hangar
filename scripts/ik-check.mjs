// T16 two-bone IK evaluation on the real Sentinel rig, in headless Chrome.
// Usage: start `npm run dev` (port 5174 by default, or set HANGAR_URL), then
//   node scripts/ik-check.mjs
// Writes docs/results/t16-ik-*.csv, t16-ik-summary.json and two screenshots.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const base = process.env.HANGAR_URL ?? "http://127.0.0.1:5174/";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 1520, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const csv = (header, rows) =>
  [header.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
const mm = (m) => (Number.isFinite(m) ? (m * 1000).toFixed(6) : "");

try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__hangar?.getState().ready, {
    timeout: 30000,
  });

  const report = await page.evaluate(() =>
    window.__hangar.commands.runIkEvaluation({
      reachableSamples: 500,
      unreachableSamples: 200,
      sweepSteps: 240,
      seed: 184,
    }),
  );
  await fs.mkdir("docs/results", { recursive: true });

  await fs.writeFile(
    "docs/results/t16-ik-reachable.csv",
    csv(
      ["i", "tx", "ty", "tz", "distance_m", "sample_bend_deg", "ik_bend_deg", "error_mm", "limited"],
      report.reachable.rows.map((r) => [
        r.i,
        ...r.target.map((v) => v.toFixed(6)),
        r.distance.toFixed(6),
        r.sampleBendDeg.toFixed(4),
        r.bendDeg.toFixed(4),
        mm(r.errorM),
        r.limited ? 1 : 0,
      ]),
    ),
  );
  await fs.writeFile(
    "docs/results/t16-ik-unreachable.csv",
    csv(
      ["i", "tx", "ty", "tz", "distance_m", "ik_bend_deg", "error_to_closest_reachable_mm", "limited"],
      report.unreachableFar.rows.map((r) => [
        r.i,
        ...r.target.map((v) => v.toFixed(6)),
        r.distance.toFixed(6),
        r.bendDeg.toFixed(4),
        mm(r.errorM),
        r.limited ? 1 : 0,
      ]),
    ),
  );
  await fs.writeFile(
    "docs/results/t16-ik-sweep.csv",
    csv(
      ["step", "distance_m", "bend_deg", "error_mm", "reachable", "shoulder_step_deg"],
      report.sweep.rows.map((r) => [
        r.step,
        r.distance.toFixed(6),
        r.bendDeg.toFixed(4),
        mm(r.errorM),
        r.reachable ? 1 : 0,
        r.shoulderStepDeg.toFixed(5),
      ]),
    ),
  );

  // Screenshots: IK on with the target in front of the chest.
  const shots = await page.evaluate(() => {
    const h = window.__hangar;
    h.commands.setTransitionMode("cut");
    h.commands.setIkEnabled(true);
    const d = h.diagnostics();
    const s = d.jointWorldPositions.rightShoulder;
    return { shoulder: s };
  });
  for (const [name, offset] of [
    ["reach-forward", [0.05, -0.05, 0.38]],
    ["reach-up", [-0.05, 0.3, 0.2]],
  ]) {
    await page.evaluate(
      ({ shoulder, offset }) => {
        window.__hangar.commands.setIkTargetWorld(
          shoulder[0] + offset[0],
          shoulder[1] + offset[1],
          shoulder[2] + offset[2],
        );
      },
      { shoulder: shots.shoulder, offset },
    );
    await page.waitForTimeout(250);
    await page.screenshot({ path: `docs/results/t16-ik-${name}.png` });
  }
  await page.evaluate(() => {
    window.__hangar.commands.setIkEnabled(false);
  });

  // Foot planting: FK crouch vs leg IK at the same pelvis drop.
  const foot = await page.evaluate(() =>
    window.__hangar.commands.runFootEvaluation({ steps: 27, sweepSteps: 50 }),
  );
  await fs.writeFile(
    "docs/results/t16-foot-crouch.csv",
    csv(
      ["step", "knee_deg", "pelvis_drop_m", "fk_slide_mm", "fk_disp3d_mm", "ik_slide_mm", "ik_disp3d_mm", "ik_foot_tilt_deg", "ik_reachable", "ik_limited"],
      foot.rows.map((r) => [
        r.step,
        r.kneeDeg.toFixed(3),
        r.dropM.toFixed(6),
        mm(r.fkSlideM),
        mm(r.fkDisp3dM),
        mm(r.ikSlideM),
        mm(r.ikDisp3dM),
        r.ikFootTiltDeg.toFixed(6),
        r.ikReachable ? 1 : 0,
        r.ikLimited ? 1 : 0,
      ]),
    ),
  );
  // Screenshot: deepest crouch the legs can hold, side view.
  await page.evaluate((depth) => {
    const c = window.__hangar.commands;
    c.camera("side");
    c.setFootIkEnabled(true);
    c.setCrouch(depth);
  }, foot.maxReachableCrouchM);
  await page.waitForTimeout(250);
  await page.screenshot({ path: "docs/results/t16-foot-crouch.png" });
  await page.evaluate(() => {
    const c = window.__hangar.commands;
    c.setCrouch(0);
    c.setFootIkEnabled(false);
    c.camera("orbit");
    c.setTransitionMode("blend");
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    url: base,
    chain: report.chain,
    reachable: report.reachable.summary,
    unreachableFar: report.unreachableFar.summary,
    unreachableFarWithinShoulderLimits:
      report.unreachableFar.summaryWithinShoulderLimits,
    tooCloseBendErrorRad: report.tooClose.summary,
    sweep: {
      fromDistance: report.sweep.fromDistance,
      toDistance: report.sweep.toDistance,
      maxBendStepDeg: report.sweep.maxBendStepDeg,
      maxShoulderStepDeg: report.sweep.maxShoulderStepDeg,
      bendMonotonic: report.sweep.bendMonotonic,
    },
    foot: {
      kneeLimitDeg: foot.kneeLimitDeg,
      maxReachableCrouchM: foot.maxReachableCrouchM,
      fkMaxSlideM: foot.fkMaxSlideM,
      fkMaxDisp3dM: foot.fkMaxDisp3dM,
      ikMaxSlideM: foot.ikMaxSlideM,
      ikMaxDisp3dM: foot.ikMaxDisp3dM,
      ikMaxFootTiltDeg: foot.ikMaxFootTiltDeg,
      ikReachableRows: foot.ikReachableRows,
      rows: foot.rows.length,
    },
    errors,
  };
  await fs.writeFile(
    "docs/results/t16-ik-summary.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));

  assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
  // Targets the shoulder cone/twist limit had to clamp are reported, not asserted.
  const unlimitedMax = Math.max(
    0,
    ...report.reachable.rows.filter((r) => !r.limited).map((r) => r.errorM),
  );
  assert.ok(unlimitedMax < 1e-4, `reachable max error ${unlimitedMax} m`);
  assert.ok(report.sweep.bendMonotonic, "elbow bend not monotonic in sweep");
  assert.ok(foot.ikReachableRows > 0, "no reachable foot-planting rows");
  assert.ok(foot.ikMaxDisp3dM < 1e-4, `planted ankle moved ${foot.ikMaxDisp3dM} m`);
} finally {
  await browser.close();
}
