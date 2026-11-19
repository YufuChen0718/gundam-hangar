# Rigid Armor Hard-Surface Rig Evaluation (`docs/results/rigid-*`)

**Date:** 2026-11-18 (Updated with Planar Knee Bisection, Satin Gunmetal Knee Inner Frame & `55°` Knee Limit)  
**Asset:** `public/assets/models/gundam-sentinel.glb` (`30,518` outer armor triangles across `19` rigid parts after planar knee bisection, `1,644` inner-frame boundary cap triangles across `68` closed loops, `15` inner-frame joint fillers, `15` primary joints + `4` hip-driven secondary skirt joints).  
**Default Render Path:** `"Rigid armor (default)"` uses our existing custom LBS vertex shader (`src/mecha/lbs.ts`, `MAX_BONES = 24`) with per-vertex single-bone weight `1.0` (`skinIndex = [primaryBone, 0, 0, 0]`, `skinWeight = [1, 0, 0, 0]`) — no separate shader required. `"Smooth LBS"` (2-ring shared weights) and `"Three.js"` (`SkinnedMesh`) remain available in the 3-way toggle for direct comparison.

---

## 1. Cut Loops, Planar Knee Bisection & Refined Mechanical Pivots

- **Body & Skirt Joints:** Refined in `scripts/prepare_mecha.py` using a dual-graph **Dinic minimum $s$–$t$ cut** weighted by edge length and signed dihedral angle ($12\times$ lower cut cost on deep concave grooves $\theta_e < -0.35\text{ rad}$, $4\times$ lower on mild creases $\theta_e < -0.12\text{ rad}$, penalized on flat/convex plates), followed by connected-component cleanup.
- **Planar Knee Bisection:** Bisected both left and right knee regions (`x < -0.04` and `x > +0.04`, $z \in [-0.32, -0.05]$) with a single clean slanted plane $z = -0.158 - 0.52\, y$ (unit normal `(0.0, 0.4614, 0.8872)`) via `bmesh.ops.bisect_plane` + triangulation + `remove_doubles(dist=2e-4)` (`+519` triangles, `29,999 -> 30,518`). This eliminates the coarse-edge sawtooth rim, cuts perimeter in half (`1.609 m -> 0.745 m` left, `1.256 m -> 0.738 m` right), and keeps the entire pointy white kneecap plate and circular knee hinge disc intact on the shin so the kneecap slides in front of the thigh when bending.

| Joint / Boundary | Mechanical Pivot (Blender $Z$-up, $-Y$ front) | Cut Location / Method | Cut Perimeter ($\text{m}$) |
| --- | --- | --- | ---: |
| **Neck (`head`)** | `(0.000, 0.025, 0.735)` | Concave min-cut in black neck column (`z ≈ 0.721`, `60.9%` concave) | `0.766` |
| **Waist (`torso`)** | `(0.000, 0.010, 0.345)` | Concave min-cut at narrow red abdomen rim (`z ≈ 0.318–0.334`, `60.0%` concave) | `1.999` |
| **Right / Left Shoulder** | `(∓0.255, 0.045, 0.655)` | Concave min-cut between blue chest & pauldron (`x ≈ ∓0.190`, `100.0% / 96.9%` concave; `SSEF` decal untouched) | `0.440 / 0.469` |
| **Right / Left Elbow** | `(∓0.355, 0.055, 0.415)` ($X$-axis) | Concave min-cut in black corrugated ring (`z ≈ 0.441–0.458`, `100.0%` concave) | `0.278 / 0.322` |
| **Right / Left Wrist** | `(∓0.375, -0.038, 0.135)` | Concave min-cut at cuff-to-fist groove (`z ≈ 0.133`, `84.2% / 97.1%` concave) | `0.336 / 0.463` |
| **Front R/L Skirts** | `(∓0.120, -0.140, 0.312)` (top hinge) | Concave min-cut around yellow-plated front skirts (`81.5% / 88.9%` concave) | `0.660 / 0.515` |
| **Side R/L Skirts** | `(∓0.195, 0.005, 0.310)` (top inner hinge) | Concave min-cut at outer hip flare grooves (`43.9% / 36.4%` concave) | `1.799 / 1.561` |
| **Right / Left Hip** | `(∓0.145, 0.015, 0.135)` | Concave min-cut in black hip cavity below skirt overhang (`75.0% / 63.6%` concave) | `0.956 / 0.906` |
| **Right / Left Knee** | `(∓0.205, 0.014, -0.212)` ($X$-axis, limit **`[0°, 55°]`**) | **Exact planar bisection** $z = -0.158 - 0.52\,y$ (`84 / 93` coplanar edges; straight rim, kneecap + disc intact on shin) | **`0.738 / 0.745`** |
| **Right / Left Ankle** | `(∓0.320, 0.015, -0.760)` ($X$-axis) | Concave min-cut in black ankle opening (`z ≈ -0.745`, `86.0% / 77.8%` concave) | `1.053 / 1.250` |

