# T02 · Scene basics

**Goal:** a clean "hangar" scene where the model can be inspected.

## To do (`src/scene/createScene.ts`)
- WebGLRenderer (antialias, shadows, tone mapping), PerspectiveCamera
- OrbitControls: rotate, zoom, distance and pitch limits, target at the mecha's chest height (about y = 1.2 m)
- Lights: one hemisphere fill + one shadow-casting directional key light (+ optional rim light)
- Display platform (cylinder) + floor; dark background
- Resize with the **container** (ResizeObserver), not the window
- `main.ts` uses `renderer.setAnimationLoop` as the only render loop and puts a placeholder cube in the scene

## Acceptance criteria
- [ ] Mouse drag rotates, scroll zooms, view cannot go below the floor
- [ ] Resizing the window gives no distortion or blurriness
- [ ] Shadows visible on the platform
