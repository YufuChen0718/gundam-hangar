# T13 Evaluation — 15-Joint Full-Body Rig, FK, and Joint Limits (M1, M2)

## 1. Rig Summary

- **Source asset:** `assets-src/mecha-original.blend` (9,944 triangles, 4,913 unique vertices)
- **Processed outputs:** `assets-src/mecha-right-arm.blend`, `public/assets/models/mecha-right-arm.glb`
- **Skeleton hierarchy (15 joints rooted at `pelvis`):**
  - `pelvis` (root) → `torso` → `head`
  - `torso` → `rightShoulder` → `rightElbow` → `rightWrist` → `rightHand` (socket)
  - `torso` → `leftShoulder` → `leftElbow` → `leftWrist` → `leftHand` (socket)
  - `pelvis` → `rightHip` → `rightKnee` → `rightAnkle`
  - `pelvis` → `leftHip` → `leftKnee` → `leftAnkle`
- **Mesh parts (17 non-overlapping parts, 9,944 total triangles preserved):**
  `waistPart` (1,639), `chestPart` (1,158), `headPart` (722), `rightUpperArm` (478), `rightForearm` (215), `rightPalm` (159), `leftUpperArm` (515), `leftForearm` (229), `leftPalm` (240), `rightThigh` (382), `rightShin` (233), `rightFoot` (733), `leftThigh` (362), `leftShin` (228), `leftFoot` (625), `rifle` (1,324), `shield` (702).
- **Shared boundary groups across all 16 skinned body/shield parts:** 367 vertex groups.

---

## 2. Seam Gap & Platform Grounding Table (9 Full-Body Test Poses)

Threshold required by T13: maximum seam separation $< 10^{-5}\text{ m}$ ($0.01\text{ mm}$).

| # | Pose ID | Pose Description | Active Joints (deg) | Shared Boundary Groups | Blender Max Seam Gap (mm) | Browser WebGL Max Seam Gap (mm) | Rifle Socket Error (mm) | Pelvis Y Offset (m) | Left / Right Foot Min Y (m) | Status |
|---|---------|------------------|---------------------|------------------------|---------------------------|---------------------------------|-------------------------|---------------------|-----------------------------|--------|
| 1 | `bind` | Bind / Rest Pose | All 15 joints at `0°` | 367 | `0.000060` | `0.000046` | `0.000000` | `0.0000` | `0.0000 / 0.0079` | PASS |
| 2 | `rightArmAim` | Right Arm Rifle Aim | `rShoulder: 30, rElbow: 55, rWrist: 10` | 367 | `0.000243` | `0.000046` | `0.000000` | `0.0000` | `0.0000 / 0.0079` | PASS |
| 3 | `leftArmGuard` | Left Arm Shield Guard | `lShoulder: 35, lElbow: 65, lWrist: -15` | 367 | `0.000060` | `0.000046` | `0.000000` | `0.0000` | `0.0000 / 0.0079` | PASS |
| 4 | `dualArmReady` | Both Arms Combat Ready | `rArm: (45, 75, 15), lArm: (40, 60, -15)` | 367 | `0.000129` | `0.000046` | `0.000000` | `0.0000` | `0.0000 / 0.0079` | PASS |
| 5 | `torsoTwist` | Pelvis & Torso Counter-Twist | `pelvis: -15, torso: 30, head: -25, rArm: (20, 40, 0), lArm: (20, 35, 0)` | 367 | `0.000137` | `0.000046` | `0.000000` | `0.0000` | `0.0000 / 0.0079` | PASS |
| 6 | `crouch` | Symmetric Tactical Crouch | `hips: 22, knees: 44, ankles: 22, rArm: (25, 45, 0), lArm: (20, 40, 0)` | 367 | `0.000045` | `0.000046` | `0.000000` | `-0.0499` | `0.0000 / 0.0079` | PASS |
| 7 | `deepCrouchAim` | Deep Crouch + Dual Arm Aim/Guard | `hips: 32, knees: 64, ankles: 32, torso: 15, head: -15, rArm: (50, 80, 15), lArm: (40, 70, -10)` | 367 | `0.000153` | `0.000046` | `0.000000` | `-0.1041` | `0.0000 / 0.0079` | PASS |
| 8 | `fullBodyTwistCrouch` | Full-Body Twist + Crouch + Both Arms | `pelvis: 20, torso: -30, head: 25, hips: 18, knees: 36, ankles: 18, rArm: (40, 65, -10), lArm: (30, 55, 15)` | 367 | `0.000249` | `0.000046` | `0.000000` | `-0.0335` | `0.0000 / 0.0079` | PASS |
| 9 | `maxArticulation` | All 15 Joints Active Near Limits | `pelvis: -25, torso: 35, head: -35, rArm: (55, 85, 20), lArm: (55, 80, -20), hips: 30, knees: 60, ankles: 30` | 367 | `0.000128` | `0.000046` | `0.000000` | `-0.0918` | `0.0000 / 0.0079` | PASS |

---

## 3. Pose Gallery Screenshots (Front & Side)

Saved in `docs/results/`:
- **Bind Pose (`bind`):** `pose-gallery-front-bind.png`, `pose-gallery-side-bind.png`
- **Both Arms Combat Ready (`dualArmReady`):** `pose-gallery-front-dualArmReady.png`, `pose-gallery-side-dualArmReady.png`
- **Symmetric Tactical Crouch (`crouch`):** `pose-gallery-front-crouch.png`, `pose-gallery-side-crouch.png`
- **Deep Crouch + Aim/Guard (`deepCrouchAim`):** `pose-gallery-front-deepCrouchAim.png`, `pose-gallery-side-deepCrouchAim.png`
- **Full-Body Twist + Crouch (`fullBodyTwistCrouch`):** `pose-gallery-front-fullBodyTwistCrouch.png`, `pose-gallery-side-fullBodyTwistCrouch.png`
- **Max Articulation (`maxArticulation`):** `pose-gallery-front-maxArticulation.png`, `pose-gallery-side-maxArticulation.png`
- **17-Part Segmentation & 15-Joint Axes Overlay:** `viewer-parts.png`

---

## 4. Known Limitations (One Sentence Each)

1. Two-ring transition bands around the 15 joints stretch slightly at extreme angles near joint limits to preserve $C^0$ surface continuity without opening seams.
2. Self-collision avoidance is not implemented, so front/side waist skirt armor and shoulder pauldrons can intersect adjacent thighs or upper arms when hips or shoulders pitch past approximately $35^\circ$.
3. Foot grounding shifts the pelvis vertically to keep the supporting foot soles planted on the platform during crouches, while full analytic two-bone leg IK and terrain targeting are deferred to T16.
4. All 17 mesh parts currently share the original packed 2K PBR texture atlas, with custom regional shader recoloring deferred to T05.
