# Mecha Hangar: Project Plan

> CS184 Final Project · Fall 2026
> 路线：**先完成电脑端（桌面浏览器），再适配 Vision Pro（窗口式）**。沉浸式空间展示是 aspirational 目标。

---

## 0. 关键日期

| 日期 | 事项 |
|---|---|
| **Tue Nov 10, 11:59 PM** | Proposal PDF（含可点击网站链接）交 Gradescope |
| Sun Nov 22, 11:59 PM | Milestone：网页 + 约 1 分钟视频（每人都要出镜/说话）+ 2–3 页 slides |
| **Sun Dec 6, 11:59 PM** | Final：网页报告 + 1–2 分钟视频 + slides + showcase 小片段，**不允许迟交** |
| Mon–Tue Dec 7–8 | 现场展示：5 分钟（含 1 分钟 demo）+ 3 分钟 Q&A |
| TBD | 每人单独填 Peer Review |

> 课程会根据 **GitHub 提交记录**调整个人分数，所以每个人都要用自己的 GitHub 账号提交自己写的代码。

---

## 1. 范围（Baseline vs Aspirational）

### Baseline：必须完成
- 一个可动的机甲（先用程序生成的方块原型，Week 2 换成正式 GLB）
- 3 套配色预设 + 4 个装甲区域独立换色（primary / secondary / accent / frame）
- 2 把可替换手持武器（rifle、beam sword）+ 1 个可拆卸背包
- 3 个动作：idle / aim / sword swing，支持中途打断和**平滑过渡**
- 桌面网页：旋转/缩放查看、Appearance / Equipment / Animation tabs
- 评估：挂点误差、动作连续性曲线（cut vs blend）、帧时间（median / p95）
- 在 Vision Pro Safari 打开同一个网页，测试显示、按钮操作和性能（窗口式）

### Aspirational：有余力再做
- visionOS 原生外壳（WKWebView 加载网页）
- WebXR 沉浸模式：机甲立体出现在空间中，空间菜单
- Drag-and-snap：拖动武器靠近挂点，满足距离/角度阈值后自动吸附

### 明确不做
全身 IK、走路、战斗、复杂变形、多人、真实房间重建。

---

## 2–3. Architecture and conventions

See [ARCHITECTURE.md](ARCHITECTURE.md) (shared commands/state layer, module boundaries, coordinate and asset conventions, the split between library code and our own implementation).

---

## 4. Development stages

Each stage is split into task cards in `docs/tasks/` (with acceptance criteria) that can be handed to a team member or dsh / Antigravity directly. The overview is in [tasks/README.md](tasks/README.md).

| # | Stage | Task cards | Key acceptance criterion |
|---|---|---|---|
| ⓪ | Proposal webpage | T00 | Submitted tonight |
| ① | Project and scene basics | T01, T02 | Opens, rotates and zooms normally |
| ② | Box prototype rig | T03 | When the shoulder moves, only that arm follows |
| ③ | Equipment and colors | T04, T05 | Weapons stay in the hand during motion; regions recolor independently |
| ④ | Animation system | T06, T07 | 3 actions can be played, interrupted, switched; no pops in blend mode |
| ⑤ | Shared state and desktop UI | T08 | Full demo flow works |
| ⑥ | Real model integration | T09 | All animations / equipment work directly on the real model |
| ⑦ | Deploy | T10 | Website and demo update automatically |
| ⑧ | Evaluation | T11 | Charts for continuity, attachment error, performance |
| ⑨ | Vision Pro | T12 | Full flow on the device |

## 5. 每周计划

### Week 1 · Nov 11–17: framework + prototype + asset selection
- [ ] **D**: T01 project init, T02 scene basics (finish in the first two days so the others can build on them)
- [ ] **B**: T03 box prototype rig → T06 keyframe sampling + idle
- [ ] **C**: T04 equipment system (placeholder geometry)
- [ ] **A**: T05 colors; in parallel, choose 1–2 candidate mechas and check skeleton, parts and materials in Blender (T09 step 1–2)
- **End-of-week check**: on the box prototype, the arm moves with the weapon attached, colors change, idle plays

