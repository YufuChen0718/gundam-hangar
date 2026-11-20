import type { Store } from "../app/state";
import type { Commands } from "../app/commands";
import { JOINTS } from "../mecha/types";
import type {
  JointName,
  ModelMode,
  PosePresetName,
  RightHandItem,
  SkinningMode,
} from "../mecha/types";
import type { ActionName, TransitionMode } from "../animation/clips";
import { JOINT_LIMITS, TEST_POSES } from "../mecha/rigConfig";

const JOINT_GROUPS: {
  title: string;
  subtitle: string;
  joints: [JointName, string, string][];
}[] = [
  {
    title: "CORE & HEAD",
    subtitle: "Pelvis root · torso · head",
    joints: [
      ["pelvis", "Pelvis (root)", "Pelvis Yaw"],
      ["torso", "Torso", "Torso Twist"],
      ["head", "Head", "Head Yaw"],
    ],
  },
  {
    title: "RIGHT ARM",
    subtitle: "Right arm (beam saber / rifle)",
    joints: [
      ["rightShoulder", "Right shoulder", "R.Shoulder"],
      ["rightElbow", "Right elbow", "R.Elbow"],
      ["rightWrist", "Right wrist", "R.Wrist"],
    ],
  },
  {
    title: "LEFT ARM",
    subtitle: "Left arm (shield)",
    joints: [
      ["leftShoulder", "Left shoulder", "L.Shoulder"],
      ["leftElbow", "Left elbow", "L.Elbow"],
      ["leftWrist", "Left wrist", "L.Wrist"],
    ],
  },
  {
    title: "RIGHT LEG",
    subtitle: "Right leg (one-way knee)",
    joints: [
      ["rightHip", "Right hip", "R.Hip"],
      ["rightKnee", "Right knee", "R.Knee"],
      ["rightAnkle", "Right ankle", "R.Ankle"],
    ],
  },
  {
    title: "LEFT LEG",
    subtitle: "Left leg (one-way knee)",
    joints: [
      ["leftHip", "Left hip", "L.Hip"],
      ["leftKnee", "Left knee", "L.Knee"],
      ["leftAnkle", "Left ankle", "L.Ankle"],
    ],
  },
];

