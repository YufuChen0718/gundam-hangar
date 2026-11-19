# Gundam Sentinel Body & M6 Modular Equipment Evaluation

**Date:** 2026-11-18  
**Assets Evaluated:**
- Body: `assets-src/Meshy_AI_Gundam_Sentinel_20261118_texture.blend` $\to$ `public/assets/models/gundam-sentinel.glb`
- Beam Saber: `assets-src/Meshy_AI_Violet_Saber_Glow_20261118_texture.blend` $\to$ `public/assets/models/equip-beam-saber.glb`
- Shield: `assets-src/Meshy_AI_Crimson_Guardian_Shield_20261118_texture.blend` $\to$ `public/assets/models/equip-shield.glb`
- Blaster / Rifle: `assets-src/Meshy_AI_Futuristic_Toy_Blaster_20261118_texture.blend` $\to$ `public/assets/models/equip-rifle.glb`

---

## 1. Phase 1 — Raw Asset Audit (`docs/results/sentinel-audit/`)

All four raw Meshy `.blend` files in `assets-src/` (excluded from Git via `.gitignore` and documented in `docs/asset-sources.md`) were inspected in headless Blender (`docs/results/sentinel-audit/audit-summary.json`):

| Raw Asset File | File Size | Vertices | Triangles | Connected Components | Armatures | Materials & Raw Texture Maps | Bounding Box ($\text{W} \times \text{D} \times \text{H}$, Blender $Z$-up) | Geometry / Orientation Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| `Meshy_AI_Gundam_Sentinel_20261118_texture.blend` | `195.61 MiB` (`205,114,814 B`) | `929,589` | `1,859,487` | `2` (`929,583` + `6` verts) | `0` | `Material_0`: 8K Base Color (`8192x8192`), 4K MetallicRoughness (`4096x4096`), 4K Normal (`4096x4096`) | $1.0079\text{ m} \times 0.5147\text{ m} \times 1.8998\text{ m}$ | Clean bipedal Gundam body facing $-Y$, arms hanging freely at sides ($x \approx \pm 0.305\text{ m}$ at wrists). **No welded weapons or shield.** |
| `Meshy_AI_Violet_Saber_Glow_20261118_texture.blend` | `20.57 MiB` (`21,570,068 B`) | `27,386` | `54,768` | `1` | `0` | `Material_0`: 2K Base Color (`2048x2048`), 2K MetallicRoughness, 2K Normal | $0.0887\text{ m} \times 0.0888\text{ m} \times 1.9012\text{ m}$ | Aligned along $Z \in [-0.950, +0.952]\text{ m}$. Metallic cylindrical hilt spans $z \in [-0.950, -0.568]\text{ m}$ (emitter shoulder flares to $r = 0.044\text{ m}$ at $z \approx -0.61\text{ m}$, narrows to $r = 0.0235\text{ m}$ at $z = -0.568\text{ m}$); glowing violet blade spans $z \in (-0.568, +0.952]\text{ m}$. |
| `Meshy_AI_Crimson_Guardian_Shield_20261118_texture.blend` | `110.31 MiB` (`115,671,569 B`) | `488,435` | `977,542` | `2` (`488,425` + `10` verts) | `0` | `Material_0`: 8K Base Color (`8192x8192`), 4K MetallicRoughness, 4K Normal | $0.8325\text{ m} \times 0.2236\text{ m} \times 1.9065\text{ m}$ | Tall hexagonal Gundam shield ($1.907\text{ m}$ tall, $0.833\text{ m}$ wide across $X$, $0.224\text{ m}$ deep across $Y$) with crimson face, white borders, and zero-roughness metallic gold star cross on the $-Y$ outer face; rear forearm grip handle on $+Y$. |
| `Meshy_AI_Futuristic_Toy_Blaster_20261118_texture.blend` | `38.97 MiB` (`40,858,799 B`) | `130,025` | `260,050` | `1` | `0` | `Material_0`: 8K Base Color (`8192x8192`), 4K MetallicRoughness, 4K Normal | $1.8981\text{ m} \times 0.2377\text{ m} \times 0.9855\text{ m}$ | Aligned along $X \in [-0.949, +0.949]\text{ m}$: muzzle/barrel points along $-X$, top optic scope sits at $+Z \in [0.22, 0.49]\text{ m}$, rear pistol grip is centered at $(x = +0.415, y = 0.0, z = -0.220)\text{ m}$ (with forward secondary grip at $x = -0.28\text{ m}$). |

