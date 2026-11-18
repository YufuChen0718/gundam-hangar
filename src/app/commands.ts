import { AxesHelper, MathUtils, Mesh, Quaternion, Vector3 } from "three";
import type { Group } from "three";
import type { Store } from "./state";
import { JOINTS } from "../mecha/types";
import type {
  ArmPreviewRig,
  JointAngles,
  JointName,
  ModelMode,
  PoseInput,
  PosePresetName,
  SkinningMode,
} from "../mecha/types";
import {
  clampJointAngle,
  normalizePoseInput,
  TEST_POSES,
} from "../mecha/rigConfig";
import { loadOriginal, loadPrepared } from "../mecha/loadMecha";
import { EquipmentManager } from "../mecha/equipment";
import { Appearance } from "../mecha/appearance";
import { Animator } from "../animation/animator";
import type { ActionName, TransitionMode } from "../animation/clips";
import type { createScene } from "../scene/createScene";

function attachHelpers(r: ArmPreviewRig): AxesHelper[] {
  return [
    ...JOINTS.map((j) => r.joints[j]),
    r.sockets.rightHand,
    r.sockets.leftHand,
  ].map((j) => {
    const h = new AxesHelper(0.11);
    h.visible = false;
    h.renderOrder = 4;
    j.add(h);
    return h;
  });
}

function computeGripLocal(r: ArmPreviewRig): Vector3 {
  r.displayRoot.updateMatrixWorld(true);
  const gripLocal = r.parts.rifle.getWorldPosition(new Vector3());
  r.sockets.rightHand.worldToLocal(gripLocal);
  return gripLocal;
}

