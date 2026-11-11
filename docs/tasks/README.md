# Task cards

Each card = one independently completable unit of work, with acceptance criteria. To hand a card to dsh / Antigravity:

> Read `AGENTS.md`, `docs/ARCHITECTURE.md` and `docs/tasks/Txx-....md`, then complete only this task.

When you finish, check the box below and add a line to `docs/progress.md`.

| ID | Task | Suggested owner | Depends on | Target date | Status |
|---|---|---|---|---|---|
| [T00](T00-proposal-website.md) | Publish the proposal webpage (**due tonight**) | All | n/a | Nov 10 | ⬜ |
| [T01](T01-project-init.md) | Initialize the Vite + TS + Three.js project | D | n/a | Nov 11 | ⬜ |
| [T02](T02-scene.md) | Scene basics: camera, lights, platform, orbit view | D | T01 | Nov 12 | ⬜ |
| [T03](T03-procedural-rig.md) | Box prototype mecha + joints / sockets | B | T02 | Nov 13 | ⬜ |
| [T04](T04-equipment.md) | Equipment system: sockets, offsets, swapping | C | T03 | Nov 15 | ⬜ |
| [T05](T05-appearance.md) | Per-region coloring and presets | A | T03 | Nov 15 | ⬜ |
| [T06](T06-keyframe-sampling.md) | Keyframe sampling + idle animation | B | T03 | Nov 15 | ⬜ |
| [T07](T07-animator-transitions.md) | Animation state machine, transitions, aim / swing | B | T06 | Nov 19 | ⬜ |
| [T08](T08-state-commands-ui.md) | Shared state / commands + desktop control panel | D | T04 T05 T07 | Nov 19 | ⬜ |
| [T09](T09-real-asset.md) | Real mecha asset: Blender processing + GLB integration | A | T03 | Nov 20 | ⬜ |
| [T10](T10-deploy-pages.md) | GitHub Pages: website + demo auto-deploy | D | T01 | Nov 20 | ⬜ |
| [T11](T11-evaluation-tools.md) | Evaluation tools: frame time, joint curves, attachment error | D | T07 T08 | Nov 26 | ⬜ |
| [T12](T12-vision-pro.md) | Vision Pro Safari testing and interaction adaptation | C | T08 T10 | Nov 29 | ⬜ |

Aspirational (only after the core is stable, starting Week 3): visionOS WKWebView shell, WebXR immersive mode, drag-and-snap assembly. Write separate cards for these when the time comes.
