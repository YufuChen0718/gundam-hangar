# Gundam Guardian Asset Audit, Decimation, High-to-Low Texture Baking, 15-Joint Rig & Validation Report

**Date:** 2026-11-17  
**Raw Source Asset:** `assets-src/Meshy_AI_Gundam_Guardian_20261118_texture.blend` (git-ignored, `225,158,540` bytes / `214.73 MiB`)  
**Raw Part-Split Reference STL:** `assets-src/Meshy_AI_Gundam_Guardian_20261118_part-segmentation_split.stl` (git-ignored, `101,887,184` bytes / `97.17 MiB`, `2,037,742` tris across 9 exploded print-bed parts)  
**Reduced & Baked Working Source:** [assets-src/gundam-guardian-source.blend](../../assets-src/gundam-guardian-source.blend) (`18,697,849` bytes / `17.83 MiB`)  
**Rigged Blender Output:** `assets-src/gundam-guardian-rigged.blend` (`18,716,768` bytes / `17.85 MiB`)  
**Exported Runtime GLB:** [public/assets/models/gundam-guardian.glb](../../public/assets/models/gundam-guardian.glb) (`19,342,260` bytes / `18.45 MiB`)  
**Preparation Script:** [scripts/prepare_mecha.py](../../scripts/prepare_mecha.py) (`--asset guardian`)

---

## 1. Phase 1 — Raw Source Audit (`docs/results/guardian-audit/`)

We inspected `assets-src/Meshy_AI_Gundam_Guardian_20261118_texture.blend` in Blender 5.2.0 LTS background mode without modifying the original file. Full raw metadata is archived in [source-inspection.json](guardian-audit/source-inspection.json) with renders in [source-front.png](guardian-audit/source-front.png), [source-side.png](guardian-audit/source-side.png), and [source-back.png](guardian-audit/source-back.png).

| Property | Raw Source (`Meshy_AI_Gundam_Guardian_20261118_texture.blend`) | Baked Working Copy (`gundam-guardian-source.blend`) | Final Rigged GLB (`gundam-guardian.glb`) |
| --- | --- | --- | --- |
| **File Size** | `225,158,540 B` (`214.73 MiB` / `225.16 MB`) | `18,697,849 B` (`17.83 MiB`) | `19,342,260 B` (`18.45 MiB`) |
| **Mesh Objects** | `1` (`Mesh_0`) | `1` (`Mesh_0`) | `17` (`15` skinned armor parts + `rifle` + `shield`) |
| **Vertices** | `1,001,106` | `14,632` | `36,097` GPU vertices across 15 skinned parts (`14,632` source topology) |
| **Edges** | `3,004,470` | `44,655` | Preserved across 17 parts |
| **Triangles (Faces)** | `2,002,991` | `30,043` (`ratio = 0.015`) | `30,043` (`100%` preserved) |
| **Connected Components** | `1` single fused shell (rifle & shield welded at grip/forearm) | `1` single shell | `17` topologically cleaned components |
| **Armatures / Vertex Groups** | `0` armatures, `0` vertex groups, `0` actions | `0` armatures | `1` (`MechaRig`, 15 joints + 3 sockets) |
| **Materials** | `1` (`Material_0`, Principled BSDF) | `1` (`Material_0`, baked PBR) | `1` (`Material_0`, double-sided PBR) |
| **Textures** | `Image_0` Base Color ($8192\times8192$, `36.56 MiB`)<br>`Image_1` Metallic/Roughness ($4096\times4096$, `6.23 MiB`)<br>`Image_2` Normal Map ($4096\times4096$, `9.17 MiB`) | Cycles high-to-low baked $4096\to2048$ (`6.52 MB` color, `4.22 MB` MR, `6.42 MB` normal) | Lossless embedded $2048\times2048$ PNGs (no `clean_textures.py` quantization) |
| **Dimensions & Frame** | $1.369\text{ m (X)} \times 1.078\text{ m (Y)} \times 1.901\text{ m (Z)}$, metric `1.0`, feet on $z=0$ ($y=0$ in glTF) | Same metric frame | $+Y$ up, faces $+Z$, feet on $y = 0$, arms hanging down |

