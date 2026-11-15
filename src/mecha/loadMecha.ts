import { Box3, Group, Mesh, Quaternion, SRGBColorSpace } from "three";
import type { Material, Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { JOINTS } from "./types";
import type { ArmPreviewRig, JointName, SocketName } from "./types";
import { modelPaths, rigConfig } from "./rigConfig";
const loader = new GLTFLoader();
function prepare(root: Object3D) {
  root.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if ("map" in m && m.map) m.map.colorSpace = SRGBColorSpace;
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
  const parts = Object.fromEntries(
    rigConfig.partNames.map((n) => [n, requireNode(gltf.scene, n)]),
  );
  const originalMaterials = new Map<Object3D, Material | Material[]>();
  displayRoot.traverse((o) => {
    if (o instanceof Mesh) originalMaterials.set(o, o.material);
  });
  return { displayRoot, joints, bindPose, sockets, parts, originalMaterials };
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
