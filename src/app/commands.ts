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
  RightHandItem,
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
    r.sockets.leftForearm,
  ].map((j) => {
    const h = new AxesHelper(0.11);
    h.visible = false;
    h.renderOrder = 4;
    j.add(h);
    return h;
  });
}

function computeLegacyGripLocal(r: ArmPreviewRig): Vector3 {
  if (!r.hasEmbeddedEquipment || !r.parts.rifle) return new Vector3();
  r.displayRoot.updateMatrixWorld(true);
  const gripLocal = r.parts.rifle.getWorldPosition(new Vector3());
  r.sockets.rightHand.worldToLocal(gripLocal);
  return gripLocal;
}

export function createCommands(
  store: Store,
  initialRig: ArmPreviewRig,
  world: ReturnType<typeof createScene>,
  equipment: EquipmentManager,
) {
  let rig = initialRig;
  const sentinelRig = initialRig;
  let legacyRig: ArmPreviewRig | undefined;
  let legacyPromise: Promise<ArmPreviewRig> | undefined;
  let original: Group | undefined;
  let originalPromise: Promise<Group> | undefined;

  const animator = new Animator(rig),
    appearance = new Appearance(rig);

  const helperMap = new Map<ArmPreviewRig, AxesHelper[]>();
  const gripLocalMap = new Map<ArmPreviewRig, Vector3>();
  helperMap.set(sentinelRig, attachHelpers(sentinelRig));
  gripLocalMap.set(sentinelRig, computeLegacyGripLocal(sentinelRig));

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

  function setRightHandItemInternal(item: RightHandItem) {
    equipment.setRightHandItem(item);
    store.set({
      rightHandItem: item,
      weapon: item !== "none",
    });
  }

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
      if (action === "aim") {
        setRightHandItemInternal("rifle");
      } else if (action === "swing") {
        setRightHandItemInternal("saber");
      }
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
      animator.reapply();
      store.set({ skinning: mode });
      repaint();
    },
    setStrainHeatmap: (enabled: boolean) => {
      rig.lbs?.setStrainHeatmap(enabled);
    },
    setRigidInnerFrameVisible: (visible: boolean) => {
      rig.lbs?.setRigidInnerFrameVisible(visible);
    },
    setRightHandItem: (item: RightHandItem) => {
      setRightHandItemInternal(item);
    },
    setSaberBladeVisible: (visible: boolean) => {
      equipment.setSaberBladeVisible(visible);
      store.set({ saberBlade: visible });
    },
    setWeaponVisible: (visible: boolean) => {
      if (!visible) {
        setRightHandItemInternal("none");
      } else if (store.get().rightHandItem === "none") {
        setRightHandItemInternal("rifle");
      } else {
        equipment.setWeaponVisible(visible);
        store.set({ weapon: visible });
      }
    },
    setShieldVisible: (visible: boolean) => {
      equipment.setShieldVisible(visible);
      store.set({ shield: visible });
    },
    setLoadoutCollapsed: (collapsed: boolean) => {
      store.set({ loadoutCollapsed: collapsed });
    },
    toggleLoadoutCollapsed: () => {
      store.set({ loadoutCollapsed: !store.get().loadoutCollapsed });
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
        requestedMode === "prepared" ? "sentinel" : requestedMode;
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
        } else if (mode === "legacy" && !legacyRig) {
          legacyPromise ??= loadPrepared("legacy");
          legacyRig = await legacyPromise;
          helperMap.set(legacyRig, attachHelpers(legacyRig));
          gripLocalMap.set(legacyRig, computeLegacyGripLocal(legacyRig));
          world.scene.add(legacyRig.displayRoot);
        }

        if (mode === "legacy" && legacyRig) {
          rig = legacyRig;
        } else if (mode === "sentinel") {
          rig = sentinelRig;
        }

        sentinelRig.displayRoot.visible = mode === "sentinel";
        if (legacyRig) {
          legacyRig.displayRoot.visible = mode === "legacy";
          legacyRig.displayRoot.rotation.y = sentinelRig.displayRoot.rotation.y;
        }
        if (original) {
          original.visible = mode === "original";
          original.rotation.y = sentinelRig.displayRoot.rotation.y;
        }

        if (mode !== "original") {
          animator.setRig(rig);
          equipment.setRig(rig);
          appearance.setRig(rig);
          rig.lbs?.setMode(store.get().skinning);
          equipment.setRightHandItem(store.get().rightHandItem);
          equipment.setSaberBladeVisible(store.get().saberBlade);
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
        if (mode === "legacy") legacyPromise = undefined;
        store.set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        store.set({ loading: false });
      }
    },
    rotateModel: (degrees: number) => {
      store.set({ modelYawDeg: degrees });
      const rad = MathUtils.degToRad(degrees);
      sentinelRig.displayRoot.rotation.y = rad;
      if (legacyRig) legacyRig.displayRoot.rotation.y = rad;
      rig.lbs?.updateBoneMatrices();
      if (original) original.rotation.y = rad;
    },
    resetModelTransform: () => {
      sentinelRig.displayRoot.rotation.set(0, 0, 0);
      if (legacyRig) legacyRig.displayRoot.rotation.set(0, 0, 0);
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
    measureSilhouetteHoleView: (
      target: [number, number, number],
      cameraPos: [number, number, number],
      size = 512,
    ) => world.measureSilhouetteHoleView(target, cameraPos, size),
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
    const evalMode = store.get().skinning === "rigid" ? "rigid" : "lbs";
    const v = new Vector3();
    let minY = Infinity;
    for (let i = 0; i < count; i++) {
      if (rig.lbs) {
        rig.lbs.cpuPosition(part, i, evalMode, v);
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
    const edgeStrainRigid = rig.lbs?.computeEdgeStrain("rigid") ?? {
      maxStrain: 0,
      meanStrain: 0,
      triangleCount: 0,
      strainedTrianglesOver1Pct: 0,
    };
    const edgeStrainLbs = rig.lbs?.computeEdgeStrain("lbs") ?? {
      maxStrain: 0,
      meanStrain: 0,
      triangleCount: 0,
      strainedTrianglesOver1Pct: 0,
    };
    const activeSeam = skinningMode === "rigid" ? rigidSeam : lbsSeam;
    const lbsVsThree = rig.lbs?.compareWithThreeSkinning() ?? {
      maxDiff: 0,
      meanDiff: 0,
      vertexCount: 0,
    };

    const itemErrors = equipment.computeItemAttachmentErrors(
      gripLocalMap.get(rig),
    );
    const activeRightItem = store.get().rightHandItem;
    const attachmentError =
      activeRightItem === "saber"
        ? itemErrors.saber
        : activeRightItem === "rifle"
          ? itemErrors.rifle
          : itemErrors.shield;

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
      rightHandItem: store.get().rightHandItem,
      saberBladeVisible: store.get().saberBlade,
      shieldVisible: store.get().shield,
      skinSeamGap: activeSeam.maxGap,
      skinSeamMeanGap: activeSeam.meanGap,
      lbsSeamGapMax: lbsSeam.maxGap,
      lbsSeamGapMean: lbsSeam.meanGap,
      rigidSeamGapMax: rigidSeam.maxGap,
      rigidSeamGapMean: rigidSeam.meanGap,
      edgeStrainRigid,
      edgeStrainLbs,
      skirtAngles: animator.skirtAngles(),
      lbsVsThreeMaxDiff: lbsVsThree.maxDiff,
      lbsVsThreeMeanDiff: lbsVsThree.meanDiff,
      skinnedVertexCount: lbsVsThree.vertexCount,
      boundaryGroups: activeSeam.boundaryGroups,
      attachmentError,
      equipmentAttachmentErrors: itemErrors,
      leftFootMinY,
      rightFootMinY,
      jointWorldPositions,
      angles: store.get().angles as JointAngles,
      shoulderRotation: rig.joints.rightShoulder.quaternion.toArray(),
      elbowRotation: rig.joints.rightElbow.quaternion.toArray(),
      weaponVisible: store.get().rightHandItem !== "none",
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