---

## 2. High-to-Low Cycles Texture Baking (`docs/results/guardian-bake/`)

### Cause of Initial Texture Smearing
When `Mesh_0` was decimated from `2,002,991` triangles to `30,043` triangles (`ratio = 0.015`), Blender's collapse decimator merged vertices across disjoint UV island boundaries in the original Meshy atlas. Triangles straddling those collapsed seams interpolated UV coordinates across unrelated texture islands, causing jagged comb-teeth streaks on the shield star cross, diagonal black smears across the yellow chest vents, and white waist triangles bleeding into the red abdomen.

### High-to-Low Bake Method & Settings ([bake-summary.json](guardian-bake/bake-summary.json))
1. **Preserved Low-Poly Geometry & New Smart UV Layout:** Kept the exact `14,632` vertices and `30,043` triangles in `assets-src/gundam-guardian-source.blend`, removed the collapsed UV layer, and generated a fresh single-atlas **Smart UV Project** (`angle_limit = 66°`, `correct_aspect = True`, packed with `margin_method = 'FRACTION'`, `margin = 0.0008` so all islands pack without overlap at **80.48% atlas coverage** across `38,367` unique UV coordinates).
2. **Cycles GPU (`METAL`, Apple M4 Pro) Selected-to-Active Baking at $4096 \times 4096$:**
   - **Two-Pass Cage Extrusion + Pinhole Healing:** A single large extrusion (`0.012–0.02 m`) pushes rays inside overhanging $90^\circ$ steps (such as the top edge of the yellow chest vents and the recessed left shield border), while a small extrusion (`0.005 m`) can miss deep decimation chord bridges (`~10–14 mm`). We therefore run a tight pass (`cage_extrusion = 0.005 m`, `max_ray_distance = 0.016 m`, `margin = 4 px`) for crisp crevice/overhang hits and a wide pass (`cage_extrusion = 0.015 m`, `max_ray_distance = 0.035 m`, `margin = 8 px`) as a fallback wherever the tight pass misses or hits a back-face, followed by 3-step interior pinhole healing (`0.000000` inverted normals).
   - **Base Color (`DIFFUSE`, color only):** `use_pass_direct = False`, `use_pass_indirect = False`, `use_pass_color = True` with high-poly `Metallic` temporarily set to `0.0` and `Normal` disconnected so metallic or grazing surfaces never attenuate the diffuse color pass.
   - **Normal (`NORMAL`, tangent space):** `+X / +Y / +Z` tangent-space normal bake capturing both the 2M-triangle geometric bevels/panel lines and the high-poly 4K normal map (`Image_2`).
   - **Metallic & Roughness (`EMIT`):** Baked `Separate Color.Green` (Roughness) and `Separate Color.Blue` (Metallic) separately via an `Emission` shader (`Strength = 1.0`) in `Non-Color` space and packed them into a glTF `metallicRoughness` map (`R = 1.0`, `G = roughness`, `B = metallic`).
   - **Resolution & GLB Size:** Baked at $4096 \times 4096$ (`24.04 MB` color, `20.54 MB` normal, `13.50 MB` MR — `58.08 MB` total, which would exceed the 25 MB GLB limit) and box-filter downscaled ($2\times2$ with tangent-normal renormalization) to $2048 \times 2048$ (`6.52 MB` color, `6.42 MB` normal, `4.22 MB` MR). Using the unquantized $2048 \times 2048$ baked maps (without running `clean_textures.py`), `public/assets/models/gundam-guardian.glb` is **`19.34 MB` (`18.45 MiB`)**, well under the 25 MB limit.

### Bake Comparisons & Before/After Close-Ups
- **High-Poly (2M tris, left) vs. Baked Low-Poly (30k tris, right):** [compare-front.png](guardian-bake/compare-front.png), [compare-side.png](guardian-bake/compare-side.png), [compare-back.png](guardian-bake/compare-back.png)
- **Shield Front (Before vs. After):** [shield-before.png](guardian-bake/shield-before.png) $\to$ [shield-after.png](guardian-bake/shield-after.png)
- **Chest & Vents (Before vs. After):** [chest-before.png](guardian-bake/chest-before.png) $\to$ [chest-after.png](guardian-bake/chest-after.png)
- **Right Arm & Rifle (Before vs. After):** [arm-before.png](guardian-bake/arm-before.png) $\to$ [arm-after.png](guardian-bake/arm-after.png)

