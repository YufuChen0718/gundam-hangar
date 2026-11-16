import {
  Color,
  Matrix4,
  Mesh,
  ShaderMaterial,
  SkinnedMesh,
  Vector3,
} from "three";
import type {
  BufferGeometry,
  Group,
  Material,
  Object3D,
} from "three";
import type {
  JointName,
  LbsComparisonStats,
  LbsController,
  SeamStats,
  SkinningMode,
} from "./types";

export const PART_PRIMARY_BONE: Record<string, JointName> = {
  waistPart: "pelvis",
  chestPart: "torso",
  headPart: "head",
  rightUpperArm: "rightShoulder",
  rightForearm: "rightElbow",
  rightPalm: "rightWrist",
  leftUpperArm: "leftShoulder",
  leftForearm: "leftElbow",
  leftPalm: "leftWrist",
  rightThigh: "rightHip",
  rightShin: "rightKnee",
  rightFoot: "rightAnkle",
  leftThigh: "leftHip",
  leftShin: "leftKnee",
  leftFoot: "leftAnkle",
  shield: "leftElbow",
};

export const PART_DEBUG_COLORS: Record<string, number> = {
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
  rifle: 0xea6676,
  shield: 0x7b9ec2,
};

const LBS_VERTEX_SHADER = /* glsl */ `
attribute vec4 skinIndex;
attribute vec4 skinWeight;

uniform mat4 uBoneMatrices[15];
uniform vec3 uPartOrigin;
uniform int uRigidMode;
uniform int uPrimaryBoneIndex;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

mat4 getBoneMatrix(int index) {
  for (int i = 0; i < 15; i++) {
    if (i == index) return uBoneMatrices[i];
  }
  return uBoneMatrices[0];
}

void main() {
  vec3 localPos = position - uPartOrigin;
  vec3 skinnedPos = vec3(0.0);
  vec3 skinnedNormal = vec3(0.0);

  if (uRigidMode == 1) {
    mat4 m = getBoneMatrix(uPrimaryBoneIndex);
    skinnedPos = (m * vec4(localPos, 1.0)).xyz;
    skinnedNormal = mat3(m) * normal;
  } else {
    for (int k = 0; k < 4; k++) {
      float w = skinWeight[k];
      if (w > 0.0) {
        int idx = int(skinIndex[k] + 0.5);
        mat4 m = getBoneMatrix(idx);
        skinnedPos += w * (m * vec4(localPos, 1.0)).xyz;
        skinnedNormal += w * (mat3(m) * normal);
      }
    }
  }

  float nLen = length(skinnedNormal);
  if (nLen > 1e-6) {
    skinnedNormal /= nLen;
  } else {
    skinnedNormal = normal;
  }

  vec4 worldPos = modelMatrix * vec4(skinnedPos, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * skinnedNormal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// --- Surface shading -------------------------------------------------------
// Our contribution is the skinning math (vertex stage). For the surface we reuse
// the asset's own PBR material (base color, normal map, metal/roughness, emissive,
// double-sided) so the rigged model looks identical to the original static model.
// The snippets below are injected into that material's vertex shader with
// onBeforeCompile; no Three.js skinning chunk is used (the mesh is a plain Mesh,
// so USE_SKINNING is never defined).
const LBS_PARS_VERTEX = /* glsl */ `
attribute vec4 skinIndex;
attribute vec4 skinWeight;
uniform mat4 uBoneMatrices[15];
uniform vec3 uPartOrigin;
uniform int uRigidMode;
uniform int uPrimaryBoneIndex;

mat4 lbsBoneMatrix(int index) {
  for (int i = 0; i < 15; i++) {
    if (i == index) return uBoneMatrices[i];
  }
  return uBoneMatrices[0];
}