export function createCommands(
  store: Store,
  initialRig: ArmPreviewRig,
  world: ReturnType<typeof createScene>,
) {
  let rig = initialRig;
  const guardianRig = initialRig;
  let previousRig: ArmPreviewRig | undefined;
  let previousPromise: Promise<ArmPreviewRig> | undefined;
  let original: Group | undefined;
  let originalPromise: Promise<Group> | undefined;

  const animator = new Animator(rig),
    equipment = new EquipmentManager(rig),
    appearance = new Appearance(rig);

  const helperMap = new Map<ArmPreviewRig, AxesHelper[]>();
  const gripLocalMap = new Map<ArmPreviewRig, Vector3>();
  helperMap.set(guardianRig, attachHelpers(guardianRig));
  gripLocalMap.set(guardianRig, computeGripLocal(guardianRig));

  const repaint = () =>
    appearance.apply(store.get().parts, store.get().wireframe, original);

  function sync() {
    store.set({
      action: animator.action,
      status: animator.status,
      transitionMode: animator.transitionMode,
      angles: animator.angles(),
      time: animator.time,
      duration: animator.duration,
      playing: animator.playing,
    });
  }

  function manual(angles: PoseInput) {
    if (store.get().mode === "original") return;
    animator.manual(normalizePoseInput(angles));
    sync();
  }

  const legacyMap: Record<string, JointName> = {
    shoulder: "rightShoulder",
    elbow: "rightElbow",
    wrist: "rightWrist",
  };

  const commands = {
    setJoint: (
      name: JointName | "shoulder" | "elbow" | "wrist",
      value: number,
    ) => {
      const joint = (legacyMap[name] ?? name) as JointName;
      manual({
        ...store.get().angles,
        [joint]: clampJointAngle(joint, value),
      });
    },
    setPoseAngles: (angles: PoseInput) => manual(angles),
    pose: (name: PosePresetName) => {
      if (name === "rest" || name === "bind") {
        manual({});
        return;
      }
      if (name === "raise") {
        manual({ rightShoulder: 12, rightElbow: 25, rightWrist: 0 });
        return;
      }
      if (name === "aim") {
        manual({ rightShoulder: 20, rightElbow: 40, rightWrist: 0 });
        return;
      }
      const preset = TEST_POSES.find((p) => p.id === name);
      if (preset) manual(preset.angles);
    },
    play: () => {
      if (store.get().mode === "original") return;
      if (animator.playing) animator.pause();
      else if (animator.time > 0 && animator.time < animator.duration)
        animator.resume();
      else animator.play();
      sync();
    },
    playAction: (action: ActionName) => {
      if (store.get().mode === "original") return;
      animator.play(action);
      sync();
    },
    setTransitionMode: (mode: TransitionMode) => {
      animator.setTransitionMode(mode);
      store.set({ transitionMode: mode });
      sync();
    },
    seek: (time: number) => {
      if (store.get().mode === "original") return;
      animator.seek(time);
      sync();
    },
    reset: () => {
      animator.reset();
      sync();
    },
    setSkinningMode: (mode: SkinningMode) => {
      rig.lbs?.setMode(mode);
      store.set({ skinning: mode });
      repaint();
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
      for (const list of helperMap.values()) {
        list.forEach((h) => (h.visible = v));
      }
      store.set({ joints: v });
    },
    setModel: async (requestedMode: ModelMode) => {
      const mode: ModelMode =
        requestedMode === "prepared" ? "guardian" : requestedMode;
      if (store.get().loading || store.get().mode === mode) return;
      const savedAngles = { ...store.get().angles };
      animator.pause();
      sync();
      store.set({ loading: true, error: null });
      try {
        if (mode === "original" && !original) {
          originalPromise ??= loadOriginal();
          original = await originalPromise;
          world.scene.add(original);
        } else if (mode === "previous" && !previousRig) {
          previousPromise ??= loadPrepared("previous");
          previousRig = await previousPromise;
          helperMap.set(previousRig, attachHelpers(previousRig));
          gripLocalMap.set(previousRig, computeGripLocal(previousRig));
          world.scene.add(previousRig.displayRoot);
        }

        if (mode === "previous" && previousRig) {
          rig = previousRig;
        } else if (mode === "guardian") {
          rig = guardianRig;
        }

        guardianRig.displayRoot.visible = mode === "guardian";
        if (previousRig) {
          previousRig.displayRoot.visible = mode === "previous";
          previousRig.displayRoot.rotation.y =
            guardianRig.displayRoot.rotation.y;
        }
        if (original) {
          original.visible = mode === "original";
          original.rotation.y = guardianRig.displayRoot.rotation.y;
        }

        if (mode !== "original") {
          animator.setRig(rig);
          equipment.setRig(rig);
          appearance.setRig(rig);
          rig.lbs?.setMode(store.get().skinning);
          equipment.setWeaponVisible(store.get().weapon);
          equipment.setShieldVisible(store.get().shield);
          helperMap
            .get(rig)
            ?.forEach((h) => (h.visible = store.get().joints));
          animator.manual(savedAngles);
        }
        store.set({ mode });
        repaint();
        sync();
      } catch (e) {
        if (mode === "original") originalPromise = undefined;
        if (mode === "previous") previousPromise = undefined;
        store.set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        store.set({ loading: false });
      }
    },
    rotateModel: (degrees: number) => {
      store.set({ modelYawDeg: degrees });
      const rad = MathUtils.degToRad(degrees);
      guardianRig.displayRoot.rotation.y = rad;
      if (previousRig) previousRig.displayRoot.rotation.y = rad;
      rig.lbs?.updateBoneMatrices();
      if (original) original.rotation.y = rad;
    },
    resetModelTransform: () => {
      guardianRig.displayRoot.rotation.set(0, 0, 0);
      if (previousRig) previousRig.displayRoot.rotation.set(0, 0, 0);
      rig.lbs?.updateBoneMatrices();
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
    focusCamera: (
      target: [number, number, number],
      cameraPos: [number, number, number],
    ) => world.focus(target, cameraPos),
  };

  let accumulator = 0;
  function update(dt: number) {
    if (store.get().mode !== "original") {
      animator.update(dt);
      rig.lbs?.updateBoneMatrices();
      accumulator += dt;
      if (accumulator > 0.05) {
        sync();
        accumulator = 0;
      }
    }
  }

  function partMinPlatformY(partName: string): number {
    const part = rig.parts[partName];
    if (!(part instanceof Mesh)) return 0;
    const count = part.geometry.attributes.position.count;
    const v = new Vector3();
    let minY = Infinity;
    for (let i = 0; i < count; i++) {
      if (rig.lbs) {
        rig.lbs.cpuPosition(part, i, "lbs", v);
      } else {
        part.getVertexPosition(i, v);
        part.localToWorld(v);
      }
      rig.displayRoot.worldToLocal(v);
      if (v.y < minY) minY = v.y;
    }
    return Number.isFinite(minY) ? minY : 0;
  }

  function diagnostics() {
    rig.displayRoot.updateMatrixWorld(true);
    const skinningMode = store.get().skinning;
    const lbsSeam = rig.lbs?.computeSeamStats("lbs") ?? {
      maxGap: 0,
      meanGap: 0,
      boundaryGroups: 0,
    };
    const rigidSeam = rig.lbs?.computeSeamStats("rigid") ?? {
      maxGap: 0,
      meanGap: 0,
      boundaryGroups: 0,
    };
    const activeSeam = skinningMode === "rigid" ? rigidSeam : lbsSeam;
    const lbsVsThree = rig.lbs?.compareWithThreeSkinning() ?? {
      maxDiff: 0,
      meanDiff: 0,
      vertexCount: 0,
    };

    const gripLocal = gripLocalMap.get(rig) ?? new Vector3();
    const expected = rig.sockets.rightHand.localToWorld(gripLocal.clone());
    const actual = rig.parts.rifle.getWorldPosition(new Vector3());
    const jointWorldPositions = Object.fromEntries(
      JOINTS.map((j) => [
        j,
        rig.joints[j].getWorldPosition(new Vector3()).toArray(),
      ]),
    ) as Record<JointName, [number, number, number]>;
    const leftFootMinY = partMinPlatformY("leftFoot");
    const rightFootMinY = partMinPlatformY("rightFoot");
    return {
      skinningMode,
      action: animator.action,
      status: animator.status,
      transitionMode: animator.transitionMode,
      skinSeamGap: activeSeam.maxGap,
      skinSeamMeanGap: activeSeam.meanGap,
      lbsSeamGapMax: lbsSeam.maxGap,
      lbsSeamGapMean: lbsSeam.meanGap,
      rigidSeamGapMax: rigidSeam.maxGap,
      rigidSeamGapMean: rigidSeam.meanGap,
      lbsVsThreeMaxDiff: lbsVsThree.maxDiff,
      lbsVsThreeMeanDiff: lbsVsThree.meanDiff,
      skinnedVertexCount: lbsVsThree.vertexCount,
      boundaryGroups: activeSeam.boundaryGroups,
      attachmentError: expected.distanceTo(actual),
      leftFootMinY,
      rightFootMinY,
      jointWorldPositions,
      angles: store.get().angles as JointAngles,
      shoulderRotation: rig.joints.rightShoulder.quaternion.toArray(),
      elbowRotation: rig.joints.rightElbow.quaternion.toArray(),
      weaponVisible: rig.parts.rifle.visible,
      mode: store.get().mode,
      playing: animator.playing,
      time: animator.time,
      bindError: Math.max(
        ...JOINTS.map((j) =>
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
