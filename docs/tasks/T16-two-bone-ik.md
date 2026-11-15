# T16 · Two-bone analytic IK (method M7, Should)

**Goal:** solve joint angles from a target position instead of authoring them by hand.

## To do (pick one use first)
- **Aim IK:** shoulder–elbow chain places the rifle hand at a target point the user drags around; wrist orients the barrel toward the target
- **Foot planting:** when the pelvis lowers (crouch / swing stance), hip–knee chain keeps each ankle at its planted position
- Analytic two-bone solution (law of cosines) + pole vector for the bend plane; respect T13 joint limits; handle unreachable targets (clamp)

## Evaluation output
- End-effector error over many random reachable targets (should be ≈ 0)
- Foot-slide distance with vs without IK during a crouch (if foot planting)

## Acceptance criteria
- [ ] Target follows smoothly, no flips at full extension
- [ ] Error numbers recorded in `docs/results/`