// M = sum_k w_k * M_{j_k}  (or the part's primary bone in rigid mode)
mat4 lbsBlendMatrix() {
  if (uRigidMode == 1) return lbsBoneMatrix(uPrimaryBoneIndex);
  mat4 m = mat4(0.0);
  for (int k = 0; k < 4; k++) {
    float w = skinWeight[k];
    if (w > 0.0) m += w * lbsBoneMatrix(int(skinIndex[k] + 0.5));
  }
  return m;
}
`;

// n' = normalize(sum_k w_k * mat3(M_{j_k}) * n)
const LBS_NORMAL_VERTEX = /* glsl */ `
mat4 lbsM = lbsBlendMatrix();
vec3 lbsN = mat3(lbsM) * objectNormal;
float lbsNLen = length(lbsN);
if (lbsNLen > 1e-6) objectNormal = lbsN / lbsNLen;
`;

// p' = sum_k w_k * M_{j_k} * (p - o_m)
const LBS_POSITION_VERTEX = /* glsl */ `
transformed = (lbsM * vec4(position - uPartOrigin, 1.0)).xyz;
`;

const LBS_PARS_FRAGMENT = /* glsl */ `
uniform bool uUsePartColor;
uniform vec3 uPartColor;
`;

function createLbsSurfaceMaterial(
  source: Material | Material[],
  uniforms: Record<string, { value: unknown }>,
): Material {
  const base = (Array.isArray(source) ? source[0] : source).clone();
  base.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${LBS_PARS_VERTEX}`)
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>\n${LBS_NORMAL_VERTEX}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${LBS_POSITION_VERTEX}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${LBS_PARS_FRAGMENT}`)
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>\nif (uUsePartColor) diffuseColor.rgb = uPartColor;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\nif (uUsePartColor) totalEmissiveRadiance = vec3(0.0);`,
      );
  };
  base.customProgramCacheKey = () => "gundam-lbs-surface";
  return base;
}

const LBS_DEPTH_FRAGMENT_SHADER = /* glsl */ `
#include <packing>
void main() {
  gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
}
`;

interface SkinnedPartEntry {
  partName: string;
  skinnedMesh: SkinnedMesh;
  customMesh: Mesh;
  shaderMaterial: Material;
  lbsUniforms: Record<string, { value: unknown }>;
  depthMaterial: ShaderMaterial;
  geometry: BufferGeometry;
  bones: Object3D[];
  inverseBindMatrices: Matrix4[];
  relInvBinds: Matrix4[];
  origin: Vector3;
  primaryBoneIndex: number;
  boneMatrices: Float32Array;
}

export class LbsManager implements LbsController {
  private mode: SkinningMode = "lbs";
  private shieldVisible = true;
  private entries = new Map<string, SkinnedPartEntry>();
  private boundaries: { mesh: Mesh; index: number }[][] = [];
  private invRootMatrix = new Matrix4();
  private tmpMat = new Matrix4();
  private tmpRef = new Vector3();
  private tmpPt = new Vector3();

  constructor(
    private displayRoot: Group,
    private parts: Record<string, Object3D>,
  ) {
    this.displayRoot.updateMatrixWorld(true);

    for (const [partName, obj] of Object.entries(this.parts)) {
      if (!(obj instanceof SkinnedMesh)) continue;
      const primaryBoneName = PART_PRIMARY_BONE[partName];
      if (!primaryBoneName) continue;

      const bones = [...obj.skeleton.bones];
      const inverseBindMatrices = obj.skeleton.boneInverses.map((m) =>
        m.clone(),
      );
      const primaryBoneIndex = Math.max(
        0,
        bones.findIndex((b) => b.name === primaryBoneName),
      );
      const bindMat = inverseBindMatrices[primaryBoneIndex].clone().invert();
      const origin = new Vector3().setFromMatrixPosition(bindMat);
      const tOrigin = new Matrix4().makeTranslation(
        origin.x,
        origin.y,
        origin.z,
      );
      const relInvBinds = inverseBindMatrices.map((ib) =>
        new Matrix4().multiplyMatrices(ib, tOrigin),
      );
      const boneMatrices = new Float32Array(bones.length * 16);
      const partColor = new Color(PART_DEBUG_COLORS[partName] ?? 0xffffff);

      const uniforms = {
        uBoneMatrices: { value: boneMatrices },
        uPartOrigin: { value: origin.clone() },
        uRigidMode: { value: 0 },
        uPrimaryBoneIndex: { value: primaryBoneIndex },
        uUsePartColor: { value: false },
        uPartColor: { value: partColor },
      };

      const shaderMaterial = createLbsSurfaceMaterial(obj.material, uniforms);

      const depthMaterial = new ShaderMaterial({
        vertexShader: LBS_VERTEX_SHADER,
        fragmentShader: LBS_DEPTH_FRAGMENT_SHADER,
        uniforms,
      });

      // Plain THREE.Mesh (NOT SkinnedMesh): our LBS runs in the vertex stage, the
      // asset's own PBR material shades the surface.
      const customMesh = new Mesh(obj.geometry, shaderMaterial);
      customMesh.name = `${partName}_lbs`;
      customMesh.castShadow = true;
      customMesh.receiveShadow = true;
      customMesh.frustumCulled = false;
      customMesh.customDepthMaterial = depthMaterial;
      this.displayRoot.add(customMesh);

      this.entries.set(partName, {
        partName,
        skinnedMesh: obj,
        customMesh,
        shaderMaterial,
        lbsUniforms: uniforms,
        depthMaterial,
        geometry: obj.geometry,
        bones,
        inverseBindMatrices,
        relInvBinds,
        origin,
        primaryBoneIndex,
        boneMatrices,
      });
    }

    this.updateBoneMatrices();
    this.buildBoundaryGroups();
    this.syncVisibility();
  }