- **Boundary Capping:** All `68` open boundary loops across the `19` rigid armor parts are closed with outward-oriented centroid triangle fans (`1,644` triangles total). Knee cut caps (`rightThigh_cap`, `leftThigh_cap`, `rightShin_cap`, `leftShin_cap`) and knee fillers use lighter satin gunmetal `KneeFrameMaterial` (`Base Color = (0.20, 0.23, 0.27)`, `Metallic = 0.45`, `Roughness = 0.58`); other joints use matte gunmetal `InnerFrameMaterial` (`Base Color = (0.06, 0.07, 0.09)`, `Metallic = 0.35`, `Roughness = 0.72`).

---

## 2. Inner-Frame Joint Fillers, Knee Limit & Secondary Skirt FK

### Joint Fillers (Parented to Parent Joint)

| Filler Object | Parent Joint | Shape & Axis | Center (Blender $Z$-up) | Radius ($\text{m}$) | Length / Depth ($\text{m}$) | Material |
| --- | --- | --- | --- | ---: | ---: | --- |
| `filler_torso` | `pelvis` | Cylinder ($Z$) | `(0.000, -0.005, 0.332)` | `0.078` | `0.092` | `InnerFrameMaterial` |
| `filler_head` | `torso` | Cylinder ($Z$) | `(0.000, 0.025, 0.728)` | `0.046` | `0.068` | `InnerFrameMaterial` |
| `filler_rightShoulder` / `leftShoulder` | `torso` | Sphere | `(∓0.228, 0.045, 0.642)` | `0.072` | — | `InnerFrameMaterial` |
| `filler_rightElbow` / `leftElbow` | `rightShoulder` / `leftShoulder` | Cylinder ($X$) | `(∓0.348, 0.055, 0.428)` | `0.046` | `0.088` | `InnerFrameMaterial` |
| `filler_rightWrist` / `leftWrist` | `rightElbow` / `leftElbow` | Sphere | `(∓0.375, -0.038, 0.134)` | `0.036` | — | `InnerFrameMaterial` |
| `filler_rightHip` / `leftHip` | `pelvis` | Sphere | `(∓0.145, 0.010, 0.135)` | `0.076` | — | `InnerFrameMaterial` |
| `filler_pelvisCore` | `pelvis` | Cylinder ($Z$) | `(0.000, 0.005, 0.215)` | `0.122` | `0.185` | `InnerFrameMaterial` |
| **`filler_rightKnee` / `leftKnee`** | `rightHip` / `leftHip` | Cylinder ($X$) | **`(∓0.200, 0.012, -0.194)`** | **`0.062`** | **`0.118`** | **`KneeFrameMaterial`** (lighter satin gunmetal) |
| `filler_rightAnkle` / `leftAnkle` | `rightKnee` / `leftKnee` | Cylinder ($X$) | `(∓0.320, 0.010, -0.752)` | `0.058` | `0.118` | `InnerFrameMaterial` |

