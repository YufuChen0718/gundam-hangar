# Rigid Armor Hard-Surface Rig Evaluation (`docs/results/rigid-*`)

**Date:** 2026-11-18 (Updated with Planar Waist Bisection, Red Abdomen Overlap, Recessed Satin Gunmetal Caps, Elliptical Waist Filler, Rear Skirt FK & Global Sliver Cleanup)  
**Asset:** `public/assets/models/gundam-sentinel.glb` (`30,651` outer armor triangles across `21` rigid parts, `624` rigid-only textured abdomen overlap sleeve triangles, `2,304` recessed inner-frame boundary cap triangles across `63` closed loops, `15` inner-frame joint fillers, `15` primary joints + `6` hip-driven secondary skirt joints).  
**Default Render Path:** `"Rigid armor (default)"` uses our existing custom LBS vertex shader (`src/mecha/lbs.ts`, `MAX_BONES = 24`) with per-vertex single-bone weight `1.0` (`skinIndex = [primaryBone, 0, 0, 0]`, `skinWeight = [1, 0, 0, 0]`) — no separate shader required. `"Smooth LBS"` (2-ring shared weights) and `"Three.js"` (`SkinnedMesh`) remain available in the 3-way toggle for direct comparison.

---

## 1. Cut Loops, Planar Waist & Knee Bisection, and Refined Mechanical Pivots

- **Planar Waist Bisection:** Replaced the concave min-cut at the waist with a single horizontal bisect plane **`z = 0.331 m`** (unit normal `(0, 0, 1)`) placed inside the red abdomen just above the top rim of all white skirt plates (`bmesh.ops.bisect_plane` after pre-snapping waist-zone vertices within `4.0 mm` to `z = 0.331`, triangulate, `remove_doubles(dist=2e-4)`, and UV-seam-safe sliver cleanup in `0.300 < z < 0.375`). Every white skirt plate (front, side, rear) stays 100% below `z = 0.331` on `pelvis`/skirts, while the red abdomen and blue chest stay 100% on `torso` — no armor plate is split across the waist.
- **Red Abdomen Overlap (`chestPart_overlap`):** Extruded a rigid-only textured sleeve (`Material_0`, weight `1.0` to `torso`, excluded from Smooth LBS / Three.js comparison) **`1.6 cm` (`0.016 m`, `z = 0.331 -> 0.315 m`)** downward from the `84`-vertex (`78`-segment) bisected waist loop in 4 vertical rings (`4 mm` each, `3.5 mm` bottom radial inset, `624` triangles, `0` slivers with aspect `> 15`) with per-edge UV preservation so twisting exposes red abdomen armor inside the skirt ring rather than a cap or gap.
- **Planar Knee Bisection (Unchanged):** Both left and right knee regions (`x < -0.04` and `x > +0.04`, $z \in [-0.32, -0.05]$) use the exact slanted plane $z = -0.158 - 0.52\, y$ (unit normal `(0.0, 0.4614, 0.8872)`), keeping the pointy white kneecap plate and circular hinge disc intact on the shin.
- **Other Body & Skirt Joints:** Refined in `scripts/prepare_mecha.py` using a dual-graph **Dinic minimum $s$–$t$ cut** weighted by edge length and signed dihedral angle ($12\times$ lower cost on deep concave grooves $\theta_e < -0.35\text{ rad}$, $4\times$ lower on mild creases $\theta_e < -0.12\text{ rad}$, penalized on flat/convex plates), keeping shoulders, elbows, knees, and decals (`SSEF`) intact.