  private buildBoundaryGroups() {
    const vertices = new Map<string, { mesh: Mesh; index: number }[]>();
    const v = new Vector3();
    for (const obj of Object.values(this.parts)) {
      if (!(obj instanceof Mesh)) continue;
      const count = obj.geometry.attributes.position.count;
      for (let i = 0; i < count; i++) {
        this.cpuPosition(obj, i, "lbs", v);
        const key = v
          .toArray()
          .map((n) => Math.round(n * 1e5))
          .join(",");
        const list = vertices.get(key) ?? [];
        list.push({ mesh: obj, index: i });
        vertices.set(key, list);
      }
    }
    this.boundaries = [...vertices.values()].filter(
      (group) => new Set(group.map((g) => g.mesh.uuid)).size > 1,
    );
  }

  private syncVisibility() {
    const isThree = this.mode === "three";
    const rigidFlag = this.mode === "rigid" ? 1 : 0;
    for (const entry of this.entries.values()) {
      const partVisible =
        entry.partName === "shield" ? this.shieldVisible : true;
      entry.skinnedMesh.visible = isThree && partVisible;
      entry.customMesh.visible = !isThree && partVisible;
      entry.lbsUniforms.uRigidMode.value = rigidFlag;
    }
  }

  getMode(): SkinningMode {
    return this.mode;
  }

  setMode(mode: SkinningMode) {
    this.mode = mode;
    this.syncVisibility();
    this.updateBoneMatrices();
  }

  setShieldVisible(visible: boolean) {
    this.shieldVisible = visible;
    this.syncVisibility();
  }

  setAppearance(parts: boolean, wireframe: boolean) {
    for (const entry of this.entries.values()) {
      entry.lbsUniforms.uUsePartColor.value = parts;
      (entry.shaderMaterial as Material & { wireframe: boolean }).wireframe =
        wireframe;
    }
  }

  updateBoneMatrices() {
    this.displayRoot.updateMatrixWorld(true);
    this.invRootMatrix.copy(this.displayRoot.matrixWorld).invert();
    for (const entry of this.entries.values()) {
      const { bones, relInvBinds, boneMatrices } = entry;
      for (let j = 0; j < bones.length; j++) {
        this.tmpMat
          .multiplyMatrices(this.invRootMatrix, bones[j].matrixWorld)
          .multiply(relInvBinds[j]);
        this.tmpMat.toArray(boneMatrices, j * 16);
      }
      if (this.mode === "three") {
        entry.skinnedMesh.skeleton.update();
      }
    }
  }

