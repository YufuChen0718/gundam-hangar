import { Euler, Group, MathUtils, Matrix4, Vector3 } from "three";
import type { Object3D } from "three";
import type {
  ArmPreviewRig,
  EquipmentItemId,
  RightHandItem,
} from "./types";
import { EQUIPMENT_OFFSETS } from "./rigConfig";
import { gltfLoader, prepareMeshMaterials } from "./loadMecha";

interface MountedItem {
  id: EquipmentItemId;
  offsetNode: Group;
  itemRoot: Group;
  bladeNode: Object3D | null;
}

/**
 * Equipment attachment system (Method M6):
 *   M_equipment^world = M_joint^world * M_socket^joint * M_equipment^socket
 * Each external equipment GLB (beam saber, rifle, shield) is loaded once and attached
 * through the scene-graph chain: joint -> socket -> offsetNode -> itemRoot.
 */
export class EquipmentManager {
  private mounted = new Map<EquipmentItemId, MountedItem>();
  private loadPromise?: Promise<void>;
  private rightHandItem: RightHandItem = "rifle";
  private shieldVisible = true;
  private saberBladeVisible = true;

  constructor(private rig: ArmPreviewRig) {}

  async loadExternalEquipment(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      const ids: EquipmentItemId[] = ["saber", "rifle", "shield"];
      const gltfs = await Promise.all(
        ids.map((id) => gltfLoader.loadAsync(EQUIPMENT_OFFSETS[id].url)),
      );
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const spec = EQUIPMENT_OFFSETS[id];
        const gltf = gltfs[i];
        prepareMeshMaterials(gltf.scene);

        const itemRoot = new Group();
        itemRoot.name = `equipItem_${id}`;
        itemRoot.add(gltf.scene);

        const offsetNode = new Group();
        offsetNode.name = `equipOffset_${id}`;
        offsetNode.position.set(...spec.position);
        offsetNode.rotation.copy(
          new Euler(
            MathUtils.degToRad(spec.rotationDeg[0]),
            MathUtils.degToRad(spec.rotationDeg[1]),
            MathUtils.degToRad(spec.rotationDeg[2]),
            "XYZ",
          ),
        );
        offsetNode.scale.setScalar(spec.scale);
        offsetNode.add(itemRoot);

        const bladeNode =
          id === "saber"
            ? (gltf.scene.getObjectByName("saberBlade") ?? null)
            : null;

        this.mounted.set(id, { id, offsetNode, itemRoot, bladeNode });
      }
      this.attachToCurrentRig();
      this.syncVisibility();
    })();
    return this.loadPromise;
  }

  private attachToCurrentRig() {
    for (const [id, entry] of this.mounted.entries()) {
      const spec = EQUIPMENT_OFFSETS[id];
      const socket = this.rig.sockets[spec.socket];
      if (!this.rig.hasEmbeddedEquipment && socket) {
        socket.add(entry.offsetNode);
      } else {
        entry.offsetNode.removeFromParent();
      }
    }
  }

  setRig(rig: ArmPreviewRig) {
    this.rig = rig;
    this.attachToCurrentRig();
    this.syncVisibility();
  }

  getRightHandItem(): RightHandItem {
    return this.rightHandItem;
  }

  getShieldVisible(): boolean {
    return this.shieldVisible;
  }

  getSaberBladeVisible(): boolean {
    return this.saberBladeVisible;
  }

  setRightHandItem(item: RightHandItem) {
    this.rightHandItem = item;
    this.syncVisibility();
  }

  setWeaponVisible(visible: boolean) {
    if (this.rig.hasEmbeddedEquipment) {
      if (this.rig.parts.rifle) this.rig.parts.rifle.visible = visible;
    }
    if (!visible) {
      this.rightHandItem = "none";
    } else if (this.rightHandItem === "none") {
      this.rightHandItem = "rifle";
    }
    this.syncVisibility();
  }

  setShieldVisible(visible: boolean) {
    this.shieldVisible = visible;
    this.syncVisibility();
  }

  setSaberBladeVisible(visible: boolean) {
    this.saberBladeVisible = visible;
    this.syncVisibility();
  }

  private syncVisibility() {
    if (this.rig.hasEmbeddedEquipment) {
      if (this.rig.parts.rifle) {
        this.rig.parts.rifle.visible = this.rightHandItem !== "none";
      }
      if (this.rig.lbs) {
        this.rig.lbs.setShieldVisible(this.shieldVisible);
      } else if (this.rig.parts.shield) {
        this.rig.parts.shield.visible = this.shieldVisible;
      }
      for (const entry of this.mounted.values()) {
        entry.offsetNode.visible = false;
      }
      return;
    }

    const saberEntry = this.mounted.get("saber");
    if (saberEntry) {
      saberEntry.offsetNode.visible = this.rightHandItem === "saber";
      if (saberEntry.bladeNode) {
        saberEntry.bladeNode.visible = this.saberBladeVisible;
      }
    }
    const rifleEntry = this.mounted.get("rifle");
    if (rifleEntry) {
      rifleEntry.offsetNode.visible = this.rightHandItem === "rifle";
    }
    const shieldEntry = this.mounted.get("shield");
    if (shieldEntry) {
      shieldEntry.offsetNode.visible = this.shieldVisible;
    }
  }

  /**
   * Evaluates M_equipment^world = M_joint^world * M_socket^joint * M_equipment^socket
   * and returns the Euclidean position error (meters) between the analytical matrix
   * chain and the scene-graph item world origin for saber, rifle, and shield.
   */
  computeItemAttachmentErrors(legacyGripLocal?: Vector3): Record<
    EquipmentItemId,
    number
  > {
    this.rig.displayRoot.updateMatrixWorld(true);
    if (this.rig.hasEmbeddedEquipment) {
      const gripLocal = legacyGripLocal ?? new Vector3();
      const expected = this.rig.sockets.rightHand.localToWorld(
        gripLocal.clone(),
      );
      const actual = this.rig.parts.rifle
        ? this.rig.parts.rifle.getWorldPosition(new Vector3())
        : expected;
      const err = expected.distanceTo(actual);
      return { saber: err, rifle: err, shield: 0 };
    }

    const out: Record<EquipmentItemId, number> = {
      saber: 0,
      rifle: 0,
      shield: 0,
    };
    const mSocketJoint = new Matrix4();
    const mJointWorld = new Matrix4();
    const mExpectedWorld = new Matrix4();
    const pExpected = new Vector3();
    const pActual = new Vector3();

    for (const id of ["saber", "rifle", "shield"] as const) {
      const entry = this.mounted.get(id);
      const spec = EQUIPMENT_OFFSETS[id];
      const joint = this.rig.joints[spec.joint];
      const socket = this.rig.sockets[spec.socket];
      if (!entry || !joint || !socket) continue;

      entry.offsetNode.updateMatrix();
      mJointWorld.copy(joint.matrixWorld);
      // M_socket^joint = (M_joint^world)^(-1) * M_socket^world
      mSocketJoint.copy(mJointWorld).invert().multiply(socket.matrixWorld);
      // M_equipment^world = M_joint^world * M_socket^joint * M_equipment^socket
      mExpectedWorld
        .copy(mJointWorld)
        .multiply(mSocketJoint)
        .multiply(entry.offsetNode.matrix);

      pExpected.setFromMatrixPosition(mExpectedWorld);
      entry.itemRoot.getWorldPosition(pActual);
      out[id] = pExpected.distanceTo(pActual);
    }
    return out;
  }
}