### Knee Joint Limit & Re-Tuned Poses / Clips
- Lowered `JOINT_LIMITS.rightKnee` and `JOINT_LIMITS.leftKnee` from `[0°, 75°]` to **`[0°, 55°]`** so the planar thigh rim and kneecap stay tightly coupled around the gunmetal knee cylinder across the full legal range.
- Re-tuned poses and clips within the `55°` limit while preserving symmetric `hip : knee : ankle = 1 : 2 : 1` floor grounding:
  - `crouch`: `hip = 20°, knee = 40°, ankle = 20°`
  - `deepCrouchAim`: `hip = 27°, knee = 54°, ankle = 27°`
  - `maxArticulation`: `hip = 27°, knee = 54°, ankle = 27°`
  - `swingClip` strike peak (`t = 0.85 s`): `hip = 26°, knee = 52°, ankle = 26°`

### Secondary Skirt Armor FK (`src/animation/animator.ts`, `SKIRT_FK_CONFIG`)
- **Front skirts (`frontRightSkirt`, `frontLeftSkirt`):** $\theta_{\text{front}} = \operatorname{clamp}(0.5 \cdot \theta_{\text{hip}},\ 0^\circ,\ 40^\circ)$ around local $-X$.
- **Side skirts (`sideRightSkirt`, `sideLeftSkirt`):** $\theta_{\text{side}} = \operatorname{clamp}(0.3 \cdot \theta_{\text{hip}},\ 0^\circ,\ 25^\circ)$ around local $\mp Z$.

---

## 3. Evaluation — Per-Triangle Edge-Length Strain $|l' - l| / l$ (Rigid vs. Smooth LBS)

Evaluated across all `30,518` outer armor triangles over all 9 test poses (`docs/results/rigid-browser-validation.json`):

| Pose | Rigid Max Strain | Rigid Mean Strain | Smooth LBS Max Strain | Smooth LBS Mean Strain | LBS Tris $>1\%$ Strain | Driven Skirt Angles (Front / Side) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `bind` | `0.00e+0` | `0.00e+0` | `8.26e-5` | `1.29e-7` | `0` | `0.0° / 0.0°` |
| `rightArmAim` | `2.42e-8` | `1.57e-9` | `9.581` | `0.00354` (`0.35%`) | `630` | `0.0° / 0.0°` |
| `leftArmGuard` | `2.77e-8` | `1.81e-9` | `8.304` | `0.00565` (`0.56%`) | `582` | `0.0° / 0.0°` |
| `dualArmReady` | `2.77e-8` | `2.93e-9` | `14.329` | `0.01094` (`1.09%`) | `1,241` | `0.0° / 0.0°` |
| `torsoTwist` | `3.15e-8` | `9.30e-9` | `7.417` | `0.01262` (`1.26%`) | `1,684` | `0.0° / 0.0°` |
| `crouch` | `3.02e-8` | `2.99e-9` | `189.412` | `0.06389` (`6.39%`) | `3,716` | `10.0° / 6.0°` |
| `deepCrouchAim` | `3.47e-8` | `5.55e-9` | `251.470` | `0.09403` (`9.40%`) | `4,870` | `13.5° / 8.1°` |
| `fullBodyTwistCrouch` | `3.12e-8` | `9.38e-9` | `171.118` | `0.06845` (`6.85%`) | `4,815` | `9.0° / 5.4°` |
| `maxArticulation` | `3.38e-8` | `1.52e-8` | `251.470` | `0.10228` (`10.23%`) | `4,946` | `13.5° / 8.1°` |

- **Rigid armor strain is $\le 3.47 \times 10^{-8}$ (float32 rounding precision, effectively `0`)** across all 9 poses.
- **Strain Heat-Map Screenshots:**
  - `docs/results/rigid-strain-heatmap-torsoTwist.png`
  - `docs/results/rigid-strain-heatmap-maxArticulation.png`
  - `docs/results/rigid-strain-heatmap-rigid-maxArticulation.png`

