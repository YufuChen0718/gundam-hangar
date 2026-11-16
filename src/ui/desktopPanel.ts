import type { Store } from "../app/state";
import type { Commands } from "../app/commands";
import { JOINTS } from "../mecha/types";
import type { JointName, PosePresetName, SkinningMode } from "../mecha/types";
import type { ActionName, TransitionMode } from "../animation/clips";
import { JOINT_LIMITS, TEST_POSES } from "../mecha/rigConfig";

const JOINT_GROUPS: {
  title: string;
  subtitle: string;
  joints: [JointName, string, string][];
}[] = [
  {
    title: "CORE & HEAD",
    subtitle: "骨盆根节点 · 胸腰 · 头部",
    joints: [
      ["pelvis", "骨盆 (Root)", "Pelvis Yaw"],
      ["torso", "胸腰", "Torso Twist"],
      ["head", "头部", "Head Yaw"],
    ],
  },
  {
    title: "RIGHT ARM",
    subtitle: "右臂（持步枪）",
    joints: [
      ["rightShoulder", "右肩", "R.Shoulder"],
      ["rightElbow", "右肘", "R.Elbow"],
      ["rightWrist", "右腕", "R.Wrist"],
    ],
  },
  {
    title: "LEFT ARM",
    subtitle: "左臂（持护盾）",
    joints: [
      ["leftShoulder", "左肩", "L.Shoulder"],
      ["leftElbow", "左肘", "L.Elbow"],
      ["leftWrist", "左腕", "L.Wrist"],
    ],
  },
  {
    title: "RIGHT LEG",
    subtitle: "右腿（单向屈膝）",
    joints: [
      ["rightHip", "右髋", "R.Hip"],
      ["rightKnee", "右膝", "R.Knee"],
      ["rightAnkle", "右踝", "R.Ankle"],
    ],
  },
  {
    title: "LEFT LEG",
    subtitle: "左腿（单向屈膝）",
    joints: [
      ["leftHip", "左髋", "L.Hip"],
      ["leftKnee", "左膝", "L.Knee"],
      ["leftAnkle", "左踝", "L.Ankle"],
    ],
  },
];

