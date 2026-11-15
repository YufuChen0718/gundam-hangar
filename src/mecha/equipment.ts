import type { ArmPreviewRig } from "./types";
/** The source rifle already has its original grip offset in the prepared GLB hierarchy. */
export class EquipmentManager {
  constructor(private rig: ArmPreviewRig) {}
  setWeaponVisible(visible: boolean) {
    this.rig.parts.rifle.visible = visible;
  }
  setShieldVisible(visible: boolean) {
    this.rig.parts.shield.visible = visible;
  }
}
