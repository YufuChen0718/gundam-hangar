# T15 · Quaternion spline interpolation (method M4)

**Goal:** show why piecewise slerp is not enough and implement a smooth (C1) rotation spline.

## To do
- Keep the current piecewise slerp + easing as the baseline
- Implement a quaternion spline across keyframes: **squad** (Shoemake) or a Catmull-Rom-style construction with intermediate control quaternions; handle quaternion sign flips (q vs -q)
- Per-clip setting: `interpolation: 'slerp' | 'spline'`
- Unit tests: passes through every keyframe; continuous at keys; same result at different frame rates

## Evaluation output
- Plot angular velocity of one joint (e.g. right shoulder) over a clip for slerp vs spline: slerp shows kinks at keyframes, spline is smooth
- Export CSV to `docs/results/`, plot with a small script

## Acceptance criteria
- [ ] Spline mode plays all clips without pops or flips
- [ ] Plot clearly shows the difference
- [ ] Tests pass