  /**
   * CPU reference of our LBS / rigid shader math:
   * p' = sum_{k=0..3} w_k * (boneMatrix_{m, j_k} * (p - origin_m))
   */
  cpuPosition(
    mesh: Object3D,
    index: number,
    mode: "lbs" | "rigid",
    target: Vector3,
  ): Vector3 {
    const entry = this.entries.get(mesh.name);
    if (!entry) {
      if (mesh instanceof Mesh) {
        const pos = mesh.geometry.attributes.position;
        target.set(pos.getX(index), pos.getY(index), pos.getZ(index));
        mesh.localToWorld(target);
      }
      return target;
    }

    const pos = entry.geometry.attributes.position;
    const lx = pos.getX(index) - entry.origin.x;
    const ly = pos.getY(index) - entry.origin.y;
    const lz = pos.getZ(index) - entry.origin.z;
    const bm = entry.boneMatrices;

    let rx = 0;
    let ry = 0;
    let rz = 0;

    if (mode === "rigid") {
      const bIdx = entry.primaryBoneIndex * 16;
      rx =
        bm[bIdx + 0] * lx +
        bm[bIdx + 4] * ly +
        bm[bIdx + 8] * lz +
        bm[bIdx + 12];
      ry =
        bm[bIdx + 1] * lx +
        bm[bIdx + 5] * ly +
        bm[bIdx + 9] * lz +
        bm[bIdx + 13];
      rz =
        bm[bIdx + 2] * lx +
        bm[bIdx + 6] * ly +
        bm[bIdx + 10] * lz +
        bm[bIdx + 14];
    } else {
      const skinIndex = entry.geometry.attributes.skinIndex;
      const skinWeight = entry.geometry.attributes.skinWeight;
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(index, k);
        if (w === 0) continue;
        const bIdx = skinIndex.getComponent(index, k) * 16;
        const vx =
          bm[bIdx + 0] * lx +
          bm[bIdx + 4] * ly +
          bm[bIdx + 8] * lz +
          bm[bIdx + 12];
        const vy =
          bm[bIdx + 1] * lx +
          bm[bIdx + 5] * ly +
          bm[bIdx + 9] * lz +
          bm[bIdx + 13];
        const vz =
          bm[bIdx + 2] * lx +
          bm[bIdx + 6] * ly +
          bm[bIdx + 10] * lz +
          bm[bIdx + 14];
        rx += w * vx;
        ry += w * vy;
        rz += w * vz;
      }
    }

    target.set(rx, ry, rz).applyMatrix4(this.displayRoot.matrixWorld);
    return target;
  }

  computeSeamStats(mode?: "lbs" | "rigid"): SeamStats {
    const evalMode = mode ?? (this.mode === "rigid" ? "rigid" : "lbs");
    this.updateBoneMatrices();
    let maxGap = 0;
    let sumGap = 0;
    let pairCount = 0;
    for (const group of this.boundaries) {
      this.cpuPosition(group[0].mesh, group[0].index, evalMode, this.tmpRef);
      for (let i = 1; i < group.length; i++) {
        const item = group[i];
        this.cpuPosition(item.mesh, item.index, evalMode, this.tmpPt);
        const dist = this.tmpRef.distanceTo(this.tmpPt);
        if (dist > maxGap) maxGap = dist;
        sumGap += dist;
        pairCount++;
      }
    }
    return {
      maxGap,
      meanGap: pairCount > 0 ? sumGap / pairCount : 0,
      boundaryGroups: this.boundaries.length,
    };
  }

  compareWithThreeSkinning(): LbsComparisonStats {
    this.updateBoneMatrices();
    let maxDiff = 0;
    let sumDiff = 0;
    let vertexCount = 0;
    for (const entry of this.entries.values()) {
      const count = entry.geometry.attributes.position.count;
      for (let i = 0; i < count; i++) {
        this.cpuPosition(entry.skinnedMesh, i, "lbs", this.tmpRef);
        entry.skinnedMesh.getVertexPosition(i, this.tmpPt);
        entry.skinnedMesh.localToWorld(this.tmpPt);
        const d = this.tmpRef.distanceTo(this.tmpPt);
        if (d > maxDiff) maxDiff = d;
        sumDiff += d;
        vertexCount++;
      }
    }
    return {
      maxDiff,
      meanDiff: vertexCount > 0 ? sumDiff / vertexCount : 0,
      vertexCount,
    };
  }
}