Audit renders:
- Body: `docs/results/sentinel-audit/body-{front,side,back}.png`
- Saber: `docs/results/sentinel-audit/saber-{front,side}.png`
- Shield: `docs/results/sentinel-audit/shield-{front,side,back}.png`
- Rifle: `docs/results/sentinel-audit/rifle-{front,side,back}.png`

---

## 2. Phase 2 — Decimation, High-to-Low Texture Baking & Rigging Pipeline

Using `scripts/bake_textures.py --asset <sentinel|saber|shield|rifle>` (Cycles Metal GPU `Selected to Active` two-pass ray casting at `4096x4096` downscaled $2\times2$ to `2048x2048` for body/shield/rifle, and `2048x2048` downscaled to `1024x1024` for saber) followed by `scripts/prepare_mecha.py --asset sentinel`:

| Target Asset | Output Path | File Size | Vertices | Triangles | Baked UV Atlas & Texture Maps | Special Pipeline Steps |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Sentinel Working Source | `assets-src/gundam-sentinel-source.blend` | **`15.94 MiB`** (`16,717,229 B`, `< 50 MB`) | `14,845` | **`29,999`** | `35,627` unique UVs (`77.88%` coverage); `2048x2048` Color, Tangent Normal, MetallicRoughness | Normalized feet to $y = 0$, centered $X/Z$, Smart UV Project (`66°`, margin `0.0008`). |
| Sentinel Rigged Blend | `assets-src/gundam-sentinel-rigged.blend` | **`15.65 MiB`** (`16,412,507 B`, `< 50 MB`) | `14,845` (source) / `35,046` (GPU split) | **`29,999`** | `2048x2048` PBR maps | 15 joints, 4 sockets (`rightHandSocket`, `leftHandSocket`, `leftForearmSocket`, `backSocket`), 15 body parts, shared-vertex 2-ring skin weights (`819` Blender shared boundary vertices / `731` browser boundary groups). |
| **Sentinel Runtime GLB** | `public/assets/models/gundam-sentinel.glb` | **`16.21 MiB`** (`16,997,464 B`, `< 25 MB`) | `35,046` (skinned) | **`29,999`** | `2048x2048` Color + Normal + MR | Default model (`"Sentinel (new)"`) in the viewer. |
| **Beam Saber Runtime GLB** | `public/assets/models/equip-beam-saber.glb` | **`1.98 MiB`** (`2,071,688 B`, `< 25 MB`) | `2,102` | **`4,200`** (`< 5k`) | `1024x1024` Color + Normal + MR | Origin shifted to hilt grip center $(0, 0, -0.760)$, aligned along $+Z$; split at $z_{\text{local}} = 0.192\text{ m}$ into `saberHilt` (`2,932` tris) and `saberBlade` (`1,268` tris) with emissive violet `SaberBladeMaterial` (`Emission = (0.76, 0.24, 1.0)`, `Strength = 2.8`). |
| **Shield Runtime GLB** | `public/assets/models/equip-shield.glb` | **`11.07 MiB`** (`11,610,048 B`, `< 25 MB`) | `2,864` | **`6,400`** (`< 8k`) | `2048x2048` Color + Normal + MR | Origin shifted to inner forearm mount, rotated so outer star-cross face points along $+X$ (left arm outward direction) and long axis along $+Y$. |
| **Rifle Runtime GLB** | `public/assets/models/equip-rifle.glb` | **`8.77 MiB`** (`9,197,984 B`, `< 25 MB`) | `3,250` | **`6,500`** (`< 8k`) | `2048x2048` Color + Normal + MR | Origin shifted to rear pistol grip $(0.415, 0.0, -0.220)$, rotated so barrel points along $+Z$ and top optic scope along $+Y$. |

---

## 3. Phase 3 — Equipment Attachment System (M6) & Scale Factors

Each external equipment GLB is loaded once and attached via the hierarchical scene-graph chain:
$$\mathbf{M}_{\text{equipment}}^{\text{world}} = \mathbf{M}_{\text{joint}}^{\text{world}} \cdot \mathbf{M}_{\text{socket}}^{\text{joint}} \cdot \mathbf{M}_{\text{equipment}}^{\text{socket}}$$
where $\mathbf{M}_{\text{equipment}}^{\text{socket}}$ is stored on a dedicated `equipOffset_<id>` node configured by `EQUIPMENT_OFFSETS` in `src/mecha/rigConfig.ts`:

| Equipment Item (`id`) | Parent Joint | Socket (`SocketName`) | Local Offset `position` $(\text{m})$ | Local `rotationDeg` $(\text{XYZ}^\circ)$ | Scale Factor | Physical Size on $1.90\text{ m}$ Sentinel Body |
| --- | --- | --- | --- | --- | ---: | --- |
| **Beam Saber** (`saber`) | `rightWrist` | `rightHand` (`rightHandSocket`) | `[-0.012, -0.012, 0.016]` | `[-12, -14, 0]` | **`0.58`** | $1.10\text{ m}$ total length ($0.22\text{ m}$ hilt + $0.88\text{ m}$ glowing violet blade, $3.5\text{ cm}$ grip diameter in right palm). |
| **Blaster / Rifle** (`rifle`) | `rightWrist` | `rightHand` (`rightHandSocket`) | `[-0.022, -0.020, 0.032]` | `[54, -4, 0]` | **`0.42`** | $0.80\text{ m}$ total length ($0.41\text{ m}$ height), rear grip centered in right palm; $+54^\circ$ pitch compensates the bind arm hang angle and aligns the barrel horizontally forward (`+Z`) when `rightShoulder = 52°`, `rightElbow = 82°`, `rightWrist = -10°` in `aimClip`. |
| **Shield** (`shield`) | `leftElbow` | `leftForearm` (`leftForearmSocket`) | `[0.042, -0.045, 0.015]` | `[0, 8, -4]` | **`0.54`** | $1.03\text{ m}$ tall $\times 0.45\text{ m}$ wide, mounted `$4.2\text{ cm}$` outside the left forearm (`+X`), spanning from shoulder to knee without intersecting the pauldron or forearm armor. |

- **Mutual Exclusion & Blade Toggle:** The right hand holds at most one item (`rightHand: 'none' | 'saber' | 'rifle'`). Toggling `saberBlade: boolean` hides/shows the `saberBlade` mesh inside `equip-beam-saber.glb` while keeping `saberHilt` gripped in the right hand.

---

## 4. Phase 4 — Action Auto-Equip & T07 Blend vs. Cut Transition Analysis

- `playAction('aim')` automatically equips `rightHand = 'rifle'` (raising the rifle forward with `rightShoulder: 52°`, `rightElbow: 82°`, `rightWrist: -10°` while the left shield arm braces in support and holds the final frame).
- `playAction('swing')` automatically equips `rightHand = 'saber'` with `saberBlade = true` (executing wind-up $\to$ slash strike $\to$ follow-through $\to$ automatic smooth transition back to `idle`).
- Re-running the T07 `idle -> swing -> aim` mid-swing interrupt recording (`t = 0..3.0 s` at `120 Hz`, `swing` triggered at `t = 0.80 s`, `aim` interrupt triggered mid-strike at `t = 1.45 s`) on Sentinel produced:
  - CSV: `docs/results/sentinel-transition-curves.csv` (`361` samples $\times 2$ modes)
  - Plot: `docs/results/sentinel-transition-plot.svg` and `docs/results/sentinel-transition-plot.png`

| Joint | Peak $\|\omega\|$ at `swing -> aim` ($t = 1.45\text{ s}$) in `cut` mode | Peak $\|\omega\|$ in `blend` mode ($0.3\text{ s}$ smoothstep slerp) | Peak Angular-Velocity Reduction |
| --- | ---: | ---: | ---: |
| `rightShoulder` | `5759.67 deg/s` | `232.21 deg/s` | **`24.8x` reduction** |
| `torso` | `3840.65 deg/s` | `177.42 deg/s` | **`21.6x` reduction** |
| `rightKnee` | `2399.51 deg/s` | `89.27 deg/s` | **`26.9x` reduction** |

---

## 5. Phase 6 — 9-Pose Browser Seam Check, CPU vs. Three.js LBS Diff & M6 Equipment Attachment Error

Evaluated in headless Chrome via `node scripts/browser-check.mjs` (`docs/results/sentinel-browser-validation.json`) across `731` shared boundary vertex groups and `35,046` skinned vertices on `gundam-sentinel.glb`:

