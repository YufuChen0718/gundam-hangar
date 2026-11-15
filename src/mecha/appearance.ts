import { Mesh, MeshStandardMaterial } from "three";
import type { Group } from "three";
import type { ArmPreviewRig } from "./types";
const colors: Record<string, number> = {
  body: 0x7c899a,
  upperArm: 0xf2a44d,
  forearm: 0x46c9c1,
  hand: 0xab88dd,
  rifle: 0xea6676,
  shield: 0x7b9ec2,
};
export class Appearance {
  private materials = new Map<string, MeshStandardMaterial>();
  constructor(private rig: ArmPreviewRig) {
    for (const [part, color] of Object.entries(colors))
      this.materials.set(
        part,
        new MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.12 }),
      );
  }
  apply(parts: boolean, wireframe: boolean, original?: Group) {
    for (const [object, material] of this.rig.originalMaterials) {
      if (!(object instanceof Mesh)) continue;
      object.material = parts
        ? (this.materials.get(object.name) ?? material)
        : material;
    }
    for (const root of [this.rig.displayRoot, original])
      root?.traverse((o) => {
        if (o instanceof Mesh)
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            if ("wireframe" in m) m.wireframe = wireframe;
          }
      });
  }
}