export function createLayout(root: HTMLElement) {
  root.innerHTML = `<header class="topbar"><a class="brand" href="#"><span class="brand-mark">GH</span><span>GUNDAM <b>HANGAR</b><small>CS184 / FULL-BODY FK WORKBENCH</small></span></a><div class="project-meta"><span class="live-dot"></span> DESKTOP PROTOTYPE <span class="version">T13 / 15-JOINT FULL BODY</span></div></header>
 <main class="workspace"><section class="stage"><div id="viewport" aria-label="可旋转的高达三维模型"></div><div class="stage-top"><div><div class="eyebrow">MODEL STUDY / T13</div><h1>全身 15 关节正向运动学与接缝验证。</h1><p>骨盆根节点驱动全身 · 关节角度限位 · 共享边界零裂缝 · 双足贴合平台。</p></div><span class="stage-badge" id="model-badge">FULL-BODY 15-JOINT · GLB</span></div>
 <div id="loading" role="status"><span class="loader"></span><strong>正在装载整备舱</strong><span>读取全身绑定模型与内嵌贴图…</span></div><div class="camera-tools" aria-label="相机控制"><button data-camera="orbit" title="三分之四视角">◈</button><button data-camera="front">正面</button><button data-camera="side">侧面</button><span></span><button data-zoom="in" aria-label="放大">＋</button><button data-zoom="out" aria-label="缩小">−</button></div>
 <div class="stage-bottom"><span><i class="live-dot"></i> <b id="stage-status">等待模型</b></span><span>拖动旋转 · 滚轮缩放 · 右键平移</span></div>
 <div class="timeline"><button id="play" class="play-button" disabled aria-label="播放全身动作">▶</button><div class="timeline-body"><div><strong>全身联动验证</strong><span id="time-label">0.00 / 6.00 s</span></div><input id="timeline" type="range" min="0" max="6" step="0.01" value="0" aria-label="动画时间" disabled/><div class="timeline-ticks"><span>静止</span><span>展开</span><span>保持</span><span>复位</span></div></div><button id="reset-pose" class="text-button" disabled>Reset pose ↺</button></div>
 </section><aside class="inspector"><div class="panel-heading"><div class="eyebrow">CONTROL DECK</div><h2>模型实验台 <span>15J</span></h2><p>骨盆为根节点的 15 关节层级 FK 与测试姿态库。</p></div>
 <div class="model-switch" role="group" aria-label="模型版本"><button data-model="prepared" class="active" disabled>全身绑定版</button><button data-model="original" disabled>原始模型</button></div>
 <div class="tabs" role="tablist"><button role="tab" aria-selected="true" aria-controls="panel-pose" data-tab="pose" class="active">姿态</button><button role="tab" aria-selected="false" aria-controls="panel-equipment" data-tab="equipment">装备</button><button role="tab" aria-selected="false" aria-controls="panel-inspect" data-tab="inspect">检查</button></div>
 <div class="panel-content"><section id="panel-pose" role="tabpanel"><div class="section-caption">ACTIONS <span>idle / aim / swing</span></div><div class="presets"><button data-action="idle" disabled>Idle</button><button data-action="aim" disabled>Aim</button><button data-action="swing" disabled>Swing</button></div><div class="section-caption">TRANSITION <span>M5 切换方式</span></div><div class="model-switch" style="margin:10px 0 18px" role="group" aria-label="动作切换方式"><button data-transition="blend" class="active" disabled>Blend (0.3s)</button><button data-transition="cut" disabled>Cut</button></div><div class="section-caption">TEST POSES <span>9 组全身测试姿态</span></div><div class="presets presets-grid">${TEST_POSES.map(
   (p) =>
     `<button data-pose="${p.id}" title="${p.label}" disabled>${p.shortLabel}</button>`,
 ).join(
   "",
 )}</div><button id="reset-pose-panel" class="reset-pose-btn" disabled>Reset pose · 复位全身姿态</button>
 ${JOINT_GROUPS.map(
   (g) => `<div class="joint-group"><div class="section-caption">${g.title} <span>${g.subtitle}</span></div>${g.joints
     .map(([id, label, en]) => {
       const [min, max] = JOINT_LIMITS[id];
       return `<label class="slider-label" for="${id}"><span>${label}<small>${en}</small></span><output id="${id}-value">0°</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="1" value="0" disabled/><div class="range-limits"><span>${min}°</span><span>${max}°</span></div>`;
     })
     .join("")}</div>`,
 ).join("")}
 <div class="note"><span>层级与限位</span>骨盆（Pelvis）为全身根节点；膝、肘仅向单侧弯曲，下蹲时双足自动保持在展示台表面。</div></section>
 <section id="panel-equipment" role="tabpanel" hidden><div class="section-caption">ATTACHMENTS <span>随关节运动</span></div><label class="toggle-row"><span>步枪<small>rightHand → rifleOffset</small></span><input id="weapon" type="checkbox" checked disabled/></label><label class="toggle-row"><span>盾牌<small>随左前臂（leftElbow）运动</small></span><input id="shield" type="checkbox" checked disabled/></label><div class="note"><span>挂点验证</span>步枪通过右手挂点跟随右臂，护盾随左前臂关节联动。</div></section>
 <section id="panel-inspect" role="tabpanel" hidden><div class="section-caption">SKINNING <span>M3 蒙皮方式</span></div><div class="model-switch" style="margin:10px 0 18px" role="group" aria-label="蒙皮方式"><button data-skinning="three" disabled>Three.js skinning</button><button data-skinning="lbs" class="active" disabled>our LBS</button><button data-skinning="rigid" disabled>rigid parts</button></div><div class="section-caption">DIAGNOSTICS <span>结构与外观</span></div><label class="toggle-row"><span>线框<small>观察几何密度</small></span><input id="wireframe" type="checkbox" disabled/></label><label class="toggle-row"><span>部件着色<small>显示 17 个全身切分部件</small></span><input id="parts" type="checkbox" disabled/></label><label class="toggle-row"><span>关节坐标轴<small>全部 15 个关节与手部挂点</small></span><input id="joints" type="checkbox" disabled/></label><div class="legend"><span style="--c:#68829e">骨盆</span><span style="--c:#4f7cac">胸腰</span><span style="--c:#e8c547">头部</span><span style="--c:#f2a44d">上臂</span><span style="--c:#46c9c1">前臂</span><span style="--c:#5c9ead">大腿</span><span style="--c:#82b366">小腿</span><span style="--c:#d96b6b">足部</span></div><div class="note"><span>显示说明</span>共享边界顶点权重在原始顶点索引上计算，保证全部 17 个部件在全身大角度姿态下零裂缝。</div></section>
 <div id="original-note" class="note" hidden><span>原始资产</span>这个版本没有骨架，姿态与装备控件已停用。切回全身绑定版可继续操作。</div><div id="error" class="error" role="alert" hidden></div></div>
 <div class="asset-info"><div class="section-caption">SOURCE ASSET <span>MESHY · 15 JOINTS</span></div><dl><div><dt>原始三角面</dt><dd>9,944</dd></div><div><dt>全身关节数</dt><dd>15 (Pelvis Root)</dd></div><div><dt>共享边界组</dt><dd>367</dd></div><div><dt>挂点位置误差</dt><dd id="attachment-error">—</dd></div><div><dt>运动边界误差</dt><dd id="seam-error">—</dd></div><div><dt>浏览器帧间隔</dt><dd id="frame-time">—</dd></div></dl><a href="./assets/models/gundam-rigged.glb" download>下载处理版 GLB <span>↗</span></a></div></aside></main><footer>GUNDAM HANGAR <span>原始模型保留 · 15 关节全身绑定 · 桌面优先</span></footer>`;
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
        (b.onclick = () =>
          void c.setModel(b.dataset.model as "prepared" | "original")),
    );
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
      "parts",
      "joints",
      "play",
      "reset-pose",
      "reset-pose-panel",
      "timeline",
    ])
      (el(id) as HTMLInputElement).disabled = armDisabled;
    el<HTMLInputElement>("wireframe").disabled = disabled;
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
      s.playing ? "暂停动画" : "播放全身动画",
    );
    el<HTMLInputElement>("timeline").max = String(s.duration);
    el<HTMLInputElement>("timeline").value = String(s.time);
    el("time-label").textContent =
      `${s.time.toFixed(2)} / ${s.duration.toFixed(2)} s`;
    el("stage-status").textContent = s.loading
      ? "正在加载原始资产"
      : s.mode === "original"
        ? "原始模型 · 静态"
        : s.playing
          ? "正在验证全身运动"
          : "全身绑定版 · 就绪";
    el("model-badge").textContent =
      s.mode === "original" ? "ORIGINAL · GLB" : "FULL-BODY 15-JOINT · GLB";
    el("original-note").hidden = s.mode !== "original";
    el("error").hidden = !s.error;
    el("error").textContent = s.error;
  });
}