---

## 3. Meshy STL Part-Segmentation Comparison (Step 6 Reference)

We inspected `assets-src/Meshy_AI_Gundam_Guardian_20261118_part-segmentation_split.stl` (`101,887,184` bytes, `2,037,742` triangles, git-ignored) and compared its connected components against `ASSET_CONFIGS['guardian']`:
1. **Exploded Print-Bed Layout vs. In-Place Rigging Frame:** Meshy's `part-segmentation_split.stl` translates and rotates each split piece onto a flat $120 \times 120$ print bed (`Z >= 0.002`), losing the assembled character coordinate frame and adding `34,751` planar cap triangles across cut planes (`2,037,742` vs. `2,002,991` tris).
2. **Coarse 9-Piece Split vs. 17-Part Articulated Hierarchy:** Meshy's automatic splitter only separates the model into **9 coarse connected components** (`340,910` to `55,440` tris each), leaving whole limbs (thigh + shin + foot, or upper arm + forearm + hand) fused as single rigid blocks. By contrast, `ASSET_CONFIGS['guardian']` segments the mesh in-place into **17 articulated parts** matching all **15 joints** (`pelvis`, `torso`, `head`, bilateral `shoulder`/`elbow`/`wrist`, bilateral `hip`/`knee`/`ankle`) plus detachable `rifle` and `shield` while preserving shared boundary vertices for watertight LBS.

### Triangle Count per Mesh Part (`30,043` Total)

| Part Name | Controlling Joint / Socket | Triangles | Role |
| --- | --- | ---: | --- |
| `waistPart` | `pelvis` (root) | 4,635 | Pelvis core, front/rear/side waist skirts |
| `chestPart` | `torso` | 4,240 | Upper torso, chest vents, backpack thrusters |
| `headPart` | `head` | 1,515 | Helmet, faceplate, V-fin crest |
| `rightUpperArm` | `rightShoulder` | 766 | Right shoulder pauldron + bicep |
| `rightForearm` | `rightElbow` | 1,337 | Right elbow + forearm armor |
| `rightPalm` | `rightWrist` | 831 | Right hand / manipulator |
| `leftUpperArm` | `leftShoulder` | 2,276 | Left shoulder pauldron + bicep |
| `leftForearm` | `leftElbow` | 510 | Left elbow + inner forearm |
| `leftPalm` | `leftWrist` | 395 | Left hand / manipulator |
| `rightThigh` | `rightHip` | 1,169 | Right upper leg |
| `rightShin` | `rightKnee` | 948 | Right knee + tibial armor |
| `rightFoot` | `rightAnkle` | 2,302 | Right ankle guard + foot sole |
| `leftThigh` | `leftHip` | 1,174 | Left upper leg |
| `leftShin` | `leftKnee` | 944 | Left knee + tibial armor |
| `leftFoot` | `leftAnkle` | 1,826 | Left ankle guard + foot sole |
| `rifle` | `rightHandSocket` (`rightWrist`) | 2,419 | Detachable right-hand beam rifle |
| `shield` | `leftForearmSocket` (`leftElbow`) | 2,756 | Detachable left-forearm shield |
| **Total** | **15 joints + 3 sockets** | **30,043** | **100% of decimated source faces preserved** |

---

## 4. Phase 4 — Per-Pose Seam Continuity, Custom LBS vs. Three.js, and Rigid Cracks

Across all 15 skinned body parts, there are **932 shared boundary vertices** in Blender (**930 spatial boundary groups** at $10^{-5}\text{ m}$ quantization in the browser) and **36,097 GPU vertices** (after UV-seam splitting from the new Smart UV layout). All 9 full-body test poses pass the $< 10^{-5}\text{ m}$ ($0.01\text{ mm}$) seam threshold by two orders of magnitude:

| Pose ID | Blender Max Seam (m) | Browser Our-LBS Max Seam (m) | Browser Our-LBS Mean Seam (m) | Rigid-Parts Max Crack (m) | Rigid-Parts Max Crack (mm) | Our LBS vs. Three.js Max Diff (m) | Our LBS vs. Three.js Mean Diff (m) | Rifle Socket Error (m) | Foot Min Y (L / R, m) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `bind` | `0.0000e+0` | `7.1726e-8` | `3.0197e-9` | `7.1726e-8` | `0.0001` | `1.0537e-8` | `4.2001e-9` | `1.36e-16` | `0.0028 / 0.0000` |
| `rightArmAim` | `1.1921e-7` | `1.0412e-7` | `9.3448e-9` | `0.272622` | `272.62` | `6.2848e-8` | `7.8818e-9` | `1.11e-16` | `0.0028 / 0.0000` |
| `leftArmGuard` | `1.1921e-7` | `8.3772e-8` | `8.0215e-9` | `0.228329` | `228.33` | `6.2884e-8` | `1.0154e-8` | `1.36e-16` | `0.0028 / 0.0000` |
| `dualArmReady` | `1.3411e-7` | `9.2056e-8` | `1.0332e-8` | `0.360140` | `360.14` | `6.0978e-8` | `7.9409e-9` | `5.55e-17` | `0.0028 / 0.0000` |
| `torsoTwist` | `1.3411e-7` | `8.0302e-8` | `1.4073e-8` | `0.197328` | `197.33` | `5.8850e-8` | `1.2194e-8` | `1.11e-16` | `0.0028 / 0.0000` |
| `crouch` | `1.2288e-7` | `1.1194e-7` | `1.3642e-8` | `0.231065` | `231.07` | `6.3971e-8` | `1.8913e-8` | `1.24e-16` | `0.0028 / 0.0000` |
| `deepCrouchAim` | `2.4440e-7` | `1.0612e-7` | `1.7692e-8` | `0.381579` | `381.58` | `5.5038e-8` | `2.7252e-8` | `5.55e-17` | `0.0028 / 0.0000` |
| `fullBodyTwistCrouch` | `2.4646e-7` | `9.8748e-8` | `1.3215e-8` | `0.329426` | `329.43` | `5.6975e-8` | `1.7783e-8` | `7.85e-17` | `0.0028 / -0.0000` |
| `maxArticulation` | `2.4074e-7` | `1.1206e-7` | `1.9546e-8` | `0.400402` | `400.40` | `6.0478e-8` | `2.4786e-8` | `2.78e-17` | `0.0028 / 0.0000` |

### Frame-Time Benchmark on Guardian (85-frame window, 60 Hz display)

| Skinning Mode | Mean Frame Time (ms) | Median Frame Time (ms) | p95 Frame Time (ms) |
| --- | ---: | ---: | ---: |
| `Three.js skinning` | `16.673` | `16.7` | `17.3` |
| `our LBS` | `16.425` | `16.6` | `17.2` |
| `rigid parts` | `16.672` | `16.6` | `17.6` |

---

## 5. Known Limitations

1. **Decimated Silhouette Faceting at Extreme Close-Up:** While the tangent-space normal bake recovers internal panel lines, vents, and bevel shading from the 2M-triangle sculpt, physical silhouette edges (such as the curved edge of the yellow shield star or circular knee caps) are still bounded by the 30,043-triangle polygon edges when viewed at extreme close-up.
2. **Joint Band Deformation & Armor Interpenetration:** The 2-ring shared-weight transition bands preserve $C^0$ watertight continuity ($\le 1.12 \times 10^{-7}\text{ m}$ gap) with mild local stretching past $75^\circ$ flexion, and shoulder pauldrons / waist skirts can intersect adjacent limbs at large pitch angles.
3. **AI-Generated Contact Bridges & Baked Occlusion:** In the raw single-shell Meshy model, the inner right wrist/forearm and right waist skirt were topologically fused across a narrow contact strip, and ambient shadows under the rifle grip and shield mount are baked into the raw high-poly albedo (`Image_0`), remaining visible when weapons are hidden or limbs move away from bind contact.
