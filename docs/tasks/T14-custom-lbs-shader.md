# T14 · Our own Linear Blend Skinning (method M3)

**Goal:** stop relying on Three.js `SkinnedMesh` for skinning; implement LBS ourselves so we can explain and evaluate it.

## To do
- Load the GLB, read per-vertex `skinIndex` / `skinWeight` and the inverse bind matrices
- Each frame: compute `boneMatrix_j = jointWorld_j · inverseBind_j` on the CPU (our FK), upload as a uniform array or data texture
- Custom `ShaderMaterial` vertex shader: `p' = Σ_j w_j · boneMatrix_j · p` (same for normals, with renormalization); fragment shader keeps the original texture and basic lighting
- Toggle in the Debug panel: **Three.js skinning / our LBS / rigid parts (no blending)**
- Do not use `SkinnedMesh`, `Skeleton.update` or Three.js skinning shader chunks for the "our LBS" path

## Evaluation output
- Max / mean per-vertex position difference between our LBS and Three.js skinning over the T13 test poses (expected ≈ 0, report the number)
- Side-by-side images at elbow and shoulder: rigid parts vs LBS
- Frame time of both paths

## Acceptance criteria
- [ ] Our LBS path renders the same pose as Three.js skinning (difference within floating-point error)
- [ ] Toggle works at runtime with no console errors
- [ ] Short write-up in `docs/progress.md`: equation, what runs on CPU vs GPU
