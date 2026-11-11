# T06 · Keyframe sampling + idle animation

**Goal:** implement time-based keyframe evaluation ourselves (graded work: **do not** use THREE.AnimationMixer / KeyframeTrack).

## To do
- `src/animation/clips.ts`: `Clip` / `Keyframe` data structures (ARCHITECTURE §4); first write only `idle` (looping, about 3 s, slight sway)
- `src/animation/samplePose.ts`:
  - preprocessing: convert each keyframe's Euler angles (degrees) into quaternions; a joint missing from a key = bind pose
  - given time t: loop wraps / non-loop clamps → find the adjacent keyframes → normalize to u → apply that segment's easing (linear / easeIn / easeOut / easeInOut) → `slerp`
- Applying to joints: `joint.quaternion = bindPose[j] × sampled[j]`
- Rely only on `dt` (seconds), not on frame rate

## Acceptance criteria
- [ ] Idle loops seamlessly (no jump at the loop point)
- [ ] When the frame rate is artificially lowered (e.g. a forced dt of 0.1), the animation speed stays the same
- [ ] Switching between linear and easeInOut shows a visible difference in feel
