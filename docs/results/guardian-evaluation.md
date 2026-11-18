# Gundam Guardian Asset Audit, Decimation, 15-Joint Full-Body Rig & Validation Report

**Date:** 2026-11-17  
**Raw Source Asset:** `assets-src/Meshy_AI_Gundam_Guardian_20261118_texture.blend` (git-ignored, `225,158,540` bytes / `214.73 MiB`)  
**Reduced Working Source:** [assets-src/gundam-guardian-source.blend](../../assets-src/gundam-guardian-source.blend) (`19,240,688` bytes / `18.35 MiB`)  
**Rigged Blender Output:** `assets-src/gundam-guardian-rigged.blend` (`18,988,284` bytes / `18.11 MiB`)  
**Exported Runtime GLB:** [public/assets/models/gundam-guardian.glb](../../public/assets/models/gundam-guardian.glb) (`7,090,692` bytes / `6.76 MiB`)  
**Preparation Script:** [scripts/prepare_mecha.py](../../scripts/prepare_mecha.py) (`--asset guardian`)  
**Texture Compression Script:** [scripts/clean_textures.py](../../scripts/clean_textures.py)

---

## 1. Phase 1 — Raw Source Audit (`docs/results/guardian-audit/`)

We inspected `assets-src/Meshy_AI_Gundam_Guardian_20261118_texture.blend` in Blender 5.0.1 background mode without modifying the original file. Full raw metadata is archived in [source-inspection.json](guardian-audit/source-inspection.json) with orthographic/perspective audit renders in [source-front.png](guardian-audit/source-front.png), [source-side.png](guardian-audit/source-side.png), and [source-back.png](guardian-audit/source-back.png).

| Property | Raw Source (`Meshy_AI_Gundam_Guardian_20261118_texture.blend`) | Web-Ready Working Copy (`gundam-guardian-source.blend`) | Final Rigged GLB (`gundam-guardian.glb`) |
| --- | --- | --- | --- |
| **File Size** | `225,158,540 B` (`214.73 MiB` / `225.16 MB`) | `19,240,688 B` (`18.35 MiB`) | `7,090,692 B` (`6.76 MiB`) |
| **Mesh Objects** | `1` (`Mesh_0`) | `1` (`Mesh_0`) | `17` (`15` skinned armor parts + `rifle` + `shield`) |
| **Vertices** | `1,001,106` | `14,632` | `26,623` GPU vertices across 15 skinned parts (`14,632` source topology) |
| **Edges** | `3,004,470` | `44,655` | Preserved across 17 parts |
| **Triangles (Faces)** | `2,002,991` | `30,043` (`ratio = 0.015`) | `30,043` (`100%` preserved) |
| **Connected Components** | `1` single fused shell (rifle & shield welded at grip/forearm) | `1` single shell | `17` topologically cleaned components |
| **Armatures / Vertex Groups** | `0` armatures, `0` vertex groups, `0` actions | `0` armatures | `1` (`MechaRig`, 15 joints + 3 sockets) |
| **Materials** | `1` (`Material_0`, Principled BSDF) | `1` (`Material_0`) | `1` (`Material_0`, double-sided PBR) |
| **Textures** | `Image_0` Base Color ($8192\times8192$, `36.56 MiB`)<br>`Image_1` Metallic/Roughness ($4096\times4096$, `6.23 MiB`)<br>`Image_2` Normal Map ($4096\times4096$, `9.17 MiB`) | All 3 resized to $2048\times2048$ | Cleaned & quantized $2048\times2048$ PNGs (`1814 KB` color, `602 KB` MR, `2937 KB` normal) |
| **Dimensions & Frame** | $1.369\text{ m (X)} \times 1.078\text{ m (Y)} \times 1.901\text{ m (Z)}$, metric `1.0`, feet on $z=0$ ($y=0$ in glTF) | Same metric frame | $+Y$ up, faces $+Z$, feet on $y = 0$, arms hanging down |

---

## 2. Phase 2 & 3 — Decimation, Segmentation, and 15-Joint Full-Body Rig

1. **Decimation & Texture Downscaling:** Applying Blender's `DECIMATE` (`COLLAPSE`, `ratio = 0.015`) reduced the dense Meshy surface from **2,002,991 triangles (`1,001,106` vertices)** to **30,043 triangles (`14,632` vertices)** while preserving sharp armor silhouettes, head crest details, shoulder pauldrons, rifle barrel, and shield face. Downscaling textures from 8K/4K to 2K reduced the working `.blend` to **18.35 MiB** (`< 50 MB`) and the final quantized GLB to **6.76 MiB** (`< 25 MB`).
2. **Weapon & Shield Separation:** Because the raw Meshy mesh is a single connected component (`1` shell), `scripts/prepare_mecha.py --asset guardian` separates the right-hand beam rifle (`2,419` triangles) and left-forearm shield (`2,756` triangles) via calibrated bounding planes around the right grip and left forearm mount, Followed by topological connected-component cleanup so no floating fragments remain. The rifle is parented to `rightHandSocket` (`rightWrist`) and the shield is parented to `leftForearmSocket` (`leftElbow`).
3. **Shared-Vertex Skin Weights & 15-Joint Hierarchy:** Before splitting the body into 15 armor parts, smooth skin weights are computed on the original vertex indices (`0..14631`) with narrow 2-ring joint blend bands (`BLEND_RING_WEIGHTS = {1: 0.38, 2: 0.16}`) and rigid `1.0` interior weights. Both `Guardian (new)` and `Previous model` share the exact same 15 joint names, joint limits, and socket names (`rightHandSocket`, `leftHandSocket`, `leftForearmSocket`).

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

## 3. Phase 4 — Per-Pose Seam Continuity, Custom LBS vs. Three.js, and Rigid Cracks