| Joint / Boundary | Mechanical Pivot (Blender $Z$-up, $-Y$ front) | Cut Location / Method | Cut Perimeter ($\text{m}$) |
| --- | --- | --- | ---: |
| **Neck (`head`)** | `(0.000, 0.025, 0.735)` | Concave min-cut in black neck column (`z ≈ 0.718`, `76.2%` concave) | `0.596` |
| **Waist (`torso`)** | **`(0.000, 0.004, 0.342)`** (limit **`[-40°, +40°]`**) | **Exact horizontal planar bisection** `z = 0.331 m` inside red abdomen above all skirts (`84` loop verts, **`1.6 cm`** downward red abdomen overlap) | **`0.916`** (waist + skirt contact rim) |
| **Right / Left Shoulder** | `(∓0.255, 0.045, 0.655)` | Concave min-cut between blue chest & pauldron (`94.6% / 96.9%` concave; `SSEF` decal untouched) | `0.468 / 0.469` |
| **Right / Left Elbow** | `(∓0.355, 0.055, 0.415)` ($X$-axis) | Concave min-cut in black corrugated ring (`100.0%` concave) | `0.278 / 0.322` |
| **Right / Left Wrist** | `(∓0.375, -0.038, 0.135)` | Concave min-cut at cuff-to-fist groove (`82.4% / 93.8%` concave) | `0.324 / 0.443` |
| **Front R/L Skirts** | `(∓0.120, -0.140, 0.312)` (top hinge) | Concave min-cut around front skirts (`60.0% / 86.2%` concave) | `0.878 / 0.669` |
| **Side R/L Skirts** | `(∓0.195, 0.005, 0.310)` (top inner hinge) | Concave min-cut at outer hip flare grooves | `1.077 / 1.216` |
| **Rear R/L Skirts** | **`(∓0.125, +0.115, 0.305)`** (top hinge) | Concave min-cut around rear skirts (`82.9% / 73.3%` concave) | `0.886 / 0.722` |
| **Right / Left Hip** | `(∓0.145, 0.015, 0.135)` | Concave min-cut in black hip cavity below skirt overhang (`60.6% / 57.1%` concave) | `0.811 / 0.916` |
| **Right / Left Knee** | `(∓0.205, 0.014, -0.212)` ($X$-axis, limit **`[0°, 55°]`**) | **Exact planar bisection** $z = -0.158 - 0.52\,y$ (`84 / 93` coplanar edges; kneecap intact on shin) | `0.738 / 0.745` |
| **Right / Left Ankle** | `(∓0.320, 0.015, -0.760)` ($X$-axis) | Concave min-cut in black ankle opening (`71.7% / 78.0%` concave) | `1.055 / 1.066` |

- **Recessed Boundary Capping:** All `63` open boundary loops across the `21` rigid armor parts are closed with outward-oriented two-ring / centroid triangle fans (`2,304` cap triangles total). Waist cut caps (`chestPart_cap` recessed **`+7 mm`** in `+Z` + `6 mm` radially inward; `waistPart_cap` recessed **`-7 mm`** in `-Z` + `6 mm` radially inward), all 6 skirt caps (recessed **`5 mm`** radially inward toward `(0, 0, z)`), and knee caps use satin gunmetal `KneeFrameMaterial` (`Base Color = (0.20, 0.23, 0.27)`, `Metallic = 0.45`, `Roughness = 0.58`); other joints use matte gunmetal `InnerFrameMaterial` (`Base Color = (0.06, 0.07, 0.09)`, `Metallic = 0.35`, `Roughness = 0.72`).

---

## 2. Inner-Frame Joint Fillers, Joint Limits & 6-Skirt Secondary FK

### Joint Fillers (Parented to Parent Joint)

| Filler Object | Parent Joint | Shape & Axis | Center (Blender $Z$-up) | Radius ($\text{m}$) | Length / Depth ($\text{m}$) | Material |
| --- | --- | --- | --- | ---: | ---: | --- |
| **`filler_torso`** | `pelvis` | **Elliptical cylinder ($Z$)** | **`(-0.00366, -0.01166, 0.263)`** | **`rx = 0.13675`, `ry = 0.09569`** (`95%` fitted to waist loop) | **`0.124`** (`z ∈ [0.201, 0.325]`) | **`KneeFrameMaterial`** (satin gunmetal) |
| **`filler_pelvisCore`** | `pelvis` | Cylinder ($Z$) | `(0.000, -0.013, 0.200)` | `0.140` | `0.215` | **`KneeFrameMaterial`** (satin gunmetal) |
| `filler_head` | `torso` | Cylinder ($Z$) | `(0.000, 0.025, 0.728)` | `0.046` | `0.068` | `InnerFrameMaterial` |
| `filler_rightShoulder` / `leftShoulder` | `torso` | Sphere | `(∓0.228, 0.045, 0.642)` | `0.072` | — | `InnerFrameMaterial` |
| `filler_rightElbow` / `leftElbow` | `rightShoulder` / `leftShoulder` | Cylinder ($X$) | `(∓0.348, 0.055, 0.428)` | `0.046` | `0.088` | `InnerFrameMaterial` |
| `filler_rightWrist` / `leftWrist` | `rightElbow` / `leftElbow` | Sphere | `(∓0.375, -0.038, 0.134)` | `0.036` | — | `InnerFrameMaterial` |
| `filler_rightHip` / `leftHip` | `pelvis` | Sphere | `(∓0.145, 0.010, 0.135)` | `0.076` | — | `InnerFrameMaterial` |
| `filler_rightKnee` / `leftKnee` | `rightHip` / `leftHip` | Cylinder ($X$) | `(∓0.200, 0.012, -0.194)` | `0.062` | `0.118` | `KneeFrameMaterial` |
| `filler_rightAnkle` / `leftAnkle` | `rightKnee` / `leftKnee` | Cylinder ($X$) | `(∓0.320, 0.010, -0.752)` | `0.058` | `0.118` | `InnerFrameMaterial` |