### Week 2 · Nov 18–24: complete feature loop + milestone
- [ ] T07 animation state machine and transitions, T08 shared state + desktop panel, T10 auto-deploy
- [ ] T09 real model: all 3 actions, equipment swaps and recoloring work
- [ ] 动作与装备联动（挥剑自动装剑、瞄准自动装枪）在正式模型上无穿帮
- [ ] 首次 Vision Pro Safari 测试：打开网页 → 按钮能点 → 记录帧率
- [ ] **Nov 22**：Milestone 网页 + 1 分钟视频（4 人都出镜）+ 2–3 页 slides
- **周末验收**：端到端 demo：加载 → 换色 → 装剑 → 挥剑 → 换枪 → 瞄准

### Week 3 · Nov 25–Dec 1：评估 + Vision Pro 适配
- [ ] T11 evaluation tools; continuity experiment: export joint-angle CSV, plot cut vs blend
- [ ] 挂点正确性实验：多姿态下测位置/角度误差 + 截图对比握持
- [ ] 性能实验：固定场景重复测试，记录 median / p95 帧时间；对比阴影开关、模型面数
- [ ] T12 Vision Pro: enlarge buttons, add explicit rotate/zoom buttons, test performance
- [ ] 核心稳定后才开始 aspirational（App 外壳 / WebXR / drag-and-snap）

### Week 4 · Dec 2–6：冻结 + 交付
- [ ] **Dec 2 冻结核心功能**，之后只修 bug
- [ ] 录 final video（1–2 分钟，4 人都出镜）、showcase 短片/GIF
- [ ] Final 报告网页（2–3 页）：abstract / technical approach / problems / lessons / results / references / 每人贡献
- [ ] 5 分钟展示 slides（最好的结果放最前面）
- [ ] **Dec 6 11:59 PM** 提交 PDF（Safari → Print → Save as PDF）

---

## 6. 分工

| 成员 | 主要负责 | 代码目录 |
|---|---|---|
| A · [Member 1] | 资产准备、Blender、关节配置、挂点、材质分区 | `src/mecha/`, `public/assets/` |
| B · [Member 2] | 关键姿势、动画采样、播放状态机、动作过渡 | `src/animation/` |
| C · [Member 3] | 装备系统、Vision Pro 测试与适配、（可选）WebXR | `src/mecha/equipment.ts`, 以后 `src/xr/` |
| D · [Member 4] | 桌面 UI、状态同步、性能测量、网页与报告 | `src/ui/`, `src/app/`, `src/debug/`, `website/` |

所有人都参与集成、评估、文档和展示，并在 milestone / final 视频里出镜。

## 7. 评估

| Dimension | Method | Tool (T11) |
|---|---|---|
| Attachment correctness | In each pose, compare the scene-graph result with an explicit matrix product (position/angle error); check grip in screenshots | Attachment error check |
| Animation continuity | Record joint angles before and after action switches; compare cut vs blend | Joint-angle CSV + plots |
| Interaction reliability | Combined tests of equipment swaps, recoloring, interrupted actions and view resets; check for lost state | Manual test checklist |
| Rendering performance | Median / p95 frame time in a fixed scene; compare triangle counts and shadow settings | Frame-time statistics |

研究问题：
1. 共享的挂点 + 动画系统能否在不重做动画的情况下支持多种装备组合？
2. 动作混合在交互式切换时对连续性提升多少？
3. 模型复杂度和渲染设置对桌面端与 Vision Pro 性能的影响？

## 8. 风险

| 风险 | 应对 |
|---|---|
| AI 生成模型骨架不可用 / 装甲变形严重 | Week 1 就测；不行就改用分件刚体模型（和方块原型同结构） |
| Real model integration slips | The box prototype implements the same interface, so it can demo every system on its own; the real model is just a reskin |
| Vision Pro 设备时间不够 / 平台限制 | Safari 网页版就能演示；App 外壳与沉浸模式是 aspirational |
| 范围膨胀 | 优先级：挂点 > 动画过渡 > 桌面 UI > Vision Pro > drag-and-snap > 装饰 |
