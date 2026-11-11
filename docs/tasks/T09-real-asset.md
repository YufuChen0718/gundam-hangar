# T09 · Real mecha asset

**Goal:** replace the box prototype with the real GLB model, without touching the animation or equipment code.

## To do
1. **Choose the asset** (Week 1 first half): Meshy or another source with clear licensing; record it in `docs/asset-sources.md`
2. **Check in Blender:** can the skeleton/parts be articulated, do the arms deform badly, can the materials be split by region
   - If it cannot be rigged reliably → switch to a **rigid model with separate parts** (each part parented to its joint, same structure as the box prototype)
3. **Process:** unify scale (meters) and orientation (faces +Z, +Y up), apply transforms, name materials by region, put the arms in a hanging bind pose (otherwise the angles in the clips must be readjusted)
4. Export GLB → `public/assets/models/`; put the .blend in `assets-src/`
5. `src/mecha/rigConfig.ts`: bone name mapping, socket position/orientation, material → region
6. `src/mecha/loadMecha.ts`: GLTFLoader → `MechaRig` (clone materials per region, enable shadows)
7. Replace the procedural mecha in `main.ts` (keep a switch so you can fall back to the prototype)

## Acceptance criteria
- [ ] Every T06/T07 action plays on the real model, joints rotate around sensible pivots
- [ ] Weapons sit correctly in the hand (tune socket rotation / equipment offset)
- [ ] Recoloring one region does not affect other regions
- [ ] Frame rate is still near 60 FPS (if not, decimate the model)
