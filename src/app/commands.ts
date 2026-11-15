import {
  AxesHelper,
  MathUtils,
  Mesh,
  SkinnedMesh,
  Quaternion,
  Vector3,
} from "three";
import type { Group } from "three";
import type { Store } from "./state";
import type { ArmPreviewRig, JointAngles, ModelMode } from "../mecha/types";
import { loadOriginal } from "../mecha/loadMecha";
import { EquipmentManager } from "../mecha/equipment";
import { Appearance } from "../mecha/appearance";
import { Animator } from "../animation/animator";
import type { createScene } from "../scene/createScene";
export function createCommands(
  store: Store,
  rig: ArmPreviewRig,
  world: ReturnType<typeof createScene>,
) {
  const animator = new Animator(rig),
    equipment = new EquipmentManager(rig),
    appearance = new Appearance(rig);
  let original: Group | undefined;
  let originalPromise: Promise<Group> | undefined;
  const helpers = [
    rig.joints.rightShoulder,
    rig.joints.rightElbow,
    rig.joints.rightWrist,
    rig.sockets.rightHand,
  ].map((j) => {
    const h = new AxesHelper(0.14);
    h.visible = false;
    h.renderOrder = 4;
    j.add(h);
    return h;
  });
  const repaint = () =>
    appearance.apply(store.get().parts, store.get().wireframe, original);
  function sync() {
    store.set({
      angles: animator.angles(),
      time: animator.time,
      playing: animator.playing,
    });
  }
  function manual(angles: JointAngles) {
    if (store.get().mode !== "prepared") return;
    animator.manual({
      shoulder: MathUtils.clamp(angles.shoulder, 0, 55),
      elbow: MathUtils.clamp(angles.elbow, 0, 85),
      wrist: MathUtils.clamp(angles.wrist, -20, 20),
    });
    sync();
  }
  const commands = {
    setJoint: (name: keyof JointAngles, value: number) =>
      manual({ ...store.get().angles, [name]: value }),
    pose: (name: "rest" | "raise" | "aim") =>
      manual(
        name === "rest"
          ? { shoulder: 0, elbow: 0, wrist: 0 }
          : name === "raise"
            ? { shoulder: 12, elbow: 25, wrist: 0 }
            : { shoulder: 20, elbow: 40, wrist: 0 },
      ),
    play: () => {
      if (store.get().mode !== "prepared") return;
      if (animator.playing) animator.pause();
      else if (animator.time > 0 && animator.time < animator.duration)
        animator.resume();
      else animator.play();
      sync();
    },
    seek: (time: number) => {
      if (store.get().mode !== "prepared") return;
      animator.seek(time);
      sync();
    },
    reset: () => {
      animator.reset();
      sync();
    },
    setWeaponVisible: (visible: boolean) => {
      equipment.setWeaponVisible(visible);
      store.set({ weapon: visible });
    },
    setShieldVisible: (visible: boolean) => {
      equipment.setShieldVisible(visible);
      store.set({ shield: visible });
    },
    setWireframe: (v: boolean) => {
      store.set({ wireframe: v });
      repaint();
    },
    setPartColors: (v: boolean) => {
      store.set({ parts: v });
      repaint();
    },
    setJointsVisible: (v: boolean) => {
      helpers.forEach((h) => (h.visible = v));
      store.set({ joints: v });
    },
    setModel: async (mode: ModelMode) => {
      if (store.get().loading || store.get().mode === mode) return;
      animator.pause();
      sync();
      store.set({ loading: true, error: null });
      try {
        if (mode === "original" && !original) {
          originalPromise ??= loadOriginal();
          original = await originalPromise;
          world.scene.add(original);
        }
        rig.displayRoot.visible = mode === "prepared";
        if (original) {
          original.visible = mode === "original";
          original.rotation.y = rig.displayRoot.rotation.y;
        }
        store.set({ mode });
        repaint();
      } catch (e) {
        originalPromise = undefined;
        store.set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        store.set({ loading: false });
      }
    },
    rotateModel: (degrees: number) => {
      store.set({ modelYawDeg: degrees });
      rig.displayRoot.rotation.y = MathUtils.degToRad(degrees);
      if (original) original.rotation.y = rig.displayRoot.rotation.y;
    },
    resetModelTransform: () => {
      rig.displayRoot.rotation.set(0, 0, 0);
      if (original) original.rotation.set(0, 0, 0);
      store.set({ modelYawDeg: 0 });
      world.resetCamera();
    },
    camera: (view: "front" | "side" | "orbit" | "back" | "top") =>
      view === "front"
        ? world.front()
        : view === "side"
          ? world.side()
          : view === "back"
            ? world.back()
            : view === "top"
              ? world.top()
              : world.resetCamera(),
    zoom: (direction: "in" | "out") =>
      world.zoom(direction === "in" ? 0.85 : 1.15),
  };
  let accumulator = 0;
  function update(dt: number) {
    if (store.get().mode === "prepared") {
      animator.update(dt);
      accumulator += dt;
      if (accumulator > 0.05) {
        sync();
        accumulator = 0;
      }
    }
  }
  // Match duplicate boundary vertices in the bind pose and measure their actual skinned positions.
  rig.displayRoot.updateMatrixWorld(true);
  const vertices = new Map<string, { mesh: Mesh; index: number }[]>();
  rig.displayRoot.traverse((o) => {
    if (o instanceof SkinnedMesh) o.skeleton.update();
  });
  rig.displayRoot.traverse((o) => {
    if (o instanceof Mesh) {
      const count = o.geometry.attributes.position.count;
      const v = new Vector3();
      for (let i = 0; i < count; i++) {
        o.getVertexPosition(i, v);
        o.localToWorld(v);
        const key = v
          .toArray()
          .map((n) => Math.round(n * 1e5))
          .join(",");
        const list = vertices.get(key) ?? [];
        list.push({ mesh: o, index: i });
        vertices.set(key, list);
      }
    }
  });
  const boundaries = [...vertices.values()].filter(
    (group) => new Set(group.map((g) => g.mesh.uuid)).size > 1,
  );
  function seamError() {
    rig.displayRoot.traverse((o) => {
      if (o instanceof SkinnedMesh) o.skeleton.update();
    });
    let max = 0;
    const reference = new Vector3(),
      point = new Vector3();
    for (const group of boundaries) {
      group[0].mesh.getVertexPosition(group[0].index, reference);
      group[0].mesh.localToWorld(reference);
      for (const item of group.slice(1)) {
        item.mesh.getVertexPosition(item.index, point);
        item.mesh.localToWorld(point);
        max = Math.max(max, reference.distanceTo(point));
      }
    }
    return max;
  }
  const gripLocal = rig.parts.rifle.getWorldPosition(new Vector3());
  rig.sockets.rightHand.worldToLocal(gripLocal);
  function diagnostics() {
    rig.displayRoot.updateMatrixWorld(true);
    const expected = rig.sockets.rightHand.localToWorld(gripLocal.clone());
    const actual = rig.parts.rifle.getWorldPosition(new Vector3());
    return {
      skinSeamGap: seamError(),
      boundaryGroups: boundaries.length,
      attachmentError: expected.distanceTo(actual),
      shoulderRotation: rig.joints.rightShoulder.quaternion.toArray(),
      elbowRotation: rig.joints.rightElbow.quaternion.toArray(),
      weaponVisible: rig.parts.rifle.visible,
      mode: store.get().mode,
      playing: animator.playing,
      time: animator.time,
      bindError: Math.max(
        ...(["rightShoulder", "rightElbow", "rightWrist"] as const).map((j) =>
          new Quaternion()
            .copy(rig.joints[j].quaternion)
            .angleTo(rig.bindPose[j]),
        ),
      ),
    };
  }
  return { commands, update, diagnostics };
}
export type Commands = ReturnType<typeof createCommands>["commands"];