| Pose Name | Our LBS Max Seam Gap ($\text{m}$) | Rigid Parts Max Seam Crack ($\text{m}$) | Our LBS vs. Three.js Max Vertex Diff ($\text{m}$) | Saber Attachment Error ($\text{m}$) | Rifle Attachment Error ($\text{m}$) | Shield Attachment Error ($\text{m}$) | Feet Min $Y$ ($\text{L} / \text{R}$, $\text{m}$) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `bind` | `0.0000e+0` | `0.0000e+0` | `5.5511e-17` | `0.0000e+0` | `0.0000e+0` | `0.0000e+0` | `0.00000 / 0.00013` |
| `rightArmAim` | `2.6657e-8` | `0.09926` (`99.3 mm`) | `5.1067e-8` | `5.5511e-17` | `5.5511e-17` | `0.0000e+0` | `0.00000 / 0.00013` |
| `leftArmGuard` | `4.8444e-8` | `0.11460` (`114.6 mm`) | `5.0732e-8` | `0.0000e+0` | `0.0000e+0` | `5.5511e-17` | `0.00000 / 0.00013` |
| `dualArmReady` | `5.4793e-8` | `0.15584` (`155.8 mm`) | `5.1492e-8` | `1.7478e-16` | `1.7478e-16` | `1.2413e-16` | `0.00000 / 0.00013` |
| `torsoTwist` | `4.5499e-8` | `0.13672` (`136.7 mm`) | `4.2943e-8` | `1.1102e-16` | `1.1102e-16` | `6.1859e-17` | `0.00000 / 0.00006` |
| `crouch` | `5.3523e-8` | `0.11165` (`111.7 mm`) | `5.4708e-8` | `2.7756e-16` | `2.7756e-16` | `1.3878e-16` | `0.00000 / 0.00012` |
| `deepCrouchAim` | `6.1565e-8` | `0.16207` (`162.1 mm`) | `5.3781e-8` | `7.2202e-16` | `7.2202e-16` | `1.3878e-16` | `0.00000 / 0.00004` |
| `fullBodyTwistCrouch` | `5.9605e-8` | `0.13672` (`136.7 mm`) | `5.1691e-8` | `2.4825e-16` | `2.4825e-16` | `2.3570e-16` | `0.00000 / 0.00004` |
| `maxArticulation` | `4.4448e-8` | `0.17708` (`177.1 mm`) | `5.0335e-8` | `2.8305e-16` | `2.8305e-16` | `2.6168e-16` | `0.00000 / 0.00003` |

- **Dynamic Action Attachment Errors (`M_joint * M_socket * M_offset` vs. actual world matrix):**
  - During `aim`: `saber: 1.2413e-16 m`, `rifle: 1.2413e-16 m`, `shield: 4.6148e-16 m`
  - During `swing`: `saber: 0.0000e+0 m`, `rifle: 0.0000e+0 m`, `shield: 2.3693e-16 m`

---

## 6. Visual Captures & Interpenetration Observations

Saved screenshots in `docs/results/`:
- Bind pose loadouts:
  - `docs/results/sentinel-bind-unarmed.png` (`rightHand = 'none'`, `shield = false`)
  - `docs/results/sentinel-bind-saber.png` (`rightHand = 'saber'`, `saberBlade = true`, `shield = true`)
  - `docs/results/sentinel-bind-saber-hilt.png` (`rightHand = 'saber'`, `saberBlade = false`, `shield = true`)
  - `docs/results/sentinel-bind-rifle.png` (`rightHand = 'rifle'`, `shield = true`)
- Actions & close-ups:
  - `docs/results/sentinel-action-swing.png` (mid-swing with beam saber + shield)
  - `docs/results/sentinel-action-aim.png` (raised rifle aiming pose + shield support)
  - `docs/results/sentinel-shield-closeup.png` (left forearm shield close-up)

### Weapon–Body Proximity & Interpenetration Assessment
1. **Shield (`leftForearmSocket`):** With `position = [0.042, -0.045, 0.015]` and `scale = 0.54`, the shield clears the left forearm and shoulder pauldron in bind pose, `aim`, and `swing`. At extreme inward left-elbow flexion ($>75^\circ$) combined with high left-shoulder pitch ($>55^\circ$), the upper inner bevel of the shield can graze the outer edge of the left shoulder pauldron by $\sim 1\text{–}2\text{ cm}$.
2. **Rifle (`rightHandSocket`):** In both bind pose (`sentinel-bind-rifle.png`) and `aim` (`sentinel-action-aim.png`), the rifle stock and barrel remain completely outside the forearm, chest, and thigh armor.
3. **Beam Saber (`rightHandSocket`):** The hilt (`saberHilt`) sits cleanly inside the right fist and the blade (`saberBlade`) extends forward along local $+Z$ without intersecting the right leg or torso in bind pose or across the `swing` trajectory.
