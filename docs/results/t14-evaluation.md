# T14 Evaluation — Custom Linear Blend Skinning Shader & CPU Reference (Method M3)

## 1. Method Overview (Equation & CPU vs. GPU Split)

- **Asset:** `public/assets/models/gundam-rigged.glb` (15 joints rooted at `pelvis`, 16 skinned body/shield parts with 11,694 total vertices across parts, 367 shared boundary vertex groups, plus 1 socket-attached `rifle` mesh).
- **Per-part local bind origin:** Each skinned part $m$ expresses its vertex coordinates relative to its primary joint's bind-pose world position $o_m$, with per-part relative inverse bind matrices $\widetilde{B}_{m, j}^{-1} = B_j^{-1} T(o_m)$ precomputed once at load time from the GLB `inverseBindMatrices` accessor.
- **What runs on the CPU (each frame in `LbsManager.updateBoneMatrices`):**
  1. Hierarchical forward kinematics updates each joint's world transform $W_j$ (`bones[j].matrixWorld`).
  2. For each part $m$ and joint $j \in \{0, \dots, 14\}$, the CPU computes the $4 \times 4$ skinning matrix in `displayRoot` space:
     $$M_{m, j} = W_{\text{root}}^{-1} \, W_j \, \widetilde{B}_{m, j}^{-1}$$
     and packs all 15 matrices into a `Float32Array(15 * 16)` uploaded to `uniform mat4 uBoneMatrices[15]`. No `THREE.SkinnedMesh` or `Skeleton.update()` is used on the `"lbs"` or `"rigid"` paths.
- **What runs on the GPU (custom `ShaderMaterial` vertex & fragment shaders in `src/mecha/lbs.ts`):**
  - **Our LBS mode (`uRigidMode == 0`):** Reads `attribute vec4 skinIndex` and `attribute vec4 skinWeight` on a plain `THREE.Mesh` and evaluates:
    $$\mathbf{p}' = \sum_{k=0}^{3} w_k \, \big(M_{m, j_k} (\mathbf{p} - \mathbf{o}_m)\big), \qquad \mathbf{n}' = \frac{\sum_{k=0}^{3} w_k \, \big(\mathrm{mat3}(M_{m, j_k}) \, \mathbf{n}\big)}{\left\|\sum_{k=0}^{3} w_k \, \big(\mathrm{mat3}(M_{m, j_k}) \, \mathbf{n}\big)\right\|}$$
  - **Rigid parts mode (`uRigidMode == 1`):** Uses only part $m$'s primary joint matrix $M_{m, \text{primary}(m)}$ with weight $1.0$:
    $$\mathbf{p}_{\text{rigid}}' = M_{m, \text{primary}(m)} (\mathbf{p} - \mathbf{o}_m)$$
  - **Fragment shader:** Samples the original 2K base-color texture (`uMap`) or debug part color (`uPartColor`), evaluates directional key/fill + hemisphere lighting, and applies ACES Filmic tone mapping.
- **CPU Reference (`LbsManager.cpuPosition`):** Executes the exact same equation using the `Float32Array` `uBoneMatrices` uniform array on the CPU to (a) recompute the browser seam gap per pose across all 367 shared boundary groups and (b) compare our LBS against Three.js `SkinnedMesh` per vertex across all 11,694 skinned part vertices.

---

## 2. Per-Pose Seam Gap & Our LBS vs. Three.js Skinning Comparison (All 9 Test Poses)

Measured in headless Chrome (`docs/results/browser-validation.json`) across all 367 shared boundary groups and 11,694 skinned vertices:

| # | Pose ID | Our LBS Max Seam Gap (m / mm) | Our LBS Mean Seam Gap (m / mm) | Rigid Parts Max Seam Crack (m / mm) | Our LBS vs. Three.js Max Vertex Diff (m / mm) | Our LBS vs. Three.js Mean Vertex Diff (m / mm) |
|---|---------|-------------------------------|--------------------------------|-------------------------------------|-----------------------------------------------|------------------------------------------------|
| 1 | `bind` | `4.4733e-8 m` (`0.000045 mm`) | `1.9788e-9 m` (`0.000002 mm`) | `4.4733e-8 m` (`0.000045 mm`) | `1.0537e-8 m` (`0.000011 mm`) | `3.7300e-9 m` (`0.000004 mm`) |
| 2 | `rightArmAim` | `9.2909e-8 m` (`0.000093 mm`) | `6.9369e-9 m` (`0.000007 mm`) | `1.0301e-1 m` (`103.01 mm`) | `5.9947e-8 m` (`0.000060 mm`) | `5.3715e-9 m` (`0.000005 mm`) |
| 3 | `leftArmGuard` | `9.0908e-8 m` (`0.000091 mm`) | `8.1810e-9 m` (`0.000008 mm`) | `1.5338e-1 m` (`153.38 mm`) | `5.8494e-8 m` (`0.000058 mm`) | `8.7292e-9 m` (`0.000009 mm`) |
| 4 | `dualArmReady` | `6.8698e-8 m` (`0.000069 mm`) | `8.9501e-9 m` (`0.000009 mm`) | `1.7445e-1 m` (`174.45 mm`) | `5.6408e-8 m` (`0.000056 mm`) | `8.1935e-9 m` (`0.000008 mm`) |
| 5 | `torsoTwist` | `5.9396e-8 m` (`0.000059 mm`) | `1.2577e-8 m` (`0.000013 mm`) | `1.3336e-1 m` (`133.36 mm`) | `7.1238e-8 m` (`0.000071 mm`) | `1.1768e-8 m` (`0.000012 mm`) |
| 6 | `crouch` | `7.8295e-8 m` (`0.000078 mm`) | `1.3308e-8 m` (`0.000013 mm`) | `1.5014e-1 m` (`150.14 mm`) | `5.6500e-8 m` (`0.000056 mm`) | `1.4849e-8 m` (`0.000015 mm`) |
| 7 | `deepCrouchAim` | `8.4131e-8 m` (`0.000084 mm`) | `1.5517e-8 m` (`0.000016 mm`) | `2.1239e-1 m` (`212.39 mm`) | `5.5921e-8 m` (`0.000056 mm`) | `2.6948e-8 m` (`0.000027 mm`) |
| 8 | `fullBodyTwistCrouch` | `9.5443e-8 m` (`0.000095 mm`) | `1.6343e-8 m` (`0.000016 mm`) | `1.3612e-1 m` (`136.12 mm`) | `5.9315e-8 m` (`0.000059 mm`) | `1.7946e-8 m` (`0.000018 mm`) |
| 9 | `maxArticulation` | `7.4296e-8 m` (`0.000074 mm`) | `1.7276e-8 m` (`0.000017 mm`) | `2.3552e-1 m` (`235.52 mm`) | `5.9843e-8 m` (`0.000060 mm`) | `2.8304e-8 m` (`0.000028 mm`) |

- **Peak per-vertex difference (our LBS vs. Three.js `SkinnedMesh`) across all 9 poses:** $7.1238 \times 10^{-8}\text{ m}$ ($0.000071\text{ mm}$), well within 32-bit IEEE 754 floating-point uniform rounding error.
- **Peak seam gap (our LBS) across all 9 poses:** $9.5443 \times 10^{-8}\text{ m}$ ($0.000095\text{ mm} \ll 10^{-5}\text{ m}$), whereas disabling shared-weight blending (`rigid parts` mode) opens cracks of $103.0\text{ mm}$ to $235.5\text{ mm}$ at the joints.

---

## 3. Frame Time Comparison

Measured over 85 consecutive `requestAnimationFrame` steps in `deepCrouchAim` pose at $1440 \times 1000$ in headless Chromium (`docs/results/browser-validation.json`):

| Skinning Mode | Mean Frame Time (ms) | Median Frame Time (ms) | p95 Frame Time (ms) |
|---------------|----------------------|------------------------|---------------------|
| `Three.js skinning` (`SkinnedMesh`) | `16.665 ms` | `16.700 ms` | `17.800 ms` |
| `our LBS` (custom `ShaderMaterial` on `THREE.Mesh`) | `16.665 ms` | `16.700 ms` | `18.000 ms` |
| `rigid parts` (single-bone `ShaderMaterial`) | `16.674 ms` | `16.600 ms` | `18.100 ms` |

All three paths stay locked at the 60 Hz (`16.67 ms`) vsync budget.

---

## 4. Close-Up Comparison Screenshots (Right Elbow & Right Knee)

Saved in `docs/results/`:
- **Right Elbow (`rightShoulder: 25°, rightElbow: 88°`, original texture):**
  - Rigid parts (no blending — visible seam crack): `docs/results/t14-elbow-rigid.png`
  - Our LBS (shared-weight blending): `docs/results/t14-elbow-lbs.png`
- **Right Knee (`rightHip: 20°, rightKnee: 75°, rightAnkle: 20°`, original texture):**
  - Rigid parts (no blending — visible seam crack): `docs/results/t14-knee-rigid.png`
  - Our LBS (shared-weight blending): `docs/results/t14-knee-lbs.png`
