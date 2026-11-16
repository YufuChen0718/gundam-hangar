# T07 Evaluation — Animation State Machine & Pose Blending Transitions (Method M5)

## 1. Method Overview

- **Model & Skinning Path:** 15-joint `gundam-rigged.glb` rendered with our custom `ShaderMaterial` Linear Blend Skinning (`src/mecha/lbs.ts`).
- **Whole-Body Action Clips (`src/animation/clips.ts`):**
  1. `idle` (`duration = 3.2 s`, `loop = true`): Whole-body breathing and gentle torso/pelvis sway with feet planted on the platform (`hip = θ, knee = 2θ, ankle = θ`).
  2. `aim` (`duration = 1.2 s`, `loop = false`, holds final pose): Raises the right arm forward (`rightShoulder: 36°, rightElbow: 58°, rightWrist: 14°`) so the rifle barrel points horizontally forward, brings the left shield arm up in support (`leftShoulder: 30°, leftElbow: 54°, leftWrist: -12°`), twists the torso (`pelvis: -12°, torso: 22°, head: -14°`), and drops into an athletic knee bend (`hips: 16°, knees: 32°, ankles: 16°`).
  3. `swing` (`duration = 1.8 s`, `loop = false`, `next = "idle"`): Whole-body slash with the rifle — overhead wind-up (`t = 0.45 s`: `rightShoulder: 60°, rightElbow: 82°, torso: -28°`) $\to$ fast downward strike (`t = 0.85 s`: `rightShoulder: -14°, rightElbow: 18°, torso: +32°, knees: 56°`) $\to$ follow-through (`t = 1.25 s`) $\to$ recovery (`t = 1.80 s`), automatically transitioning back to `idle`.
- **State Machine & Transition Blending (`src/animation/animator.ts`):**
  - States: `"playing" | "transitioning" | "holding"`.
  - When `play(action)` is called (or when a non-looping clip with `next` finishes):
    - The current displayed local joint quaternions are snapshotted: $q_{\text{snap}, j} = q_{\text{bind}, j}^{-1} \, q_{\text{joint}, j}(t_{\text{switch}})$.
    - In **`blend` mode** (`transitionDuration = 0.30 s`), each joint quaternion is interpolated from the snapshot pose toward the incoming clip's sampled pose $q_{\text{clip}, j}(t)$ using smoothstep $\alpha(u) = 3u^2 - 2u^3$ ($u = \mathrm{clamp}(\Delta t_{\text{blend}} / 0.30, 0, 1)$):
      $$q_j(t) = \mathrm{slerp}\big(q_{\text{snap}, j},\; q_{\text{clip}, j}(t),\; \alpha(u)\big)$$
    - In **`cut` mode**, the pose jumps directly to $q_{\text{clip}, j}(t)$ without blending.

---

## 2. Quantitative Evaluation: `idle → swing → aim` Switch (`blend` vs. `cut`)

We recorded `rightShoulder`, `torso`, and `rightKnee` joint angles $\theta_j(t)$ (deg) and backward-difference angular velocities $\omega_j(t) = (\theta_j(t) - \theta_j(t - \Delta t))/\Delta t$ (deg/s) at $\Delta t = 1/60\text{ s}$ ($60\text{ Hz}$) over $2.80\text{ s}$ across two action switches:
1. **`idle → swing` at $t = 0.60\text{ s}$** (step 36)
2. **`swing → aim` mid-swing interrupt at $t = 1.45\text{ s}$** (step 87, $0.85\text{ s}$ into `swing` at the peak of the downward strike)

### Peak Angular Velocity & First-Frame Jump Comparison

| Joint | Switch Event | `Cut` Instantaneous Angle Jump (deg in 1 frame) | `Blend` First-Frame Angle Step (deg in 1 frame) | `Cut` Peak Angular Velocity (deg/s) | `Blend` Peak Angular Velocity in Transition Window (deg/s) | Reduction Factor (`Cut` / `Blend`) |
|-------|--------------|-------------------------------------------------|-------------------------------------------------|-------------------------------------|------------------------------------------------------------|------------------------------------|
| `rightShoulder` | `idle → swing` ($t = 0.60\text{ s}$) | `18.85°` | `0.17°` | `1130.98 deg/s` | `221.95 deg/s` | **5.1×** |
| `torso` | `idle → swing` ($t = 0.60\text{ s}$) | `17.80°` | `0.16°` | `1068.12 deg/s` | `147.12 deg/s` | **7.3×** |
| `rightKnee` | `idle → swing` ($t = 0.60\text{ s}$) | `5.49°` | `0.05°` | `329.44 deg/s` | `76.54 deg/s` | **4.3×** |
| `rightShoulder` | `swing → aim` ($t = 1.45\text{ s}$, mid-swing) | `26.04°` | `0.23°` | `1562.59 deg/s` | `168.47 deg/s` | **9.3×** |
| `torso` | `swing → aim` ($t = 1.45\text{ s}$, mid-swing) | `27.97°` | `0.25°` | `1678.22 deg/s` | `120.99 deg/s` | **13.9×** |
| `rightKnee` | `swing → aim` ($t = 1.45\text{ s}$, mid-swing) | `39.97°` | `0.36°` | `2398.38 deg/s` | `181.39 deg/s` | **13.2×** |

### Artifacts Saved in `docs/results/`

- **Time-series CSV (169 samples at 60 Hz):** `docs/results/t07-transition-curves.csv`
- **Angle & Angular-Velocity Plot (SVG & PNG):** `docs/results/t07-transition-plot.svg`, `docs/results/t07-transition-plot.png`
