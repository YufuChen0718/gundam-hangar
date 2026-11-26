# T16 · Two-bone analytic IK: evaluation

Method M7. Two uses on the Sentinel rig (`gundam-sentinel.glb`):

- **Aim IK:** shoulder → elbow → wrist. The right hand reaches a target the user drags in the viewport.
- **Foot planting:** hip → knee → ankle on both legs. The pelvis lowers by a crouch depth and each ankle stays where it was planted.

Reproduce with `npm run dev -- --port 5174`, then `npm run check:ik`. The browser check runs headless Chrome on the real rig.

## Method

### The solver: `src/animation/ik.ts`

Pure Vector3/Quaternion math, shared by the arm and both legs.

1. **Law of cosines → mid-joint bend.** The target distance `c` from the root joint (shoulder or hip) fixes how far the mid joint (elbow or knee) must bend.
   - The textbook form is c² = a² + b² − 2ab·cos(interior angle). Here, bend = π − interior angle.
   - The real asset is slightly bent in its bind pose, and its hinge is not exactly perpendicular to the bones. So we use the generalized form on the bone components perpendicular to the hinge **h**:
     - c² = A − 2B·cos(ψ₀ + bend)
     - A = |s|² + |f|² − 2(s·h)(f·h)
     - B = |s⊥||f⊥|
     - s and f are the two bone vectors measured from the mid joint, and ψ₀ is the bind angle between s⊥ and f⊥.
   - For a straight bind with a perpendicular hinge, this reduces to the textbook form. The unit tests check that case: reach = [√(a²+b²), a+b] for a 90° limit.
2. **Joint limits and reach clamp.** The bend is restricted to the T13 hinge limits: elbow [0°, 90°], knee [0°, 55°]. This turns the limits into a reach range [minReach, maxReach]. The target distance is clamped into that range.
   - Too far: the chain straightens as far as the limit allows and points at the target.
   - Too close: the mid joint stops at its bend limit.
3. **Root rotation and pole vector.**
   - First, a rotation turns the bind root→end direction onto root→target.
   - Then a twist about root→target turns the bind-frame "mid-joint side" direction onto the pole direction. The pole direction is the pole's offset from the root→target line.
   - So root, target, pole and the mid joint always lie in one plane, and the mid joint bends toward the pole.
   - The side direction is the mid joint's actual offset from the root→end line. It blends to `sideSign · (root→end × hinge)` when the chain is nearly straight. Because of this, a skewed hinge does not add extra twist.
4. **No flips.** Near full extension, both bend branches can be valid. The solver then keeps the branch nearest to last frame's bend. If the pole lies on the root→target line, it reuses last frame's pole direction.
5. **3D root limits.** A swing–twist decomposition about the bone axis limits the root:
   - shoulder: swing cone 110°, twist ±60°;
   - hip: swing cone 75°, twist ±25°.

### Integration: `src/animation/animator.ts`

Each frame, `apply()` runs in this order:

1. FK clip or manual pose.
2. Pelvis grounding.
3. **Foot planting.** The pelvis is lowered by crouch × weight. Both legs are solved toward the planted ankle positions. Each ankle is re-oriented to its planted orientation, so the foot stays flat.
   - The knee pole lies in the FK leg's own bend plane. With zero crouch, IK therefore reproduces the FK legs exactly.
4. Skirt FK, which follows the solved hip angles.
5. **Arm IK.** It runs last, in this frame's torso space.

Both IK layers blend from the FK pose with the same 0.3 s smoothstep ramp used for clip transitions (instant in Cut mode). `this.pose` is left untouched, so turning IK off ramps back to the clip.

### Body follow, knee control and Squat

**Dragging a foot.** The user drags an ankle (green marker) in its leg's own swing plane: the plane through the hip that contains the hip→ankle line and the body's forward axis. So a foot steps forward/back or lifts (up along the slanted leg) and never splays sideways. It cannot go below the floor. Past what the limits allow, the handle snaps back onto the foot.

**Joint limits.**

