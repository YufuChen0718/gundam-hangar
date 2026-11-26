# T16 · Two-bone IK: step-by-step implementation guide

Companion to [T16-two-bone-ik.md](T16-two-bone-ik.md) (scope and acceptance criteria). This file explains *how* to build it on the current codebase.

## Before you start: one rig constraint and one formula fix

### 1. Every joint in this rig turns about only one axis

See `jointAngleToEuler` in [src/mecha/rigConfig.ts](../../src/mecha/rigConfig.ts): the shoulder only pitches about X, and the elbow and knee are hinges. `apply()` in [src/animation/animator.ts](../../src/animation/animator.ts) reduces each joint back to that one angle whenever it clamps a limit. `angles()` and the sliders also store one number per joint.

- **Leg (foot planting):** hip pitch plus knee is a flat, 2D problem in the leg's side-view plane, so the current rig already fits it.
- **Arm (hand reaches a 3D point, with a pole vector):** the shoulder needs full 3D rotation. A 1-axis shoulder can only reach points inside one plane, and a pole vector would have nothing to control.

**Recommendation:** do the arm first, since it's what the work plan and the GIF ask for. Give `rightShoulder` a full-rotation mode that is only used while IK is on. Keep the elbow as a hinge, because a hinge is exactly what two-bone IK assumes.

### 2. The cosine law gives the inside angle, not the slider angle

cos θ = (a² + b² − c²) / 2ab gives the **interior** angle at the elbow, and that is π when the arm is straight. The elbow slider measures **bend**, where 0 means straight, so:

```
interior = acos(clamp((a² + b² − c²) / 2ab, −1, 1))
bend     = π − interior     // this is what goes into rightElbow
```

The bend limit [0°, 90°] also limits how close a target can be. If the arm is straight in the bind pose:

- the closest reachable distance is c_min = √(a² + b²), at 90° bend;
- the farthest is c_max = a + b.

Clamp c into [c_min, c_max − ε] before solving. Keeping c slightly below a + b avoids NaN and a flip at full extension.

---

## Step 0: set up

```sh
git switch prince && git pull
git switch -c anim/T16-two-bone-ik      # or keep working on prince if the team prefers
npm ci
```

Read `AGENTS.md` and `docs/tasks/T16-two-bone-ik.md`. Do only T16 in this session.

## Step 1: measure the arm (about 15 minutes, don't skip)

Run `npm run dev`, open the browser console, and use `window.__hangar.diagnostics().jointWorldPositions` in the bind pose to get:

- `a = |elbow − shoulder|` and `b = |wrist − elbow|`. From the pivot heights, a should be about 0.24 m.
- whether shoulder → elbow → wrist is already slightly bent in the bind pose. If it is, use the real bind vectors and measure the bend from that rest angle.
- the elbow's hinge axis (its local X axis) expressed in the torso's frame. Turn on "Joint axes" in the Inspect tab and bend the elbow to see which way positive bend goes.

## Step 2: write the solver as a pure function in `src/animation/ik.ts`

Use only `Vector3` and `Quaternion`, with no rig or scene. Work in the frame of the shoulder's parent (the torso), so torso twist and `rotateModel` are handled automatically.

```ts
// Inputs, all in shoulder-parent space: S, E, W (bind positions), target T, pole P
// Output: shoulder rotation offset (quaternion) and elbow bend (deg)
1. a = |E−S|, b = |W−E|, c = clamp(|T−S|, cMin, cMax − 1e-4)
2. bend   = π − acos(clamp((a²+b²−c²)/(2ab), −1, 1))
   alpha  = acos(clamp((a²+c²−b²)/(2ac), −1, 1))        // angle at the shoulder
3. d = normalize(T − S)
   n = normalize(cross(d, P − S))                         // normal of the bend plane = elbow hinge axis
   if |cross(d, P−S)| ≈ 0 → reuse last frame's n           // stops flips when the pole is in line with the target
4. u = d rotated by alpha about n (toward the pole)       // new upper-arm direction
5. Shoulder: build frames from (u0, n0) in bind and (u, n) now:
     R_bind = basis(u0, n0, u0×n0),  R_new = basis(u, n, u×n)
     q_delta = R_new · R_bind⁻¹                              // rotation in parent space
     q_local = q_delta · bindLocal;  offset = bindLocal⁻¹ · q_local
6. Elbow: offset = jointAngleToEuler("rightElbow", bend°) // check the sign against Step 1
```