Across all 15 skinned body parts, there are **932 shared boundary vertices** in Blender (**930 spatial boundary groups** at $10^{-5}\text{ m}$ quantization in the browser) and **26,623 skinned vertices**. All 9 full-body test poses pass the $< 10^{-5}\text{ m}$ ($0.01\text{ mm}$) seam threshold by two orders of magnitude:

| Pose ID | Blender Max Seam (m) | Browser Our-LBS Max Seam (m) | Browser Our-LBS Mean Seam (m) | Rigid-Parts Max Crack (m) | Rigid-Parts Max Crack (mm) | Our LBS vs. Three.js Max Diff (m) | Our LBS vs. Three.js Mean Diff (m) | Rifle Socket Error (m) | Foot Min Y (L / R, m) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `bind` | `0.0000e+0` | `7.1726e-8` | `3.0694e-9` | `7.1726e-8` | `0.0001` | `1.0537e-8` | `4.1491e-9` | `1.36e-16` | `0.0028 / 0.0000` |
| `rightArmAim` | `1.1921e-7` | `1.0412e-7` | `9.2062e-9` | `0.272622` | `272.62` | `6.2848e-8` | `7.6048e-9` | `1.11e-16` | `0.0028 / 0.0000` |
| `leftArmGuard` | `1.1921e-7` | `8.3772e-8` | `8.1804e-9` | `0.228329` | `228.33` | `6.2884e-8` | `9.9021e-9` | `1.36e-16` | `0.0028 / 0.0000` |
| `dualArmReady` | `1.3411e-7` | `9.2056e-8` | `1.0624e-8` | `0.360140` | `360.14` | `6.0978e-8` | `7.6491e-9` | `5.55e-17` | `0.0028 / 0.0000` |
| `torsoTwist` | `1.3411e-7` | `8.0302e-8` | `1.4543e-8` | `0.197328` | `197.33` | `5.8850e-8` | `1.2030e-8` | `1.11e-16` | `0.0028 / 0.0000` |
| `crouch` | `1.2288e-7` | `1.1194e-7` | `1.4131e-8` | `0.231065` | `231.07` | `6.3971e-8` | `1.8375e-8` | `1.24e-16` | `0.0028 / 0.0000` |
| `deepCrouchAim` | `2.4440e-7` | `1.0612e-7` | `1.7949e-8` | `0.381579` | `381.58` | `5.5038e-8` | `2.7404e-8` | `5.55e-17` | `0.0028 / 0.0000` |
| `fullBodyTwistCrouch` | `2.4646e-7` | `9.8748e-8` | `1.3714e-8` | `0.329426` | `329.43` | `5.6975e-8` | `1.7412e-8` | `7.85e-17` | `0.0028 / -0.0000` |
| `maxArticulation` | `2.4074e-7` | `1.1206e-7` | `2.0210e-8` | `0.400402` | `400.40` | `6.0478e-8` | `2.5130e-8` | `2.78e-17` | `0.0028 / 0.0000` |

### Frame-Time Benchmark on Guardian (85-frame window, 60 Hz display)

| Skinning Mode | Mean Frame Time (ms) | Median Frame Time (ms) | p95 Frame Time (ms) |
| --- | ---: | ---: | ---: |
| `Three.js skinning` | `17.267` | `16.7` | `18.0` |
| `our LBS` | `16.924` | `16.7` | `17.9` |
| `rigid parts` | `17.419` | `16.7` | `18.2` |

---

## 4. T07 Blend vs. Cut Transition Evaluation on Guardian

We re-ran the T07 mid-swing interrupt recording (`idle` $\to$ `swing` at $t = 1.00\text{ s}$ $\to$ `aim` at $t = 1.45\text{ s}$, $\Delta t = 1/120\text{ s}$) on the 15-joint `gundam-guardian.glb` model:

- **CSV Data:** [guardian-transition-curves.csv](guardian-transition-curves.csv)
- **Vector Plot:** [guardian-transition-plot.svg](guardian-transition-plot.svg)
- **Raster Plot:** [guardian-transition-plot.png](guardian-transition-plot.png)

| Joint | Peak $\omega$ at `swing -> aim` (`cut`, deg/s) | Peak $\omega$ at `swing -> aim` (`blend`, deg/s) | Reduction Factor |
| --- | ---: | ---: | ---: |
| `rightShoulder` | `1562.59` | `168.47` | **9.3×** |
| `torso` | `1678.22` | `120.99` | **13.9×** |
| `rightKnee` | `2398.38` | `181.39` | **13.2×** |

---

## 5. Known Limitations

1. **Joint Band Deformation:** The 2-ring shared-weight transition bands around the 15 joints preserve $C^0$ watertight continuity ($\le 1.12 \times 10^{-7}\text{ m}$ gap), which introduces mild local triangle stretching at extreme joint angles ($>75^\circ$ elbow/knee flexion) compared to rigid sub-assemblies with separate internal mechanical joint geometry.
2. **Armor Interpenetration:** Because no self-collision solver is used, large shoulder pitch ($>45^\circ$) or deep hip flexion ($>30^\circ$) causes the prominent Guardian shoulder pauldrons and front/side waist skirt plates to partially interpenetrate adjacent upper-arm or thigh armor.
3. **AI-Generated Fused Topology & Texture Baking:** In the raw single-component Meshy scan, the inner right wrist/forearm and the right waist side-skirt were topologically bridged across a narrow contact strip, and ambient occlusion shadows under the pauldrons, shield mount, and rifle grip are baked into the base-color texture (`Image_0`). When the right arm swings away from the hip or when the rifle/shield are hidden, those contact regions show minor stretched bridge triangles and baked shadow patches.
