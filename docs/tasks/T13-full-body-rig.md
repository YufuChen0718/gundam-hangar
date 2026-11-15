# T13 · Full-body rig + FK + joint limits (methods M1, M2)

**Goal:** the whole Gundam can be posed, not just the right arm, with no seams opening.

## To do
- Generalize `scripts/prepare_mecha.py` from the right arm to ~15 joints:
  pelvis (root) → torso → head; L/R shoulder → elbow → wrist (+ hand sockets); L/R hip → knee → ankle
- Keep the shared-vertex-weight method: weights on original vertex indices, narrow blend bands, rigid armor interiors, connected-component cleanup
- Per-joint rotation limits in `src/mecha/rigConfig.ts` (e.g. knee bends one way only); clamp in the FK update
- Seam check on ≥ 8 full-body test poses (both arms, torso twist, crouch); export fails above threshold
- Viewer: joint sliders for every joint, grouped by body part; "Reset pose"
- Feet stay on the platform. No locomotion, no IK in this card

## Evaluation output (save in `docs/results/`)
- Seam gap table for all test poses
- Pose gallery screenshots (front / side)
- One sentence per limitation (where it still deforms or intersects)

## Acceptance criteria
- [ ] Every joint can be posed from the viewer
- [ ] All test poses pass the seam check
- [ ] Moving the pelvis moves the whole body; feet do not leave the platform in the test poses