Before slerping or blending, flip the sign of the quaternion if its dot product with the previous one is below 0, so it never takes the long way round.

## Step 3: unit tests in `tests/ik.test.ts` (no GLB needed)

Use a synthetic chain with the a and b measured in Step 1:

- **Error for reachable targets:** pick a random shoulder rotation and elbow bend within limits, run FK to get a target, solve, then run FK again. Over about 1,000 trials, the wrist-to-target error should be ≈ 0 (< 1e-6 m).
- **Unreachable target:** if the target is too far, the arm is straight and points at it. If it's too close, the elbow bend is 90°.
- **No flip near full extension:** move the target outward step by step through c = a + b. The elbow angle should change smoothly with no sign jump.
- **Pole vector:** the elbow should end up on the same side of the shoulder-to-target line as the pole.
- **Re-check the existing tests:** `npm test` still passes all 14.

## Step 4: connect it to the `Animator`

Add an IK layer in [src/animation/animator.ts](../../src/animation/animator.ts) that runs after the clip is sampled and before `apply()`:

- Add `ikEnabled`, `ikTarget` (in `displayRoot` space), `ikPole`, and `ikWeight`.
- On each update: sample the clip, compute the IK offsets, then slerp the shoulder and elbow from the clip pose toward the IK pose by `ikWeight`. Ramp `ikWeight` from 0 to 1 over 0.3 s with smoothstep, the same blend already used for transitions, so switching IK on doesn't snap the arm.
- In `apply()`, don't reduce the shoulder to one angle while IK drives it. Replace the pitch limit with a cone limit, for example at most 100° from bind plus a twist limit. Leave the other joints unchanged.
- Recompute the solve when the torso moves, because the target is converted into torso space.

## Step 5: commands, state and UI (UI only calls commands)

- **State:** add `ik: boolean` and `ikTarget: [x, y, z]` to `HangarState` in [src/app/state.ts](../../src/app/state.ts).
- **Commands:** add `setIkEnabled(on)`, `setIkTarget(x, y, z)` and `setIkPole(...)` in [src/app/commands.ts](../../src/app/commands.ts).
- **Scene:** a small target sphere and a pole marker, plus an optional line from shoulder to target.
- **Moving the target:** the simplest option is three X/Y/Z sliders. For the GIF, drag on a camera-facing plane with a raycaster and turn off `OrbitControls` while dragging. Ask the team before using `TransformControls`: it's a Three.js add-on like OrbitControls, but ARCHITECTURE.md doesn't list it.
- While IK is on, disable the `rightShoulder` and `rightElbow` sliders, or show them read-only, because they can't represent a 3D shoulder.

## Step 6: evaluation for `docs/results/`

- **Error on the real rig:** in a Node test, or as an extra step in `scripts/browser-check.mjs`, load `gundam-sentinel.glb`. Solve for about 500 random reachable targets and measure |wrist world position − target|.
  - Save the raw rows as `t16-ik-error.csv` and the median, max and percentage under 1 mm in `t16-evaluation.md`.
  - Also record the clamped distance for unreachable targets.
- **Smoothness:** move the target along a path that passes full extension. Plot elbow angle against time to show there are no flips.
- **Recording:** a screen recording or GIF of dragging the target while the hand follows.
- **Write-up:** 2–3 sentences written by the team, as TECHNICAL-CORE.md requires: how the cosine law gives the elbow bend, and how the pole vector fixes the plane the elbow bends in.

## Step 7 (optional, only if time is left): foot planting

- During a crouch, lower the pelvis by a set amount. Solve hip pitch and knee in 2D so each ankle stays where it was planted. The current rig already supports this.
- Compare how far the ankle slides sideways with IK and without it. The current pelvis adjustment only fixes height, so some sideways sliding is likely.

## Step 8: wrap up (required by AGENTS.md)

- `npm run build` passes with no type errors, `npm test` passes, and `node scripts/browser-check.mjs` reports no console errors. That script defaults to port **5174**, so set `HANGAR_URL` if the dev server runs on 5173.
- Go through the acceptance criteria one by one: "Target follows smoothly, no flips at full extension" and "Error numbers recorded in `docs/results/`".
- Add an entry to `docs/progress.md`, and list any tutorial followed in `docs/asset-sources.md`.
- Commit with the `anim:` prefix and no AI co-author line, then open a PR from your own account.

## Known limitation to mention in the report

The wrist only rotates ±25° about Z, so the rifle can't fully point at the target. Either leave that out of scope or treat it as a third, limited solve after the arm.
