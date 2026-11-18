import type { ArmPreviewRig } from "./types";
/** The source rifle already has its original grip offset in the prepared GLB hierarchy. */
export class EquipmentManager {
  constructor(private rig: ArmPreviewRig) {}
  setRig(rig: ArmPreviewRig) {
    this.rig = rig;
  }
  setWeaponVisible(visible: boolean) {
    this.rig.parts.rifle.visible = visible;
  }
  setShieldVisible(visible: boolean) {
    if (this.rig.lbs) {
      this.rig.lbs.setShieldVisible(visible);
    } else {
      this.rig.parts.shield.visible = visible;
    }
  }
}