export function createLayout(root: HTMLElement) {
  root.innerHTML = `<header class="topbar"><a class="brand" href="#"><span class="brand-mark">GH</span><span>GUNDAM <b>HANGAR</b><small>CS184 / FULL-BODY FK &amp; EQUIPMENT WORKBENCH</small></span></a><div class="project-meta"><span class="live-dot"></span> DESKTOP PROTOTYPE <span class="version">15-JOINT · M6 SOCKETS</span></div></header>
 <main class="workspace"><aside class="loadout-drawer" id="loadout-drawer" aria-label="Loadout"><div class="loadout-header"><div class="loadout-title"><span class="eyebrow">M6 SOCKETS</span><h3>Loadout</h3></div><button id="loadout-collapse-btn" class="loadout-toggle-btn" aria-expanded="true" title="Collapse / expand loadout">◀</button></div>
 <div class="loadout-body" id="loadout-body"><div class="section-caption">RIGHT HAND <span>rightHandSocket (one item at a time)</span></div>
 <div class="loadout-cards" role="radiogroup" aria-label="Right-hand weapon">
   <button type="button" class="loadout-card" data-right-hand="none" disabled><img src="./assets/thumbs/thumb-none.png" alt="None"/><div class="loadout-card-meta"><strong>None</strong><small>Empty hand</small></div></button>
   <button type="button" class="loadout-card" data-right-hand="saber" disabled><img src="./assets/thumbs/thumb-saber.png" alt="Beam Saber"/><div class="loadout-card-meta"><strong>Beam Saber</strong><small>Violet blade · +Z</small></div></button>
   <button type="button" class="loadout-card active" data-right-hand="rifle" disabled><img src="./assets/thumbs/thumb-rifle.png" alt="Rifle"/><div class="loadout-card-meta"><strong>Rifle</strong><small>Beam rifle · aim</small></div></button>
 </div>
 <div class="section-caption">SABER BLADE <span>separate saberBlade mesh</span></div>
 <label class="toggle-row loadout-switch-row"><span>Blade glow<small>Available when the beam saber is equipped</small></span><input id="saber-blade-toggle" type="checkbox" checked disabled/></label>
 <div class="section-caption">LEFT ARM <span>leftForearmSocket</span></div>
 <div class="loadout-shield-card"><img src="./assets/thumbs/thumb-shield.png" alt="Shield"/><label class="toggle-row"><span>Crimson Shield<small>Mounted on the outer forearm</small></span><input id="loadout-shield-toggle" type="checkbox" checked disabled/></label></div>
 <div class="note"><span>M6 attachment chain</span><code>M_world = M_joint · M_socket · M_offset</code>. <b>Aim</b> auto-equips the rifle; <b>Swing</b> auto-equips the beam saber.</div></div></aside>
 <section class="stage"><div id="viewport" aria-label="Rotatable 3D model"></div><div class="stage-top"><div><div class="eyebrow">MODEL STUDY / T13–M6</div><h1>Full-body 15-joint FK, rigid armor and socket equipment.</h1><p>Pelvis-rooted hierarchy · rigid hard-surface armor · beam saber / rifle in the right hand, shield on the left forearm.</p></div><span class="stage-badge" id="model-badge">SENTINEL 15-JOINT · GLB</span></div>
 <div id="loading" role="status"><span class="loader"></span><strong>Loading the hangar</strong><span>Loading the rigged model and equipment…</span></div><div class="camera-tools" aria-label="Camera controls"><button data-camera="orbit" title="Three-quarter view">◈</button><button data-camera="front">Front</button><button data-camera="side">Side</button><span></span><button data-zoom="in" aria-label="Zoom in">＋</button><button data-zoom="out" aria-label="Zoom out">−</button></div>
 <div class="stage-bottom"><span><i class="live-dot"></i> <b id="stage-status">Waiting for model</b></span><span>Drag to rotate · scroll to zoom · right-drag to pan</span></div>
 <div class="timeline"><button id="play" class="play-button" disabled aria-label="Play full-body animation">▶</button><div class="timeline-body"><div><strong>Full-body motion test</strong><span id="time-label">0.00 / 6.00 s</span></div><input id="timeline" type="range" min="0" max="6" step="0.01" value="0" aria-label="Animation time" disabled/><div class="timeline-ticks"><span>Rest</span><span>Raise</span><span>Hold</span><span>Return</span></div></div><button id="reset-pose" class="text-button" disabled>Reset pose ↺</button></div>
 </section><aside class="inspector"><div class="panel-heading"><div class="eyebrow">CONTROL DECK</div><h2>Model Lab <span>15J</span></h2><p>15-joint hierarchical FK rooted at the pelvis, with a library of test poses.</p></div>
 <div class="model-switch" role="group" aria-label="Model version"><button data-model="sentinel" class="active" disabled>Sentinel (new)</button><button data-model="legacy" disabled>Legacy</button></div>
 <div class="tabs" role="tablist"><button role="tab" aria-selected="true" aria-controls="panel-pose" data-tab="pose" class="active">Pose</button><button role="tab" aria-selected="false" aria-controls="panel-equipment" data-tab="equipment">Equipment</button><button role="tab" aria-selected="false" aria-controls="panel-inspect" data-tab="inspect">Inspect</button></div>
 <div class="panel-content"><section id="panel-pose" role="tabpanel"><div class="section-caption">ACTIONS <span>idle / aim / swing</span></div><div class="presets"><button data-action="idle" disabled>Idle</button><button data-action="aim" disabled>Aim</button><button data-action="swing" disabled>Swing</button></div><div class="section-caption">TRANSITION <span>M5 switching mode</span></div><div class="model-switch" style="margin:10px 0 18px" role="group" aria-label="Transition mode"><button data-transition="blend" class="active" disabled>Blend (0.3s)</button><button data-transition="cut" disabled>Cut</button></div><div class="section-caption">TEST POSES <span>9 full-body test poses</span></div><div class="presets presets-grid">${TEST_POSES.map(
   (p) =>
     `<button data-pose="${p.id}" title="${p.label}" disabled>${p.shortLabel}</button>`,
 ).join(
   "",
 )}</div><button id="reset-pose-panel" class="reset-pose-btn" disabled>Reset pose · back to bind pose</button>
 ${JOINT_GROUPS.map(
   (g) => `<div class="joint-group"><div class="section-caption">${g.title} <span>${g.subtitle}</span></div>${g.joints
     .map(([id, label, en]) => {
       const [min, max] = JOINT_LIMITS[id];
       return `<label class="slider-label" for="${id}"><span>${label}<small>${en}</small></span><output id="${id}-value">0°</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="1" value="0" disabled/><div class="range-limits"><span>${min}°</span><span>${max}°</span></div>`;
     })
     .join("")}</div>`,
 ).join("")}
 <div class="note"><span>Hierarchy &amp; limits</span>The pelvis is the root of the whole body; knees and elbows bend one way only, and both feet stay on the platform when crouching.</div></section>
 <section id="panel-equipment" role="tabpanel" hidden><div class="section-caption">ATTACHMENTS <span>follow the joints</span></div><label class="toggle-row"><span>Right-hand weapon<small>rightHandSocket</small></span><input id="weapon" type="checkbox" checked disabled/></label><label class="toggle-row"><span>Left-arm shield<small>leftForearmSocket</small></span><input id="shield" type="checkbox" checked disabled/></label><div class="note"><span>Attachment check</span>Use the Loadout panel on the left to switch the beam saber, rifle, blade glow and shield.</div></section>
 <section id="panel-inspect" role="tabpanel" hidden><div class="section-caption">SKINNING <span>M3 skinning mode</span></div><div class="model-switch" style="margin:10px 0 18px" role="group" aria-label="Skinning mode"><button data-skinning="rigid" class="active" disabled>Rigid armor (default)</button><button data-skinning="lbs" disabled>Smooth LBS</button><button data-skinning="three" disabled>Three.js</button></div><div class="section-caption">DIAGNOSTICS <span>structure &amp; appearance</span></div><label class="toggle-row"><span>Wireframe<small>Show mesh density</small></span><input id="wireframe" type="checkbox" disabled/></label><label class="toggle-row"><span>Part colors<small>Show the rigid part segmentation</small></span><input id="parts" type="checkbox" disabled/></label><label class="toggle-row"><span>Joint axes<small>All 15 joints and sockets</small></span><input id="joints" type="checkbox" disabled/></label><div class="legend"><span style="--c:#68829e">Pelvis</span><span style="--c:#4f7cac">Torso</span><span style="--c:#e8c547">Head</span><span style="--c:#f2a44d">Upper arm</span><span style="--c:#46c9c1">Forearm</span><span style="--c:#f5d442">Skirt</span><span style="--c:#5c9ead">Thigh</span><span style="--c:#82b366">Shin</span><span style="--c:#d96b6b">Foot</span></div><div class="note"><span>Rigid hard-surface armor</span>The default Rigid armor mode splits the body along natural seams, caps the cuts and adds dark inner-frame joint fillers; skirts follow the hip angle and no triangle stretches. Switch to Smooth LBS to compare.</div></section>
 <div id="original-note" class="note" hidden><span>Original asset</span>This version has no skeleton, so pose and equipment controls are disabled. Switch back to the rigged model to continue.</div><div id="error" class="error" role="alert" hidden></div></div>
 <div class="asset-info"><div class="section-caption">SOURCE ASSET <span>MESHY · 15 JOINTS</span></div><dl><div><dt>Triangles</dt><dd id="asset-triangles">29,999</dd></div><div><dt>Joints</dt><dd>15 (Pelvis Root)</dd></div><div><dt>Shared boundary groups</dt><dd id="asset-boundaries">731</dd></div><div><dt>Attachment error</dt><dd id="attachment-error">—</dd></div><div><dt>Seam error</dt><dd id="seam-error">—</dd></div><div><dt>Frame time</dt><dd id="frame-time">—</dd></div></dl><a id="download-glb" href="./assets/models/gundam-sentinel.glb" download>Download processed GLB <span>↗</span></a></div></aside></main><footer>GUNDAM HANGAR <span>CS184 Final Project · 15-joint full-body rig · M6 socket equipment</span></footer>`;
  return document.querySelector<HTMLElement>("#viewport")!;
}

