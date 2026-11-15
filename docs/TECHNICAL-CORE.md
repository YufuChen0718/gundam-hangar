# Technical Core: methods, class links, evaluation

> Updated Nov 15 based on GSI (Kevin) feedback on the proposal. **The proposal webpage itself is unchanged**; this file decides *where we spend our time*.

## What the feedback means for us

| Feedback | What we do |
|---|---|
| Show understanding of graphics techniques, not a feature-rich app built on high-level APIs | Implement the core algorithms ourselves and replace high-level Three.js features where they hide the concept (e.g. skinning). Fewer UI features, presets and buttons. |
| Connect what we built to what is taught in class | Every method below lists its CS184 link. The milestone and final reports are organized by these methods. |
| Section 2.2 (custom animation pipeline) is the right model | Every method = **what we implemented + how we evaluated it (numbers / plots / before-after images)**. |
| Proposal was hard to read because of the agent | Reports and slides are **written by us**: short sentences, one idea per paragraph, figures first. AI may help with structure or grammar, not with generating the prose. See "Writing rules" below. |

## The method list

Priority: **Must** = needed for a strong final; **Should** = do if Must is on track; **Could** = only with spare time.

| # | Method (what we implement) | CS184 link | Evaluation | Priority | Card | Status |
|---|---|---|---|---|---|---|
| M1 | **Skin weights on the mesh**: weights computed on original vertex indices, shared across part boundaries, narrow blend bands at joints, connected-component cleanup | Mesh representation and connectivity (hw2 MeshEdit) | Seam gap across test poses (mm); before/after crack images | Must | T13 | ✅ right arm, ⬜ full body |
| M2 | **Full-body hierarchical FK + joint limits** (~15 joints, pelvis root, feet stay on platform) | Transforms, hierarchical modeling, forward kinematics | Limit-violation test; pose gallery | Must | T13 | ⬜ |
| M3 | **Our own Linear Blend Skinning** in a custom vertex shader (replaces `SkinnedMesh` skinning) | Transforms, rasterization pipeline / vertex processing | Per-vertex difference vs Three.js result (should be ~0); rigid-parts vs LBS images at elbow/shoulder | Must | T14 | ⬜ |
| M4 | **Keyframe interpolation**: piecewise slerp + easing (done) → **quaternion spline** (squad or Catmull-Rom style) | Animation: keyframing, splines, rotation interpolation / quaternions | Angular-velocity plot: slerp has kinks at keys, spline is C1-smooth | Must | T15 | ✅ slerp, ⬜ spline |
| M5 | **Pose blending / transitions** between actions (idle / aim / swing, now whole-body) | Animation | Joint-angle curves: cut vs blend | Must | T07 | ⬜ |
| M6 | **Attachment transforms** `M_world = M_joint · M_socket · M_offset` for rifle / beam saber / shield | Transforms, coordinate frames | Socket error across poses; grip images | Must | T04 | ✅ rifle, ⬜ 2nd weapon |
| M7 | **Two-bone analytic IK**: arm aims rifle at a target point, or knees bend while feet stay planted | Kinematics: inverse kinematics | End-effector error; foot-slide distance with vs without IK | Should | T16 | ⬜ |
| M8 | **Region recolor via mask texture** in a custom fragment shader | Texture mapping, shading | Before/after images | Could | T05 | ⬜ |
| M9 | **Dual quaternion skinning** vs LBS | Quaternions, skinning | Volume loss / "candy-wrapper" on twisted joints | Could | n/a | ⬜ |
| M10 | Rendering performance | Rendering pipeline | Median / p95 frame time vs triangle count & shadows | Should | T11 | ⬜ |

**Lower priority (still in proposal, keep minimal):** desktop UI polish, color presets, backpack, Vision Pro (open the deployed page in Safari, make buttons usable, record what works; done in Week 4, about half a day).

**Still out of scope:** walking/locomotion, full-body IK, physics, multiplayer.

## What each report section should look like (template)

For each method, in the milestone/final report:
1. **Problem** (1–2 sentences, with an image if possible)
2. **Method**: what we implemented, the key equation or algorithm step, what is ours vs. what the library does
3. **Class link** (1 sentence)
4. **Evaluation**: one plot or before/after figure + one number
5. **Limitations** (1 sentence)

## Writing rules (milestone, final, slides)

- Write it yourselves. A reader should never feel a page was generated.
- Short sentences. No filler ("robust", "seamless", "cutting-edge", "comprehensive").
- Figures first, text explains the figure.
- One method = one section using the template above.
- Every number has a unit and says how it was measured.
