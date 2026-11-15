# 电脑端单臂原型：运行与继续开发

本版本完成用户要求的第一条工作链：保留原模型 → 导出静态 GLB → 桌面查看器 → 持枪侧关节与武器 → 抬臂验证。它不是完整课程项目，也没有完成 Vision Pro、装甲换色、第二种武器和完整动作库。

## 运行

在仓库根目录使用满足 Vite 8 要求的 Node.js（本次验证环境为 Node.js 26.8.1）：

```sh
npm ci
npm run dev
```

浏览器访问终端打印的地址。构建与逻辑测试：

```sh
npm test
npm run build
npm run preview
```

浏览器验收脚本使用本机 Google Chrome。先启动服务器，然后运行：

```sh
node scripts/browser-check.mjs
```

默认测试 `http://127.0.0.1:5173/`，也可设置 `HANGAR_URL` 指定开发或构建预览地址。脚本保存截图与 JSON 验收结果到 `docs/results/`。无头浏览器的耗时不应作为真实设备 FPS 基准。

## 页面操作

- 拖动模型区旋转视角，滚轮缩放，右键平移；也可使用正面、侧面、缩放按钮。
- 切换“单臂处理版 / 原始模型”。原始模型没有骨架，因此关节与装备控件被禁用。
- 姿态面板：肩、肘、手腕滑块；初始、抬臂、举枪姿态预设。
- 播放按钮：播放 6 秒的抬臂—保持—回位动作，再按暂停；时间条可逐帧检查；复位恢复绑定姿态。
- 装备面板：步枪和盾牌的显示开关。当前只有原步枪，不代表已经完成多武器替换。
- 检查面板：线框、部件着色、关节坐标轴。部件着色是调试功能，不是装甲皮肤功能。

## 资产

- `assets-src/mecha-original.blend`：用户原文件的完整副本。
- `assets-src/mecha-right-arm.blend`：单臂骨架、共享边界权重、独立武器与盾牌。
- `public/assets/models/mecha-original.glb`：原始静态模型。
- `public/assets/models/mecha-right-arm.glb`：可在当前应用中运动的模型。

贴图仍是原资产的单材质贴图。原始 9,944 个三角面全部保留，UV 保留；没有新建完整身体几何。肩甲主体和武器尽量保持刚性，关节边界通过共享权重连续变形。当前并非全身绑定。

## 为什么修复版不会逐面裂开

第一版按面中心位置把整体网格拆成刚性部件，使共享边界的相邻面跟随不同的旋转，出现用户指出的肩甲残片和肘部裂口。修复版：

1. 对每组候选部件进行连通性检查，将误分的独立碎片重新分配。
2. 在原始顶点索引上统一计算权重，之后才复制成不同部件。
3. 所有共享顶点副本使用完全相同的权重，原始法线和 UV 保留。
4. 仅在关节周围做窄范围权重过渡，装甲内部尽量保持单关节影响。
5. 步枪独立挂到手部，枪与手部交界顶点使用一致的腕部变换。

这解决的是表面分离问题。极端角度下的蒙皮形变、关节穿插和原模型缺陷仍可能存在，不能把接缝测试通过解释为完整的碰撞或美术质量保证。

## 模块与接口

遵循现有项目布局：

- `scene/createScene.ts`：渲染器、相机、灯光、展示台、OrbitControls、容器尺寸更新。
- `mecha/loadMecha.ts` / `rigConfig.ts`：真实 GLB 与程序关节名映射。
- `mecha/types.ts`：当前使用独立的 `ArmPreviewRig` 接口；不伪造 ARCHITECTURE.md 中尚未实现的四个装甲材质区域。
- `mecha/equipment.ts`：当前装备可见性与挂点集成。
- `mecha/appearance.ts`：原材质恢复、调试着色与线框。
- `animation/samplePose.ts`：关键帧时间定位、缓动、四元数插值。
- `animation/animator.ts`：抬臂播放、暂停、时间定位、复位及从当前姿态起播的短过渡。
- `app/commands.ts`：唯一 UI 操作入口；所有模型操作集中在此。
- `main.ts`：一个 setAnimationLoop，顺序为控件 → 动画 → 渲染。

没有使用 AnimationMixer、AnimationClip 或 KeyframeTrack。蒙皮变换和渲染由 Three.js 提供；权重准备、采样、控制与验证逻辑由本项目实现。

## 重新生成资产

在 Mac 上，使用已有 Blender 安装及保留的源模型：

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --disable-autoexec assets-src/mecha-original.blend \
  --python scripts/export_static.py -- --output "$PWD"

/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --disable-autoexec assets-src/mecha-original.blend \
  --python scripts/prepare_mecha.py -- --output "$PWD"
```

脚本针对这一份 Meshy 资产调参，不是通用自动绑定算法。准备脚本会在导出前测试四组姿态的共享边界距离；超过阈值会失败。输出会覆盖处理版和 GLB，不覆盖原始 .blend。

## 当前验收边界

- 已通过严格 TypeScript 检查和 Vite 构建。
- 8 个动画逻辑测试通过。
- Chrome 检查模型加载、4 组姿态的接缝/挂点、装备显示、调试控件、版本切换、播放暂停复位和 390px 窄屏布局。
- 90 组边界匹配点在测试姿态中保持约 0.0001 mm 以内的一致性，详见 JSON；这属于数值一致性验证。
- 还没有正式性能基准、完整多动作系统、区域换色或多装备替换，因此 T05/T07/T09 的完整验收不能标为全部完成。
- 不修改或自动发布原有 proposal 网站，不变更其 GitHub Pages 工作流。