export function bindPanel(store: Store, c: Commands) {
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll<HTMLButtonElement>("[data-tab]")
          .forEach((t) => {
            const active = t === b;
            t.classList.toggle("active", active);
            t.setAttribute("aria-selected", String(active));
            el(`panel-${t.dataset.tab}`).hidden = !active;
          });
      }),
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-model]")
    .forEach(
      (b) =>
        (b.onclick = () => void c.setModel(b.dataset.model as ModelMode)),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-right-hand]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          c.setRightHandItem(b.dataset.rightHand as RightHandItem)),
    );
  el("loadout-collapse-btn").onclick = () => c.toggleLoadoutCollapsed();
  el<HTMLInputElement>("saber-blade-toggle").onchange = (e) =>
    c.setSaberBladeVisible((e.target as HTMLInputElement).checked);
  el<HTMLInputElement>("loadout-shield-toggle").onchange = (e) =>
    c.setShieldVisible((e.target as HTMLInputElement).checked);

  document
    .querySelectorAll<HTMLButtonElement>("[data-skinning]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          c.setSkinningMode(b.dataset.skinning as SkinningMode)),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-pose]")
    .forEach(
      (b) => (b.onclick = () => c.pose(b.dataset.pose as PosePresetName)),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach(
      (b) => (b.onclick = () => c.playAction(b.dataset.action as ActionName)),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-transition]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          c.setTransitionMode(b.dataset.transition as TransitionMode)),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-camera]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          c.camera(b.dataset.camera as "front" | "side" | "orbit")),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-zoom]")
    .forEach((b) => (b.onclick = () => c.zoom(b.dataset.zoom as "in" | "out")));
  for (const j of JOINTS)
    el<HTMLInputElement>(j).oninput = (e) =>
      c.setJoint(j, Number((e.target as HTMLInputElement).value));
  for (const [id, fn] of [
    ["weapon", c.setWeaponVisible],
    ["shield", c.setShieldVisible],
    ["wireframe", c.setWireframe],
    ["parts", c.setPartColors],
    ["joints", c.setJointsVisible],
  ] as const)
    el<HTMLInputElement>(id).onchange = (e) =>
      fn((e.target as HTMLInputElement).checked);
  el("play").onclick = c.play;
  el("reset-pose").onclick = c.reset;
  el("reset-pose-panel").onclick = c.reset;
  el<HTMLInputElement>("timeline").oninput = (e) =>
    c.seek(Number((e.target as HTMLInputElement).value));

  store.subscribe((s) => {
    const disabled = !s.ready || s.loading,
      armDisabled = disabled || s.mode === "original";
    for (const id of [
      ...JOINTS,
      "weapon",
      "shield",
      "loadout-shield-toggle",
      "parts",
      "joints",
      "play",
      "reset-pose",
      "reset-pose-panel",
      "timeline",
    ])
      (el(id) as HTMLInputElement).disabled = armDisabled;
    el<HTMLInputElement>("wireframe").disabled = disabled;
    el<HTMLInputElement>("saber-blade-toggle").disabled =
      armDisabled || s.mode === "legacy" || s.rightHandItem !== "saber";
    el<HTMLInputElement>("saber-blade-toggle").checked = s.saberBlade;
    el<HTMLInputElement>("loadout-shield-toggle").checked = s.shield;

    const drawer = el("loadout-drawer");
    drawer.classList.toggle("collapsed", s.loadoutCollapsed);
    const collapseBtn = el("loadout-collapse-btn");
    collapseBtn.setAttribute("aria-expanded", String(!s.loadoutCollapsed));
    collapseBtn.textContent = s.loadoutCollapsed ? "▶" : "◀";

    document
      .querySelectorAll<HTMLButtonElement>("[data-right-hand]")
      .forEach((b) => {
        const item = b.dataset.rightHand as RightHandItem;
        b.disabled = armDisabled || (s.mode === "legacy" && item === "saber");
        b.classList.toggle("active", item === s.rightHandItem);
      });

    document
      .querySelectorAll<HTMLButtonElement>("[data-pose]")
      .forEach((b) => (b.disabled = armDisabled));
    document
      .querySelectorAll<HTMLButtonElement>("[data-action]")
      .forEach((b) => {
        b.disabled = armDisabled;
        b.classList.toggle("active", b.dataset.action === s.action);
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-transition]")
      .forEach((b) => {
        b.disabled = armDisabled;
        b.classList.toggle(
          "active",
          b.dataset.transition === s.transitionMode,
        );
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-model]")
      .forEach((b) => {
        b.disabled = disabled;
        b.classList.toggle("active", b.dataset.model === s.mode);
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-skinning]")
      .forEach((b) => {
        b.disabled = armDisabled;
        b.classList.toggle("active", b.dataset.skinning === s.skinning);
      });
    for (const j of JOINTS) {
      el<HTMLOutputElement>(`${j}-value`).value = `${Math.round(s.angles[j])}°`;
      el<HTMLInputElement>(j).value = String(s.angles[j]);
    }
    for (const id of [
      "weapon",
      "shield",
      "parts",
      "wireframe",
      "joints",
    ] as const)
      el<HTMLInputElement>(id).checked = s[id];
    el("play").textContent = s.playing ? "Ⅱ" : "▶";
    el("play").setAttribute(
      "aria-label",
      s.playing ? "Pause animation" : "Play full-body animation",
    );
    el<HTMLInputElement>("timeline").max = String(s.duration);
    el<HTMLInputElement>("timeline").value = String(s.time);
    el("time-label").textContent =
      `${s.time.toFixed(2)} / ${s.duration.toFixed(2)} s`;
    el("stage-status").textContent = s.loading
      ? "Switching model"
      : s.mode === "original"
        ? "Original model · static"
        : s.playing
          ? "Running full-body motion"
          : s.mode === "legacy"
            ? "Legacy · ready"
            : "Sentinel (new) · ready";
    el("model-badge").textContent =
      s.mode === "original"
        ? "ORIGINAL · GLB"
        : s.mode === "legacy"
          ? "LEGACY 15-JOINT · GLB"
          : "SENTINEL 15-JOINT · GLB";
    el("asset-triangles").textContent =
      s.mode === "legacy" ? "9,944" : "29,999";
    el("asset-boundaries").textContent =
      s.mode === "legacy" ? "367" : "731";
    el<HTMLAnchorElement>("download-glb").href =
      s.mode === "legacy"
        ? "./assets/models/gundam-rigged.glb"
        : "./assets/models/gundam-sentinel.glb";
    el("original-note").hidden = s.mode !== "original";
    el("error").hidden = !s.error;
    el("error").textContent = s.error;
  });
}