### Torso & Knee Joint Limits
- **Torso yaw (`JOINT_LIMITS.torso`):** Remains **`[-40°, +40°]`** — zero background hole pixels appear across all 6 close-up waist views at every `5°` step from `-40°` to `+40°`, and all existing poses/clips (`torsoTwist: +30°`, `fullBodyTwistCrouch: -30°`, `maxArticulation: +35°`, `swing: -28°/+32°`) stay cleanly within limits.
- **Knee flexion (`JOINT_LIMITS.rightKnee`, `JOINT_LIMITS.leftKnee`):** Unchanged at **`[0°, 55°]`** (`crouch: 40°`, `deepCrouchAim: 54°`, `maxArticulation: 54°`, `swing: 52°`).

### Secondary Skirt Armor FK (`src/animation/animator.ts`, `SKIRT_FK_CONFIG`)
- **Front skirts (`frontRightSkirt`, `frontLeftSkirt`):** $\theta_{\text{front}} = \operatorname{clamp}(0.5 \cdot \max(0, \theta_{\text{hip}}),\ 0^\circ,\ 40^\circ)$ around local $-X$ (forward swing on hip flexion).
- **Side skirts (`sideRightSkirt`, `sideLeftSkirt`):** $\theta_{\text{side}} = \operatorname{clamp}(0.3 \cdot \max(0, \theta_{\text{hip}}),\ 0^\circ,\ 25^\circ)$ around local $\mp Z$ (outward flare on hip flexion).
- **Rear skirts (`rearRightSkirt`, `rearLeftSkirt`):** $\theta_{\text{rear}} = \operatorname{clamp}(0.45 \cdot \max(0, -\theta_{\text{hip}}),\ 0^\circ,\ 30^\circ)$ around local $+X$ (backward swing on hip extension).

---

## 3. Global Sliver Cleanup — Reassigned Triangle Counts Per Part

After part splitting, a two-pass global cleanup ran across all `21` rigid parts (`scripts/prepare_mecha.py`):
- **Pass A (`< 50` tris / disconnected islands):** Reassigns any secondary connected component of `< 50` triangles (or disconnected island) to the neighboring part sharing the most edges with it.
- **Pass B (`centroid > 2 cm` outliers):** Reassigns boundary/ear/peninsula triangles with no interior vertex whose centroid is `> 2 cm` from their part's nearest interior vertex (guarded against crossing the exact waist/knee bisect planes).

