# Instructions for AI coding agents (dsh, Antigravity, etc.)

You are helping a 4-person CS184 team build **Mecha Hangar**. Read these files before writing any code:

1. `docs/ARCHITECTURE.md`: module layout, interfaces, coordinate conventions (**binding**)
2. The task card you were given in `docs/tasks/`: scope and acceptance criteria
3. `docs/PLAN.md`: only if you need context on priorities

## Rules

- **Do exactly one task card per session.** Do not implement features from other cards, even if they look easy.
- **Respect module boundaries** in ARCHITECTURE.md. UI code only calls `commands`; animation code only uses program joint names; never rotate joints to move the whole model (use `displayRoot`).
- **Stack is fixed:** Vite + TypeScript (strict) + Three.js, plain HTML/CSS UI. Do not add frameworks (React, Vue, Tailwind, physics engines, animation libraries) without the team asking.
- **We implement the graphics logic ourselves.** Three.js may be used for rendering, scene graph, math primitives (`Quaternion`, `Matrix4`, `slerp`), `GLTFLoader`, `OrbitControls`. Do **not** use `THREE.AnimationMixer` / `AnimationClip` / `KeyframeTrack` for our animation system: keyframe sampling, easing, the state machine, and blending are graded course work.
- **Keep `main` runnable.** Before finishing: `npm run build` must pass with no type errors, and the app must open with no console errors.
- **Check acceptance criteria** in the task card one by one and report which pass.
- **Log your work:** append a short entry to `docs/progress.md` (date, task id, what changed, known issues).
- **Attribution:** if you copy or adapt code from a tutorial, example, or any external source, add it to `docs/asset-sources.md`.
- **Commits:** small, with message prefix by area (`asset:`, `anim:`, `equip:`, `ui:`, `xr:`, `web:`, `docs:`, `fix:`). Do not commit `node_modules/`, `dist/`, or large binaries outside `public/assets/` and `assets-src/`.
- **Ask instead of guessing** when the task card conflicts with ARCHITECTURE.md or the existing code.
