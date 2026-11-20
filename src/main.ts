import "./style.css";
import { createScene } from "./scene/createScene";
import { loadPrepared } from "./mecha/loadMecha";
import { EquipmentManager } from "./mecha/equipment";
import { createStore } from "./app/state";
import { createCommands } from "./app/commands";
import { createLayout, bindPanel } from "./ui/desktopPanel";

const viewport = createLayout(document.getElementById("app")!);
const store = createStore();

async function start() {
  const world = createScene(viewport);
  const rig = await loadPrepared("sentinel");
  const equipment = new EquipmentManager(rig);
  await equipment.loadExternalEquipment();
  world.scene.add(rig.displayRoot);
  world.scene.updateMatrixWorld(true);
  const app = createCommands(store, rig, world, equipment);
  bindPanel(store, app.commands);
  store.set({ ready: true });
  document.getElementById("loading")!.hidden = true;
  let last: number | undefined;
  const samples: number[] = [];
  let statsTime = 0;
  world.renderer.setAnimationLoop((time: number) => {
    const dt = last === undefined ? 0 : Math.max(0, (time - last) / 1000);
    last = time;
    world.controls.update();
    app.update(dt);
    world.renderer.render(world.scene, world.camera);
    if (dt > 0 && dt < 1) samples.push(dt * 1000);
    if (samples.length > 120) samples.shift();
    statsTime += dt;
    if (statsTime > 0.5) {
      statsTime = 0;
      const avg =
        samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
      document.getElementById("frame-time")!.textContent =
        samples.length < 30 ? "Sampling…" : `${avg.toFixed(1)} ms`;
      document.getElementById("seam-error")!.textContent =
        `${(app.diagnostics().skinSeamGap * 1000).toFixed(4)} mm`;
      document.getElementById("attachment-error")!.textContent =
        `${(app.diagnostics().attachmentError * 1000).toFixed(4)} mm`;
    }
  });
  document.addEventListener("visibilitychange", () => {
    last = undefined;
    if (document.hidden && store.get().playing) app.commands.play();
  });
  Object.assign(window, {
    __hangar: {
      commands: app.commands,
      getState: store.get,
      diagnostics: app.diagnostics,
    },
  });
}

start().catch((e) => {
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  store.set({ error: msg });
  document.getElementById("loading")!.innerHTML =
    `<strong>Model failed to load</strong><span></span><button onclick="location.reload()">Retry</button>`;
  document.querySelector("#loading span")!.textContent = msg;
});
