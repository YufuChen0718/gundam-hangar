import {
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { Material, Object3D, Quaternion, Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { JOINTS } from "./types";
import type {
  ArmPreviewRig,
  FootGroundSample,
  JointName,
  SocketName,
} from "./types";
import { modelPaths, rigConfig } from "./rigConfig";
import { LbsManager } from "./lbs";

const loader = new GLTFLoader();

function prepare(root: Object3D) {
  root.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if ("map" in m && m.map) m.map.colorSpace = SRGBColorSpace;
        // Sharper textures at grazing angles, and a gentler normal map: the
        // generated normal map carries baked dither noise that reads as grain.
        for (const key of [
          "map",
          "normalMap",
          "roughnessMap",
          "metalnessMap",
          "emissiveMap",
        ] as const) {
          const tex = (m as Record<string, unknown>)[key] as Texture | null;
          if (tex) {
            tex.anisotropy = 8;
            tex.needsUpdate = true;
          }
        }
        if (m instanceof MeshStandardMaterial) m.normalScale.setScalar(0.6);
      }
    }
  });
}

function requireNode(root: Object3D, name: string): Object3D {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`模型缺少节点：${name}`);
  return node;
}

export async function loadPrepared(): Promise<ArmPreviewRig> {
  const gltf = await loader.loadAsync(modelPaths.prepared);
  prepare(gltf.scene);
  const displayRoot = new Group();
  displayRoot.name = "appDisplayRoot";
  displayRoot.add(gltf.scene);
  const joints = Object.fromEntries(
    JOINTS.map((j) => [j, requireNode(gltf.scene, rigConfig.joints[j])]),
  ) as Record<JointName, Object3D>;
  const bindPose = Object.fromEntries(
    JOINTS.map((j) => [j, joints[j].quaternion.clone()]),
  ) as Record<JointName, Quaternion>;
  const sockets = Object.fromEntries(
    Object.entries(rigConfig.sockets).map(([s, n]) => [
      s,
      requireNode(gltf.scene, n),
    ]),
  ) as Record<SocketName, Object3D>;
  const rifleOffset = gltf.scene.getObjectByName("rifleOffset");
  if (rifleOffset) {
    rifleOffset.quaternion.copy(sockets.rightHand.quaternion).invert();
  }
  const parts = Object.fromEntries(
    rigConfig.partNames.map((n) => [n, requireNode(gltf.scene, n)]),
  );
  const originalMaterials = new Map<Object3D, Material | Material[]>();
  displayRoot.traverse((o) => {
    if (o instanceof Mesh) originalMaterials.set(o, o.material);
  });

  displayRoot.updateMatrixWorld(true);
  const lbs = new LbsManager(displayRoot, parts);

  const pelvisBindPosition = joints.pelvis.position.clone();
  const leftAnklePos = joints.leftAnkle.getWorldPosition(new Vector3());
  const rightAnklePos = joints.rightAnkle.getWorldPosition(new Vector3());
  displayRoot.worldToLocal(leftAnklePos);
  displayRoot.worldToLocal(rightAnklePos);
  const bindAnkleY = Math.min(leftAnklePos.y, rightAnklePos.y);

  const footGroundSamples: FootGroundSample[] = [];
  let bindFootMinY = Infinity;
  for (const [partName, ankleJoint] of [
    ["leftFoot", joints.leftAnkle],
    ["rightFoot", joints.rightAnkle],
  ] as const) {
    const footObj = parts[partName];
    if (footObj instanceof Mesh) {
      const posAttr = footObj.geometry.attributes.position;
      const v = new Vector3();
      const rootPt = new Vector3();
      let partMinY = Infinity;
      const candidates: { rootY: number; worldPt: Vector3 }[] = [];
      for (let i = 0; i < posAttr.count; i++) {
        lbs.cpuPosition(footObj, i, "lbs", v);
        rootPt.copy(v);
        displayRoot.worldToLocal(rootPt);
        if (rootPt.y < partMinY) partMinY = rootPt.y;
        if (rootPt.y < bindFootMinY) bindFootMinY = rootPt.y;
        candidates.push({ rootY: rootPt.y, worldPt: v.clone() });
      }
      for (const c of candidates) {
        if (c.rootY <= partMinY + 0.015) {
          const localPoint = ankleJoint.worldToLocal(c.worldPt.clone());
          footGroundSamples.push({ ankleJoint, localPoint });
        }
      }
    }
  }
  if (!Number.isFinite(bindFootMinY)) bindFootMinY = 0;

  return {
    displayRoot,
    joints,
    bindPose,
    sockets,
    parts,
    originalMaterials,
    pelvisBindPosition,
    bindAnkleY,
    bindFootMinY,
    footGroundSamples,
    lbs,
  };
}

export async function loadOriginal(): Promise<Group> {
  const gltf = await loader.loadAsync(modelPaths.original);
  prepare(gltf.scene);
  const root = new Group();
  root.add(gltf.scene);
  root.updateMatrixWorld(true);
  root.position.y -= new Box3().setFromObject(root).min.y;
  root.name = "originalDisplayRoot";
  return root;
}