| Part | Final Tris | Reassigned (`<50` tris / islands) | Reassigned (`centroid > 2 cm`) | Total Reassigned | Primary Target Part(s) |
| --- | ---: | ---: | ---: | ---: | --- |
| `waistPart` | `1,704` | `3` | `59` | **`62`** | `frontLeftSkirtPart` (12), `frontRightSkirtPart` (11), `sideRightSkirtPart` (11), `rearLeftSkirtPart` (11), `rightThigh` (9), `rearRightSkirtPart` (3), `sideLeftSkirtPart` (3), `leftThigh` (2) |
| `chestPart` | `4,280` | `40` | `3` | **`43`** | `headPart` (20), `rightUpperArm` (13), `leftUpperArm` (10) |
| `headPart` | `1,508` | `0` | `0` | **`0`** | — |
| `rightUpperArm` | `1,951` | `0` | `1` | **`1`** | `chestPart` (1) |
| `rightForearm` | `1,457` | `4` | `1` | **`5`** | `sideRightSkirtPart` (4), `rightPalm` (1) |
| `rightPalm` | `643` | `32` | `1` | **`33`** | `sideRightSkirtPart` (32), `rightForearm` (1) |
| `leftUpperArm` | `1,783` | `0` | `0` | **`0`** | — |
| `leftForearm` | `1,549` | `1` | `2` | **`3`** | `leftPalm` (2), `sideLeftSkirtPart` (1) |
| `leftPalm` | `710` | `7` | `0` | **`7`** | `sideLeftSkirtPart` (6), `leftThigh` (1) |
| `rightThigh` | `992` | `133` | `3` | **`136`** | `sideRightSkirtPart` (53), `rightShin` (35), `frontRightSkirtPart` (25), `rearRightSkirtPart` (17), `frontLeftSkirtPart` (3), `waistPart` (3) |
| `rightShin` | `3,009` | `0` | `4` | **`4`** | `rightFoot` (4) |
| `rightFoot` | `2,026` | `0` | `4` | **`4`** | `rightShin` (4) |
| `leftThigh` | `1,014` | `233` | `3` | **`236`** | `leftShin` (122), `sideLeftSkirtPart` (75), `rearLeftSkirtPart` (22), `frontLeftSkirtPart` (14), `waistPart` (3) |
| `leftShin` | `3,145` | `0` | `3` | **`3`** | `leftFoot` (3) |
| `leftFoot` | `1,963` | `0` | `3` | **`3`** | `leftShin` (3) |
| `frontRightSkirtPart` | `472` | `8` | `2` | **`10`** | `waistPart` (10) |
| `frontLeftSkirtPart` | `454` | `12` | `2` | **`14`** | `waistPart` (13), `leftThigh` (1) |
| `sideRightSkirtPart` | `596` | `46` | `3` | **`49`** | `frontRightSkirtPart` (47), `rightThigh` (1), `waistPart` (1) |
| `sideLeftSkirtPart` | `537` | `6` | `9` | **`15`** | `frontLeftSkirtPart` (6), `leftThigh` (6), `waistPart` (3) |
| `rearRightSkirtPart` | `450` | `9` | `6` | **`15`** | `frontRightSkirtPart` (9), `waistPart` (6) |
| `rearLeftSkirtPart` | `408` | `12` | `6` | **`18`** | `leftThigh` (10), `waistPart` (6), `sideLeftSkirtPart` (2) |
| **Total (21 parts)** | **`30,651`** | **`546`** | **`115`** | **`661`** | **`0` triangles crossed the waist plane (`z = 0.331 m`)** |

---

## 4. Evaluation — Torso Yaw `5°` Sweep (`-40°` to `+40°`)

Swept `torso` yaw from `-40°` to `+40°` in `5°` steps (`17` steps total, `docs/results/rigid-browser-validation.json` → `waistSweepReport`), measuring:
1. **Visible waist sliver triangles:** triangles in the waist zone (`chestPart`, `waistPart`, 6 skirts, caps, and `chestPart_overlap`) with aspect ratio `> 15` (`maxEdge / minAltitude > 15`) that are visible from outside via CPU Möller–Trumbore occlusion raycasts from 6 waist-centered camera views.
2. **6-view waist close-up background hole pixels:** interior `#ff00ff` pixels enclosed inside the silhouette across 6 waist-centered close-up views (`front`, `back`, `right`, `left`, `frontRight34`, `frontLeft34` at `512×512`).

