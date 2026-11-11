# Architecture & Conventions

> This is the **target design**, not existing code. Every task card implements one part of it. If you need to deviate, update this file first and tell the team in the group chat.

## 1. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Build | Vite + TypeScript (strict) | `npm run dev` / `npm run build` |
| 3D | Three.js (WebGL) | rendering, scene graph, math, GLTFLoader, OrbitControls |
| Models | Blender → GLB | stored in `public/assets/models/` |
| UI | Plain HTML + CSS | no framework needed |
| Deploy | GitHub Pages (via GitHub Actions) | website + live demo |
| Vision Pro | Phase 2: open the same page in Safari; aspirational: WKWebView shell / WebXR | |

## 2. Data flow

```
Desktop UI (HTML tabs)            [Phase 2] Vision Pro UI
          │                                  │
          └──────── commands (shared ops) ───┘
                          │
               Store (single shared state)
                          │
     ┌───────────────┬────┴─────────┬──────────────┐
  Rig / sockets    Equipment       Appearance     Animator
     (mecha/)      (mecha/)        (mecha/)      (animation/)
                          │
              Three.js scene + one render loop
```

**Three hard rules:**
1. **UI only calls `commands`** and never touches the model directly. The future Vision Pro UI calls the same commands, so state never gets out of sync between the two.
2. **Animation code only uses program joint names** (`rightShoulder`, …). A real model's bone names are mapped in `rigConfig`.
3. **Exactly one render loop**, using `renderer.setAnimationLoop` (WebXR can reuse it later). Order per frame: input → animation update → render.

## 3. Target directory layout

```
src/
├── main.ts                 # wire modules together, start the render loop
├── style.css
├── scene/createScene.ts    # renderer, camera, lights, display platform, OrbitControls, resize
├── mecha/
│   ├── types.ts            # JointName, SocketName, RegionName, MechaRig
│   ├── proceduralMecha.ts  # box prototype implementing MechaRig (used before the real asset is ready)
│   ├── rigConfig.ts        # GLB bone names / sockets / material-region mapping
│   ├── loadMecha.ts        # load GLB -> MechaRig
│   ├── equipment.ts        # equipment definitions + EquipmentManager
│   └── appearance.ts       # color presets, per-region recoloring
├── animation/
│   ├── clips.ts            # keyframe data for idle / aim / swing
│   ├── samplePose.ts       # given a time: find keyframes -> easing -> slerp
│   └── animator.ts         # playback state machine + transition blending
├── app/
│   ├── state.ts            # Store: current colors, equipment, action, etc.
│   └── commands.ts         # the only operations a UI may call
├── ui/desktopPanel.ts      # Appearance / Equipment / Animation / Debug tabs
└── debug/diagnostics.ts    # frame-time stats, joint-angle recording, attachment error
public/assets/models/       # GLB files
public/assets/textures/
```

## 4. Key interfaces (described, not code)

**`MechaRig`**: what every other module needs to know about the mecha. The procedural prototype and the GLB model both provide it:
- `displayRoot`: outermost node; the whole model is rotated and scaled only here
- `joints: Record<JointName, Object3D>`, where `JointName` = `torso | head | rightShoulder | rightElbow | rightWrist | leftShoulder | leftElbow | leftWrist`
- `bindPose: Record<JointName, Quaternion>`: each joint's initial local rotation
- `sockets: Record<SocketName, Object3D>`, where `SocketName` = `rightHand | leftHand | back`
- `regions: Record<RegionName, MeshStandardMaterial>`, where `RegionName` = `primary | secondary | accent | frame`

**`EquipmentDef`**: `id`, `label`, `slot` (which socket), `offset` (position / rotation / scale = M<sub>equipment</sub><sup>socket</sup>), plus a model path or build function.

**`Clip` / `Keyframe`**: `Clip { name, duration, loop, keys[], next? }`; `Keyframe { t, pose: { joint: [x,y,z] degrees, relative to bind pose }, ease? }`.

**`Animator`**: `play(action)`, `update(dt)`, `transitionMode: 'blend' | 'cut'`, `transitionDuration`. States: playing / transitioning / holding.

**`HangarState`**: `preset`, `colors`, `rightHand` (equipment id or null), `backpack`, `action`, `transitionMode`, `modelYawDeg`. Kept as plain JSON so it can be saved later.

**`commands`**: `setColorPreset`, `setRegionColor`, `equipWeapon`, `setBackpackVisible`, `playAction`, `setTransitionMode`, `rotateModel`, `resetModelTransform`.

## 5. Coordinate and asset conventions

- Units are **meters**; **+Y up**; the mecha **faces +Z**; the mecha's right side = world −X
- Bind pose: arms hang naturally along −Y; animations store rotations **relative to the bind pose**; applied as `joint.quaternion = bindPose × offset`
- Hand socket: origin at the grip center, **+Z = the weapon's pointing direction**
- Equipment world transform: `M_equipment^world = M_joint^world · M_socket^joint · M_equipment^socket` (built as a scene-graph chain: joint → socket → offset node → model)
- Each armor region gets **its own material**. If a GLB shares one material across parts, clone it first; otherwise recoloring the chest also recolors the legs
- Exported GLBs: scale and orientation already applied, materials named by region, sensible bone names (record the mapping in `rigConfig`)
- Model size: aim for < 20 MB per model, triangle count tuned to performance test results

## 6. What we implement vs. what libraries provide (needed for the report)

| Library provides | We implement |
|---|---|
| WebGL rendering, scene graph, `Quaternion.slerp`, `Matrix4`, GLTFLoader, OrbitControls | rig abstraction and joint mapping, socket / equipment assembly and offsets, keyframe sampling and easing, animation state machine and transition blending, shared state / commands layer, UI, evaluation tools |
| Asset generation (Meshy etc.) | Blender cleanup, joint setup, material regions |
