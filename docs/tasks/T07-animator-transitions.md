# T07 · Animation state machine and transitions

**Goal:** three actions can be played, interrupted, and switched, with smooth transitions.

## To do
- Add to `clips.ts`:
  - `aim` (not looping, holds the last frame): right arm raised forward, left arm supporting, torso slightly twisted
  - `swing` (not looping, `next: 'idle'`): wind-up overhead → fast downward cut → follow-through → automatically return to idle
  - Weapon direction depends on the sum of shoulder + elbow + wrist angles; when aiming, the wrist must bend so the barrel points forward
- `src/animation/animator.ts`:
  - states: playing / transitioning / holding
  - `play(action)`: **snapshot the current displayed pose** → over `transitionDuration` (about 0.3 s), slerp from the snapshot toward the new clip
  - `transitionMode: 'blend' | 'cut'` (cut = jump directly, used as the comparison in evaluation)
  - when a non-looping clip ends, go to `next` if it has one, otherwise hold
  - expose `action`, `status`, `jointAngleDeg(joint)` (for T11)

## Acceptance criteria
- [ ] Switching to aim in the middle of a swing has no pop in blend mode, and visibly jumps in cut mode
- [ ] Swing returns to idle by itself, with a continuous transition
- [ ] With the weapon equipped, the barrel/blade orientation looks right in every action