| joint | limit |
|---|---|
| Knee | [0°, 55°] (JOINT_LIMITS) |
| Hip | anatomical elliptical swing–twist limit: pitch in JOINT_LIMITS [−20°, 45°], sideways swing ±12° (ellipse (pitch/P)² + (side/S)² ≤ 1), twist ±15° (`clampSwingEllipse`) |
| Ankle | pitch in JOINT_LIMITS [−25°, 35°], plus ±8° yaw and ±12° roll |

The ankle keeps the foot flat. The extra yaw is needed because the legs slant outward (ankles at ±0.32 m, hips at ±0.145 m), so the knee hinge is tilted and bending it turns the foot about the vertical by up to 6.8°. With these limits the feet stay flat and straight (0° tilt) through the whole crouch.

These limits cap a lifted foot at about 11 cm up and 16 cm forward. A real high knee needs more hip flexion and knee bend than T13 allows (T13 set those limits against armor clipping).

**Body follow.** The body follows the feet, as a production leg rig does. Only feet on the ground support the body: a foot's support weight g fades from 1 to 0 as it is lifted 0–4 cm. Each term is scaled by the IK weight.

- **Pelvis yaw.** With both feet down, the pelvis follows 30% of the angle the foot-to-foot line has turned about +Y since planting:
  - ψ = atan2((r × n)·ŷ, r·n), where r is the planted (rest) foot-to-foot vector and n is the current one;
  - the result is clamped to ±10°;
  - the torso turns 60% of that back, so the chest keeps facing forward.
- **Pelvis shift.** The pelvis slides toward the g-weighted support point: 40% fore–aft, 12% sideways (the stance is wide). Lifting one foot shifts the weight onto the other.
- **Pelvis height (closed form).** For hip H and planted ankle A:
  - h is the horizontal distance and v = H.y − A.y;
  - a leg can reach when (v − drop)² + h² ≤ R², where R is the maximum reach;
  - so the pelvis is lowered by drop = max(requested, maxᵢ gᵢ(vᵢ − √(R² − hᵢ²))).

  Only grounded feet count, so a lifted foot never pulls the body down.
- **Knee control.** Each leg's knee pole (purple marker) can be dragged, and the knee bends toward it, within the ±15° hip twist limit. "Re-plant feet · reset knees" returns the poles to automatic.
- **Squat action.** Clip keyframes have a new `pelvisDrop` channel, sampled with the same easing and transition blend as the joints. The squat keys only the pelvis height (0 → 0.08 m → hold → 0) plus the arms and head, and the leg IK solves the legs. This is the usual "animate the root, IK the feet" setup.
  - Playing it plants the feet at the current stance and turns Leg IK on at full weight. That causes no jump, because IK reproduces FK at rest.
  - The FK legs stay at the standing angles, because bent FK legs would also lower the pelvis through grounding, so the drop would be applied twice.

## Results (real rig, headless Chrome, seed 184)

Raw data:

- `t16-ik-reachable.csv`, `t16-ik-unreachable.csv`, `t16-ik-sweep.csv`
- `t16-foot-crouch.csv`
- `t16-ik-summary.json`

Screenshots: `t16-ik-reach-forward.png`, `t16-ik-reach-up.png`, `t16-foot-crouch.png`.

### Arm chain

| | value |
|---|---|
| Upper arm / forearm length | 0.2602 m / 0.2957 m |
| Reach range at the elbow limit [0°, 90°] | [0.3300, 0.5401] m |

### End-effector error, reachable targets (500)

Targets come from our own FK, using a random shoulder swing and twist inside the limits and a random elbow bend. The pole is placed beside the sampled elbow.

| count | limited | mean | median | p95 | max | < 1 mm |
|---|---|---|---|---|---|---|
| 500 | 0 | 1.7e-16 m | 1.4e-16 m | 3.5e-16 m | **7.6e-16 m** | 100 % |

### Unreachable targets (200 too far + 200 too close)

- **Too far (2 × maxReach):** we measure the error against the closest reachable point on the shoulder→target ray.
  - 50 of the 200 directions lie inside the shoulder cone. For those, the max error is **5.7e-16 m**, so the arm straightens and points exactly at the target.
  - The other 150 directions lie outside the 110° cone, for example behind the back. There the shoulder limit clamps the result, which is intended (median 0.118 m).
