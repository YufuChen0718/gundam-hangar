import type { Store } from "../app/state";
import type { Commands } from "../app/commands";
import type { JointAngles } from "../mecha/types";
export function createLayout(root: HTMLElement) {
  root.innerHTML = `<header class="topbar"><a class="brand" href="#"><span class="brand-mark">GH</span><span>GUNDAM <b>HANGAR</b><small>CS184 / ASSET WORKBENCH</small></span></a><div class="project-meta"><span class="live-dot"></span> DESKTOP PROTOTYPE <span class="version">01 / 单臂验证</span></div></header>
 <main class="workspace"><section class="stage"><div id="viewport" aria-label="可旋转的高达三维模型"></div><div class="stage-top"><div><div class="eyebrow">MODEL STUDY / 001</div><h1>从静态模型，到机械运动。</h1><p>检查关节、武器挂点与原始资产。</p></div><span class="stage-badge" id="model-badge">ARTICULATED ARM · GLB</span></div>
 <div id="loading" role="status"><span class="loader"></span><strong>正在装载整备舱</strong><span>读取模型与内嵌贴图…</span></div><div class="camera-tools" aria-label="相机控制"><button data-camera="orbit" title="三分之四视角">◈</button><button data-camera="front">正面</button><button data-camera="side">侧面</button><span></span><button data-zoom="in" aria-label="放大">＋</button><button data-zoom="out" aria-label="缩小">−</button></div>
 <div class="stage-bottom"><span><i class="live-dot"></i> <b id="stage-status">等待模型</b></span><span>拖动旋转 · 滚轮缩放 · 右键平移</span></div>
 <div class="timeline"><button id="play" class="play-button" disabled aria-label="播放抬臂动画">▶</button><div class="timeline-body"><div><strong>抬臂验证</strong><span id="time-label">0.00 / 6.00 s</span></div><input id="timeline" type="range" min="0" max="6" step="0.01" value="0" aria-label="动画时间" disabled/><div class="timeline-ticks"><span>静止</span><span>抬臂</span><span>保持</span><span>复位</span></div></div><button id="reset-pose" class="text-button" disabled>复位 ↺</button></div>
 </section><aside class="inspector"><div class="panel-heading"><div class="eyebrow">CONTROL DECK</div><h2>模型实验台 <span>01</span></h2><p>先验证一条手臂，再扩展完整系统。</p></div>
 <div class="model-switch" role="group" aria-label="模型版本"><button data-model="prepared" class="active" disabled>单臂处理版</button><button data-model="original" disabled>原始模型</button></div>
 <div class="tabs" role="tablist"><button role="tab" aria-selected="true" aria-controls="panel-pose" data-tab="pose" class="active">姿态</button><button role="tab" aria-selected="false" aria-controls="panel-equipment" data-tab="equipment">装备</button><button role="tab" aria-selected="false" aria-controls="panel-inspect" data-tab="inspect">检查</button></div>
 <div class="panel-content"><section id="panel-pose" role="tabpanel"><div class="section-caption">RIGHT ARM <span>局部关节控制</span></div><div class="presets"><button data-pose="rest" disabled>初始</button><button data-pose="raise" disabled>抬臂</button><button data-pose="aim" disabled>举枪</button></div>
 ${[
   ["shoulder", "肩关节", "Shoulder", 0, 55],
   ["elbow", "肘关节", "Elbow", 0, 85],
   ["wrist", "手腕", "Wrist", -20, 20],
 ]
   .map(
     ([id, label, en, min, max]) =>
       `<label class="slider-label" for="${id}"><span>${label}<small>${en}</small></span><output id="${id}-value">0°</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="1" value="0" disabled/><div class="range-limits"><span>${min}°</span><span>${max}°</span></div>`,
   )
   .join("")}
 <div class="note"><span>实验范围</span>目前只控制持枪侧肩、肘、手腕。身体其余部位保持静止；这是一份单臂关节原型。</div></section>
 <section id="panel-equipment" role="tabpanel" hidden><div class="section-caption">ATTACHMENTS <span>随关节运动</span></div><label class="toggle-row"><span>步枪<small>rightHand → rifleOffset</small></span><input id="weapon" type="checkbox" checked disabled/></label><label class="toggle-row"><span>盾牌<small>独立网格 · 静态连接</small></span><input id="shield" type="checkbox" checked disabled/></label><div class="note"><span>挂点验证</span>隐藏步枪可检查手部切分。第二种武器尚未制作；现阶段验证原武器能否稳定跟随手臂。</div></section>
 <section id="panel-inspect" role="tabpanel" hidden><div class="section-caption">DIAGNOSTICS <span>结构与外观</span></div><label class="toggle-row"><span>线框<small>观察几何密度</small></span><input id="wireframe" type="checkbox" disabled/></label><label class="toggle-row"><span>部件着色<small>显示几何切分边界</small></span><input id="parts" type="checkbox" disabled/></label><label class="toggle-row"><span>关节坐标轴<small>肩、肘、腕与武器挂点</small></span><input id="joints" type="checkbox" disabled/></label><div class="legend"><span style="--c:#f2a44d">上臂</span><span style="--c:#46c9c1">前臂</span><span style="--c:#ab88dd">手部</span><span style="--c:#ea6676">武器</span></div><div class="note"><span>显示说明</span>部件着色只用于检查，不是装甲皮肤功能。共享边界权重保持连续；极端姿态可能出现局部变形。</div></section>
 <div id="original-note" class="note" hidden><span>原始资产</span>这个版本没有骨架，姿态与装备控件已停用。切回单臂处理版可继续操作。</div><div id="error" class="error" role="alert" hidden></div></div>
 <div class="asset-info"><div class="section-caption">SOURCE ASSET <span>MESHY</span></div><dl><div><dt>原始三角面</dt><dd>9,944</dd></div><div><dt>内嵌贴图</dt><dd>4 × 2K</dd></div><div><dt>处理方式</dt><dd>关节蒙皮 + 武器挂点</dd></div><div><dt>挂点位置误差</dt><dd id="attachment-error">—</dd></div><div><dt>运动边界误差</dt><dd id="seam-error">—</dd></div><div><dt>浏览器帧间隔</dt><dd id="frame-time">—</dd></div></dl><a href="./assets/models/mecha-right-arm.glb" download>下载处理版 GLB <span>↗</span></a></div></aside></main><footer>GUNDAM HANGAR <span>原始模型保留 · 可复现处理脚本 · 桌面优先</span></footer>`;
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
    .querySelectorAll<HTMLButtonElement>("[data-pose]")
    .forEach(
      (b) =>
        (b.onclick = () => c.pose(b.dataset.pose as "rest" | "raise" | "aim")),
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
  for (const j of ["shoulder", "elbow", "wrist"] as (keyof JointAngles)[])
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
  el<HTMLInputElement>("timeline").oninput = (e) =>
    c.seek(Number((e.target as HTMLInputElement).value));
  store.subscribe((s) => {
    const disabled = !s.ready || s.loading,
      armDisabled = disabled || s.mode === "original";
    for (const id of [
      "shoulder",
      "elbow",
      "wrist",
      "weapon",
      "shield",
      "parts",
      "joints",
      "play",
      "reset-pose",
      "timeline",
    ])
      (el(id) as HTMLInputElement).disabled = armDisabled;
    el<HTMLInputElement>("wireframe").disabled = disabled;
    document
      .querySelectorAll<HTMLButtonElement>("[data-pose]")
      .forEach((b) => (b.disabled = armDisabled));
    document
      .querySelectorAll<HTMLButtonElement>("[data-model]")
      .forEach((b) => {
        b.disabled = disabled;
        b.classList.toggle("active", b.dataset.model === s.mode);
      });
    for (const j of ["shoulder", "elbow", "wrist"] as const) {
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
      s.playing ? "暂停动画" : "播放抬臂动画",
    );
    el<HTMLInputElement>("timeline").value = String(s.time);
    el("time-label").textContent = `${s.time.toFixed(2)} / 6.00 s`;
    el("stage-status").textContent = s.loading
      ? "正在加载原始资产"
      : s.mode === "original"
        ? "原始模型 · 静态"
        : s.playing
          ? "正在验证关节运动"
          : "单臂处理版 · 就绪";
    el("model-badge").textContent =
      s.mode === "original" ? "ORIGINAL · GLB" : "ARTICULATED ARM · GLB";
    el("original-note").hidden = s.mode !== "original";
    el("error").hidden = !s.error;
    el("error").textContent = s.error;
  });
}
