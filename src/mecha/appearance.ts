import { Mesh, MeshStandardMaterial } from "three";
import type { Group } from "three";
import type { ArmPreviewRig } from "./types";

const colors: Record<string, number> = {
  waistPart: 0x68829e,
  chestPart: 0x4f7cac,
  headPart: 0xe8c547,
  rightUpperArm: 0xf2a44d,
  rightForearm: 0x46c9c1,
  rightPalm: 0xab88dd,
  leftUpperArm: 0xf48c64,
  leftForearm: 0x56b886,
  leftPalm: 0xc287e8,
  rightThigh: 0x5c9ead,
  rightShin: 0x82b366,
  rightFoot: 0xd96b6b,
  leftThigh: 0x4a8fe7,
  leftShin: 0x93c47d,
  leftFoot: 0xe06666,
  frontRightSkirtPart: 0xf5d442,
  frontLeftSkirtPart: 0xe8be32,
  sideRightSkirtPart: 0xe6659e,
  sideLeftSkirtPart: 0xd957b2,
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
  setRig(rig: ArmPreviewRig) {
    this.rig = rig;
  }
  apply(parts: boolean, wireframe: boolean, original?: Group) {
    this.rig.lbs?.setAppearance(parts, wireframe);
    for (const [object, material] of this.rig.originalMaterials) {
      if (!(object instanceof Mesh) || object.name.endsWith("_lbs")) continue;
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