| Torso Yaw | Rigid Visible Slivers (`>15`) | Smooth LBS Visible Slivers (`>15`) | Slivers Rigid $\le$ LBS? | Rigid Waist Hole px (6 views) | Smooth LBS Waist Hole px (6 views) | Holes Rigid $\le$ LBS? |
| ---: | ---: | ---: | :---: | ---: | ---: | :---: |
| `-40°` | `287` | `305` | ✅ (`-18`) | **`0`** | `0` | ✅ |
| `-35°` | `287` | `296` | ✅ (`-9`) | **`0`** | `1` | ✅ |
| `-30°` | `286` | `296` | ✅ (`-10`) | **`0`** | `1` | ✅ |
| `-25°` | `284` | `295` | ✅ (`-11`) | **`0`** | `1` | ✅ |
| `-20°` | `285` | `297` | ✅ (`-12`) | **`0`** | `0` | ✅ |
| `-15°` | `291` | `299` | ✅ (`-8`) | **`0`** | `0` | ✅ |
| `-10°` | `289` | `291` | ✅ (`-2`) | **`0`** | `0` | ✅ |
| `-5°` | `292` | `302` | ✅ (`-10`) | **`0`** | `0` | ✅ |
| `0°` | `295` | `303` | ✅ (`-8`) | **`0`** | `0` | ✅ |
| `+5°` | `297` | `309` | ✅ (`-12`) | **`0`** | `0` | ✅ |
| `+10°` | `289` | `295` | ✅ (`-6`) | **`0`** | `0` | ✅ |
| `+15°` | `284` | `291` | ✅ (`-7`) | **`0`** | `0` | ✅ |
| `+20°` | `282` | `297` | ✅ (`-15`) | **`0`** | `0` | ✅ |
| `+25°` | `279` | `295` | ✅ (`-16`) | **`0`** | `0` | ✅ |
| `+30°` | `281` | `294` | ✅ (`-13`) | **`0`** | `0` | ✅ |
| `+35°` | `279` | `292` | ✅ (`-13`) | **`0`** | `0` | ✅ |
| `+40°` | `282` | `301` | ✅ (`-19`) | **`0`** | `0` | ✅ |

- **Result:** Rigid armor beats Smooth LBS on visible waist slivers at **all 17/17 steps** (`279–297` vs. `291–309`; note that `chestPart_overlap` contributes `0` slivers and rigid rotation keeps total waist slivers constant at `502`, whereas Smooth LBS stretches waist band triangles up to `524` slivers at `-40°` and `521` at `+40°`) and produces **`0` hole pixels across all 6 views at all 17/17 angles**.

---

## 5. Evaluation — Per-Triangle Edge-Length Strain $|l' - l| / l$ (9 Full-Body Poses)

Evaluated across all `30,651` outer armor triangles over all 9 test poses (`docs/results/rigid-browser-validation.json`):

| Pose | Rigid Max Strain | Rigid Mean Strain | Smooth LBS Max Strain | Smooth LBS Mean Strain | LBS Tris $>1\%$ Strain | Driven Skirt Angles (Front / Side / Rear) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `bind` | `0.00e+0` | `0.00e+0` | `8.26e-5` | `1.27e-7` | `0` | `0.0° / 0.0° / 0.0°` |
| `rightArmAim` | `2.42e-8` | `1.56e-9` | `9.581` | `0.00352` (`0.35%`) | `631` | `0.0° / 0.0° / 0.0°` |
| `leftArmGuard` | `2.77e-8` | `1.80e-9` | `8.304` | `0.00562` (`0.56%`) | `582` | `0.0° / 0.0° / 0.0°` |
| `dualArmReady` | `2.77e-8` | `2.92e-9` | `14.329` | `0.01089` (`1.09%`) | `1,240` | `0.0° / 0.0° / 0.0°` |
| `torsoTwist` | `3.15e-8` | `9.29e-9` | `49.217` | `0.01416` (`1.42%`) | `1,611` | `0.0° / 0.0° / 0.0°` |
| `crouch` | `3.02e-8` | `3.02e-9` | `189.412` | `0.06353` (`6.35%`) | `3,670` | `10.0° / 6.0° / 0.0°` |
| `deepCrouchAim` | `3.47e-8` | `5.54e-9` | `251.470` | `0.09418` (`9.42%`) | `4,762` | `13.5° / 8.1° / 0.0°` |
| `fullBodyTwistCrouch` | `3.12e-8` | `9.37e-9` | `171.118` | `0.06989` (`6.99%`) | `4,688` | `9.0° / 5.4° / 0.0°` |
| `maxArticulation` | `3.38e-8` | `1.52e-8` | `251.470` | `0.10360` (`10.36%`) | `4,813` | `13.5° / 8.1° / 0.0°` |

- **Rigid armor strain is $\le 3.47 \times 10^{-8}$ (float32 rounding precision, effectively `0`)** across all 9 poses.
- **Strain Heat-Map Screenshots:**
  - `docs/results/rigid-strain-heatmap-torsoTwist.png`
  - `docs/results/rigid-strain-heatmap-maxArticulation.png`
  - `docs/results/rigid-strain-heatmap-rigid-maxArticulation.png`

---

## 6. Evaluation — 6-View Full-Body Visible-Gap Silhouette Check (`rigid <= lbs` on ALL 9/9 Poses)