---

## 4. Evaluation — 6-View Visible-Gap Silhouette Check (`rigid <= lbs` on ALL 9/9 Poses)

Rendered each of the 9 test poses from 6 views (`front`, `back`, `right`, `left`, `frontRight34`, `frontLeft34` at `512×512`, stage hidden, solid `#ff00ff` background) and counted interior background pixels enclosed inside the silhouette via 4-connected border flood-fill:

| Pose | Rigid (Caps + Fillers) Total Hole px | Rigid (No Caps/Fillers) Total Hole px | Smooth LBS (Watertight Ref) Total Hole px | Rigid $\le$ LBS? | Pixels Sealed by Caps + Fillers | Rigid Per-View (`front / back / right / left / 34R / 34L`) |
| --- | ---: | ---: | ---: | :---: | ---: | --- |
| `bind` | **`746`** | `794` | `794` | ✅ (`-48`) | `48` | `24 / 24 / 3 / 5 / 330 / 360` |
| `rightArmAim` | **`404`** | `438` | `440` | ✅ (`-36`) | `34` | `15 / 16 / 1 / 5 / 9 / 358` |
| `leftArmGuard` | **`375`** | `408` | `408` | ✅ (`-33`) | `33` | `22 / 15 / 3 / 1 / 330 / 4` |
| `dualArmReady` | **`39`** | `59` | `61` | ✅ (`-22`) | `20` | `19 / 7 / 1 / 1 / 9 / 2` |
| `torsoTwist` | **`590`** | `663` | `634` | ✅ (`-44`) | `73` | `4 / 523 / 16 / 1 / 0 / 46` |
| `crouch` | **`62`** | `164` | `73` | ✅ (`-11`) | `102` | `14 / 1 / 0 / 12 / 12 / 23` |
| `deepCrouchAim` | **`133`** | `324` | `164` | ✅ (`-31`) | `191` | `60 / 64 / 3 / 0 / 0 / 6` |
| `fullBodyTwistCrouch` | **`922`** | `1,057` | `924` | ✅ (`-2`) | `135` | `1 / 28 / 235 / 45 / 613 / 0` |
| `maxArticulation` | **`1,391`** | `1,616` | `1,422` | ✅ (`-31`) | `225` | `340 / 0 / 292 / 711 / 11 / 37` |

---

## 5. Before/After Close-Ups, Equipment Attachment & Grounding

- **Same-Camera Close-Ups (Smooth LBS vs. Rigid Armor):**
  - Knee bend at **`45°`**: `docs/results/rigid-compare-knee-45-lbs.png` vs. `docs/results/rigid-compare-knee-45-rigid.png`
  - Knee bend at **max limit (`55°`)**: `docs/results/rigid-compare-knee-lbs.png` vs. `docs/results/rigid-compare-knee-rigid.png`
  - Shoulder decal (`SSEF`): `docs/results/rigid-compare-shoulder-lbs.png` vs. `docs/results/rigid-compare-shoulder-rigid.png`
  - Front skirt: `docs/results/rigid-compare-skirt-lbs.png` vs. `docs/results/rigid-compare-skirt-rigid.png`
  - Waist twist: `docs/results/rigid-compare-waist-lbs.png` vs. `docs/results/rigid-compare-waist-rigid.png`
- **Equipment Attachment & Grounding:**
  - M6 attachment errors across all 9 test poses and during `aim` / `swing` (`docs/results/rigid-action-aim.png`, `docs/results/rigid-action-swing.png`): $\le 4.78 \times 10^{-16}\text{ m}$.
  - Supporting feet remain grounded (`< 1 mm`) across all 9 test poses; median frame time `16.7 ms` (`17.5 ms` p95).
- **Remaining Limitations:** Rear skirts remain fixed to `pelvis` (only front and side skirts have secondary FK hinges).
