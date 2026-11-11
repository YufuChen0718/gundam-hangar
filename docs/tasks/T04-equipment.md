# T04 · Equipment system

**Goal:** weapons/backpack attach to sockets, can be swapped/removed, and always follow the joints during motion.

## To do (`src/mecha/equipment.ts`)
- `EquipmentDef`: id, label, slot, offset (position / rotationDeg / scale), build function or GLB path
- Three placeholder pieces of equipment (simple geometry is fine; replaced with real assets in T09):
  - `rifle`: barrel modeled along +Z → offset is the identity
  - `beamSword`: blade **deliberately modeled along +Y** (simulating a different asset convention) → offset rotates +90° about X, mapping +Y to +Z
  - `backpack`: mounted on the back socket
- `EquipmentManager`: `equip(id)` (automatically replaces whatever is in the same slot), `unequip(slot)` (releases geometry/materials), `equippedId(slot)`
- Scene-graph chain: socket → offset node → model, so that `M_equipment^world = M_joint^world · M_socket^joint · M_equipment^socket` holds

## Acceptance criteria
- [ ] In the bind pose the blade/barrel points to the mecha's front (+Z)
- [ ] With the arm rotated to any angle, the weapon stays in the hand without drifting
- [ ] Swapping 10 times in a row does not leave duplicate models behind (check the scene's child count)
