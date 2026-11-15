# Progress Log

Newest entries on top. One short entry per work session: what changed, what broke, what's next.
These notes feed directly into the milestone and final reports.

---

## 2026-11-14 · Desktop single-arm prototype and motion-seam fix
- Saved the implementation and original/processed assets into the actual repository; source-copy SHA-256 matches the user-provided model.
- Added the Vite/TypeScript/Three.js viewer, original/processed comparison, shoulder/elbow/wrist controls, weapon/shield visibility, debug views, and a custom six-second raise-arm animation with pause/seek/reset.
- Fixed user-reported shoulder/elbow cracks by replacing independent rigid face transforms with shared boundary skin weights and connected-component cleanup. The independent rifle remains attached to the hand socket.
- Validation: strict build passed, 8 animation tests passed, desktop/narrow browser checks passed with no console or HTTP errors. 90 shared boundary groups remained continuous across four poses (maximum browser separation approximately 0.000052 mm).
- **Limitations:** single arm only; extreme poses can deform or intersect; no armor-region recoloring, second weapon, full action state machine, formal performance benchmark, or Vision Pro integration yet.
- Guide: [DESKTOP-PROTOTYPE.md](DESKTOP-PROTOTYPE.md). Current snapshot: [PROGRESS-2026-11-14.md](PROGRESS-2026-11-14.md).

## 2026-11-13 · T01/T09 in progress — asset audit and static export
- Inspected the supplied Meshy .blend: 1 mesh, 4,913 vertices, 9,944 triangles, no armature/vertex groups/actions, 1 material, 4 packed 2K textures, and 2 connected components.
- Exported a static GLB and reviewed front/side/back Blender renders. Archived inspection data and renders in `docs/results/model-audit/`.
- Installed the Vite/TypeScript/Three.js toolchain in `/private/tmp/mecha-hangar-work`; application implementation has not yet been synced into the repository.
- **Not yet complete:** browser viewer, arm/weapon segmentation, pivots, animation, regional recoloring, build and browser validation. No FPS claim or task-card completion is made.
- **Next:** preserve a source copy, integrate the static viewer, and prepare one articulated arm with an attached weapon.
- Full dated snapshot: [PROGRESS-2026-11-13.md](PROGRESS-2026-11-13.md).

## 2026-11-10 · Project setup (Yufu)
- Created the repo; contents are planning only: PLAN, ARCHITECTURE, WORKFLOW, AGENTS.md, task cards T00–T12.
- Decided route: **desktop first, Vision Pro (windowed, via Safari) second**; immersive WebXR / visionOS app are aspirational.
- Implementation will be done task by task (team members + dsh / Antigravity).
- **Next:** T00 proposal webpage (due tonight 11:59 PM) → T01 project init.

## 2026-11-10 · T00 Proposal Webpage
- Created `website/index.html` and `website/style.css` with the revised desktop-first, Vision Pro Safari (windowed) baseline proposal and `@media print` rules for clean Safari PDF export.
- Populated all four team member names (Yufu Chen, Zihan Wang, Junxiang You, Dongyang Dai) and added clickable top-level links to the live GitHub Pages site and GitHub repository.
- Added `.github/workflows/pages.yml` to automatically deploy `website/` to GitHub Pages on push to `main` or manual dispatch.
- **Known issues:** None. Ready to push to `main` and export PDF via Safari `File → Print → Save as PDF`.
