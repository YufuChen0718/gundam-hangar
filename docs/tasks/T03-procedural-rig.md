# T03 · Box prototype mecha + joints / sockets

**Goal:** before the real model is ready, build a stand-in mecha from boxes that **exposes exactly the same `MechaRig` interface as the real model**, so animation and equipment work can start early.

## To do
- `src/mecha/types.ts`: `JointName`, `SocketName`, `RegionName`, `MechaRig` (see ARCHITECTURE §4)
- `src/mecha/proceduralMecha.ts`: build the box mecha
  - static legs + pelvis; torso → head; torso → left/right shoulder → elbow → wrist → hand socket; torso → back socket
  - total height about 2 m, standing on the platform, facing +Z, arms hanging along −Y
  - each part uses the material of its armor region (4 regions, one material each)
  - record `bindPose`
- `main.ts`: replace the cube with the prototype; temporarily rotate `rightShoulder` with time to verify the hierarchy

## Acceptance criteria
- [ ] When the right shoulder rotates, the forearm, hand and socket follow; the torso and other arm do not move
- [ ] Mecha's right side = world −X (right hand on the left side of the screen when facing the camera)
- [ ] Rotating `displayRoot` rotates the whole model, and joint local rotations stay unchanged
