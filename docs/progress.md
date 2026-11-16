# Progress Log

Newest entries on top. One short entry per work session: what changed, what broke, what's next.
These notes feed directly into the milestone and final reports.

---

## 2026-11-15 · T14 Our own Linear Blend Skinning shader & CPU reference (M3)
- Renamed `mecha-right-arm.glb` / `.blend` to `gundam-rigged.glb` / `.blend` across the repository and updated all references.
- Implemented our own Linear Blend Skinning (`src/mecha/lbs.ts`) on plain `THREE.Mesh` objects using a custom `ShaderMaterial` (no `SkinnedMesh`, `Skeleton.update()`, or Three.js skinning shader chunks on the `"lbs"` or `"rigid"` paths) and added a 3-way toggle (**Three.js skinning / our LBS / rigid parts**) in the Inspect panel.
- **LBS Equation & CPU vs. GPU split:**
  - **CPU (per frame):** Our hierarchical FK computes each joint's world transform $W_j$. For each mesh part $m$ (with primary joint bind origin $\mathbf{o}_m$ and precomputed relative inverse bind matrices $\widetilde{B}_{m, j}^{-1} = B_j^{-1} T(\mathbf{o}_m)$), the CPU computes $M_{m, j} = W_{\text{root}}^{-1} W_j \widetilde{B}_{m, j}^{-1}$ and uploads the 15 matrices as `uniform mat4 uBoneMatrices[15]` (`Float32Array(15 * 16)`).
  - **GPU (vertex & fragment shaders):** The vertex shader reads per-vertex `skinIndex` and `skinWeight` attributes and evaluates $\mathbf{p}' = \sum_{k=0}^{3} w_k (M_{m, j_k} (\mathbf{p} - \mathbf{o}_m))$ and $\mathbf{n}' = \mathrm{normalize}\big(\sum_{k=0}^{3} w_k (\mathrm{mat3}(M_{m, j_k}) \mathbf{n})\big)$ (or $\mathbf{p}_{\text{rigid}}' = M_{m, \text{primary}(m)} (\mathbf{p} - \mathbf{o}_m)$ in `rigid parts` mode). The fragment shader samples the original 2K base-color texture (or part debug color) with key/fill directional + hemisphere lighting.
- **CPU LBS Reference & Evaluation (`docs/results/t14-evaluation.md`):** Implemented `LbsManager.cpuPosition` matching the shader math to recompute per-pose browser seam gaps ($4.47 \times 10^{-8}\text{ m}$ to $9.54 \times 10^{-8}\text{ m}$ across the 9 test poses, vs. $103\text{–}236\text{ mm}$ cracks in `rigid parts` mode) and per-vertex differences against Three.js skinning ($1.05 \times 10^{-8}\text{ m}$ to $7.12 \times 10^{-8}\text{ m}$ max diff across 11,694 skinned vertices). Saved shoulder/elbow comparison screenshots (`docs/results/t14-*.png`).
- **Known issues:** Linear Blend Skinning can exhibit slight volume loss ("candy-wrapper" effect) under extreme twisting; dual quaternion skinning is an optional comparison (M9).

## 2026-11-15 · T13 Full-body rig, FK, and joint limits (M1, M2)
- Generalized `scripts/prepare_mecha.py` from the right arm to a 15-joint full-body hierarchy rooted at `pelvis` (`pelvis` → `torso` → `head`, bilateral `shoulder` → `elbow` → `wrist` + hand sockets, and bilateral `hip` → `knee` → `ankle`) across 17 connected-component-cleaned mesh parts preserving all 9,944 original triangles.
- Computed shared vertex weights on the original vertex indices (`0..4912`) with narrow 2-ring joint blend bands and rigid armor interiors; all 9 full-body test poses pass the seam check across 367 shared boundary groups (max separation $\le 0.000249\text{ mm}$ in Blender and $0.000046\text{ mm}$ in WebGL, well under the $10^{-5}\text{ m}$ threshold).
- Added per-joint rotation limits in `src/mecha/rigConfig.ts` (including one-way knee `[0, 75]` and elbow `[0, 90]` limits), FK clamping and automatic pelvis vertical grounding in `src/animation/animator.ts` so both feet remain planted on the platform (`y = 0`), and grouped sliders for all 15 joints + 9 test-pose presets + "Reset pose" in `src/ui/desktopPanel.ts`.
- Saved evaluation table and front/side pose gallery screenshots in `docs/results/t13-evaluation.md` and `docs/results/pose-gallery-*.png`.
- **Known issues / limitations:** Two-ring joint transition bands stretch slightly near extreme joint limits; waist skirt armor and shoulder pauldrons can self-intersect limbs past $\sim 35^\circ$; foot grounding uses vertical pelvis compensation (analytic two-bone IK is T16).

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