Rendered each of the 9 test poses from 6 full-body views (`front`, `back`, `right`, `left`, `frontRight34`, `frontLeft34` at `512×512`, stage hidden, solid `#ff00ff` background) and counted interior background pixels enclosed inside the silhouette via 4-connected border flood-fill:

| Pose | Rigid (Caps + Fillers + Overlap) Total Hole px | Rigid (No Caps/Fillers/Overlap) Total Hole px | Smooth LBS (Watertight Ref) Total Hole px | Rigid $\le$ LBS? | Pixels Sealed | Rigid Per-View (`front / back / right / left / 34R / 34L`) |
| --- | ---: | ---: | ---: | :---: | ---: | --- |
| `bind` | **`745`** | `794` | `794` | ✅ (`-49`) | `49` | `24 / 23 / 3 / 5 / 330 / 360` |
| `rightArmAim` | **`403`** | `438` | `440` | ✅ (`-37`) | `35` | `15 / 15 / 1 / 5 / 9 / 358` |
| `leftArmGuard` | **`374`** | `408` | `408` | ✅ (`-34`) | `34` | `22 / 14 / 3 / 1 / 330 / 4` |
| `dualArmReady` | **`38`** | `59` | `61` | ✅ (`-23`) | `21` | `19 / 6 / 1 / 1 / 9 / 2` |
| `torsoTwist` | **`600`** | `624` | `636` | ✅ (`-36`) | `24` | `4 / 533 / 17 / 0 / 0 / 46` |
| `crouch` | **`67`** | `189` | `73` | ✅ (`-6`) | `122` | `15 / 0 / 1 / 16 / 12 / 23` |
| `deepCrouchAim` | **`141`** | `345` | `169` | ✅ (`-28`) | `204` | `60 / 65 / 2 / 5 / 0 / 9` |
| `fullBodyTwistCrouch` | **`916`** | `1,007` | `918` | ✅ (`-2`) | `91` | `1 / 28 / 235 / 35 / 617 / 0` |
| `maxArticulation` | **`1,414`** | `1,541` | `1,427` | ✅ (`-13`) | `127` | `355 / 1 / 311 / 711 / 0 / 36` |

---

## 7. Waist Close-Up Screenshots, Comparison Close-Ups, Equipment & Runtime

- **Same-Camera Waist Close-Ups (`0°`, `±20°`, `±40°`, Front and 3/4 Views):**
  - `0°`: `docs/results/rigid-waist-0-front.png`, `docs/results/rigid-waist-0-34.png`
  - `-20°`: `docs/results/rigid-waist-m20-front.png`, `docs/results/rigid-waist-m20-34.png`
  - `+20°`: `docs/results/rigid-waist-p20-front.png`, `docs/results/rigid-waist-p20-34.png`
  - `-40°`: `docs/results/rigid-waist-m40-front.png`, `docs/results/rigid-waist-m40-34.png`
  - `+40°`: `docs/results/rigid-waist-p40-front.png`, `docs/results/rigid-waist-p40-34.png`
- **Same-Camera Before/After Close-Ups (Smooth LBS vs. Rigid Armor):**
  - Waist twist (`torsoTwist`): `docs/results/rigid-compare-waist-lbs.png` vs. `docs/results/rigid-compare-waist-rigid.png`
  - Knee bend (`45°` and `55°`): `docs/results/rigid-compare-knee-45-{lbs,rigid}.png`, `docs/results/rigid-compare-knee-{lbs,rigid}.png`
  - Shoulder decal (`SSEF`): `docs/results/rigid-compare-shoulder-{lbs,rigid}.png`
  - Front skirt: `docs/results/rigid-compare-skirt-{lbs,rigid}.png`
- **Equipment Attachment, Grounding & Frame Times:**
  - M6 attachment errors across all 9 test poses and during `aim` / `swing` (`docs/results/rigid-action-aim.png`, `docs/results/rigid-action-swing.png`): $\le 4.87 \times 10^{-16}\text{ m}$.
  - Supporting feet remain grounded (`< 1 mm`) across all 9 test poses.
  - Frame times: Rigid armor `16.6 ms` median (`17.3 ms` p95), Smooth LBS `16.6 ms` (`17.4 ms` p95), Three.js `16.7 ms` (`17.3 ms` p95).
  - `npm test` (`14/14`), `npm run build`, and `node scripts/browser-check.mjs` pass with `0` console errors and `0` failed HTTP responses.