- **Too close (0.3 × minReach):** the elbow stops exactly at its bend limit (bend error 0 rad).

### Smoothness through full extension

The target moves along a fixed direction from 0.297 m to 0.702 m (240 steps) and passes full extension at 0.540 m.

- **Elbow bend:** decreases monotonically, with no flip.
- **Elbow step size:** at most 1.98° per step.
- **Shoulder step size:** at most 2.99° per step.

Both step sizes grow smoothly toward full extension, because the bend changes like √Δc there. Past the clamp they drop to ≈ 0.03°, so there is no jump.

### Foot planting: foot slide during a crouch

| | value |
|---|---|
| Thigh + shin reach range at the knee limit [0°, 55°] | [0.8173, 0.9119] m |
| Deepest crouch the planted legs can hold | **0.095 m** pelvis drop |

The comparison uses the same pelvis drops for both rows. The FK row uses the existing "Crouch" pose family (hip = ankle = knee/2, knee from 0° to 55°), with the pelvis grounding fixing only height.

| | max ankle displacement from standing | foot tilt |
|---|---|---|
| FK crouch + grounding (no IK) | **92.8 mm** (horizontal slide) | – |
| Foot planting IK (27 of 28 drops reachable) | **3.2e-16 m** | 0° |

**Squat clip (real rig, browser):** the pelvis reaches the keyed 0.08 m drop. Over the whole clip in Blend mode, both ankles stay within **4.5e-16 m** of their planted positions, and the clip ends in idle with zero drop.

**Foot lift (real rig, real mouse drag in Side view):** the right foot rises 10.9 cm and moves 11.5 cm forward. The knee bends to its 55° limit with the hip at 41° pitch. The pelvis shifts 3.8 cm onto the stance foot. After the handle snaps, the ankle error is 1e-16 m. There are no console errors.

The one unreachable row is the FK pose at knee 55°. Its 0.102 m drop is only possible in FK because the ankles slide 93 mm forward. With the ankles pinned, the 55° knee limit stops the crouch at 0.095 m, so the legs clamp and the status line shows "Too deep · legs clamped".

## Acceptance criteria

- [x] **Target follows smoothly, no flips at full extension.** Shown by the sweep above, by the unit tests (`tests/ik.test.ts`, 2000-step sweeps including a two-branch case), and by dragging in the viewport.
- [x] **Error numbers recorded in `docs/results/`.** This file plus the CSV and JSON files.
- [x] **Read-only sliders while IK is on.** The right shoulder and elbow sliders are read-only while arm IK is on, and the hip, knee and ankle sliders are read-only while foot planting is on.

## Method explanation (2–3 sentences, for the report)

Given the target position, the law of cosines gives the elbow (or knee) bend directly: the root-to-target distance c must equal the distance the two bones span at that bend, c² = A − 2B·cos(ψ₀ + bend). Here A and B come from the bone vectors, and the formula is generalized because our bind pose is slightly bent. The pole vector then removes the one remaining degree of freedom, which is the spin of the arm about the shoulder→target line: we rotate the chain so that the elbow lies in the plane spanned by the shoulder, the target and the pole. Targets out of reach are clamped to the nearest distance the joint limits allow. For the legs, the same solver keeps each ankle at its planted position while the pelvis lowers, which removes the 93 mm foot slide of the FK crouch.

## Known limitations

- **End effector:** the end effector is the wrist joint, not the rifle grip.
- **Wrist:** the wrist (±25° about Z) is not solved, so the barrel does not aim at the target.
- **Self-collision:**
  - There is no self-collision handling. Near the edge of the 110° shoulder cone, the upper arm or the rifle can pass through the chest and head armor (see `t16-ik-reach-forward.png`).
  - During a deep crouch, the thighs can pass through the front skirts.
- **Crouch depth:** with the ankles pinned, the knee limit caps the crouch at 0.095 m.
- **Planted feet stay put:** they do not move with the clip (for example during Swing). Use "Re-plant feet" to plant them again at the current pose.
