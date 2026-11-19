import {
  BufferAttribute,
  Color,
  Matrix4,
  Mesh,
  ShaderMaterial,
  SkinnedMesh,
  Uint16BufferAttribute,
  Float32BufferAttribute,
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
  SkirtJointName,
  StrainStats,
} from "./types";

const MAX_BONES = 24;

export const PART_PRIMARY_BONE: Record<string, JointName | SkirtJointName> = {
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
  frontRightSkirtPart: "frontRightSkirt",
  frontLeftSkirtPart: "frontLeftSkirt",
  sideRightSkirtPart: "sideRightSkirt",
  sideLeftSkirtPart: "sideLeftSkirt",
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
  frontRightSkirtPart: 0xf5d442,
  frontLeftSkirtPart: 0xe8be32,
  sideRightSkirtPart: 0xe6659e,
  sideLeftSkirtPart: 0xd957b2,
  rifle: 0xea6676,
  shield: 0x7b9ec2,
};

function resolvePrimaryBone(partName: string): JointName | SkirtJointName | undefined {
  const baseName = partName.endsWith("_cap") ? partName.slice(0, -4) : partName;
  return PART_PRIMARY_BONE[baseName];
}

const LBS_VERTEX_SHADER = /* glsl */ `
attribute vec4 skinIndex;
attribute vec4 skinWeight;

uniform mat4 uBoneMatrices[${MAX_BONES}];
uniform vec3 uPartOrigin;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

mat4 getBoneMatrix(int index) {
  for (int i = 0; i < ${MAX_BONES}; i++) {
    if (i == index) return uBoneMatrices[i];
  }
  return uBoneMatrices[0];
}

void main() {
  vec3 localPos = position - uPartOrigin;
  vec3 skinnedPos = vec3(0.0);
  vec3 skinnedNormal = vec3(0.0);

  for (int k = 0; k < 4; k++) {
    float w = skinWeight[k];
    if (w > 0.0) {
      int idx = int(skinIndex[k] + 0.5);
      mat4 m = getBoneMatrix(idx);
      skinnedPos += w * (m * vec4(localPos, 1.0)).xyz;
      skinnedNormal += w * (mat3(m) * normal);
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
// Rigid armor mode uses the exact same LBS shader with per-vertex weights = (1,0,0,0)
// bound to a single bone (no separate shader needed). Smooth LBS uses 2-ring shared weights.
// No Three.js skinning chunk is used (customMesh is a plain THREE.Mesh).
const LBS_PARS_VERTEX = /* glsl */ `
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute float aVertexStrain;
uniform mat4 uBoneMatrices[${MAX_BONES}];
uniform vec3 uPartOrigin;
varying float vVertexStrain;

mat4 lbsBoneMatrix(int index) {
  for (int i = 0; i < ${MAX_BONES}; i++) {
    if (i == index) return uBoneMatrices[i];
  }
  return uBoneMatrices[0];
}

// M = sum_k w_k * M_{j_k}
mat4 lbsBlendMatrix() {
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
vVertexStrain = aVertexStrain;
`;

// p' = sum_k w_k * M_{j_k} * (p - o_m)
const LBS_POSITION_VERTEX = /* glsl */ `
transformed = (lbsM * vec4(position - uPartOrigin, 1.0)).xyz;
`;

const LBS_PARS_FRAGMENT = /* glsl */ `
uniform bool uUsePartColor;
uniform vec3 uPartColor;
uniform bool uShowStrain;
varying float vVertexStrain;

vec3 strainHeatmapColor(float s) {
  // 0.00 -> deep navy, 0.03 -> cyan, 0.08 -> green, 0.16 -> yellow, >=0.28 -> red
  float t = clamp(s / 0.28, 0.0, 1.0);
  vec3 c0 = vec3(0.08, 0.16, 0.46);
  vec3 c1 = vec3(0.05, 0.68, 0.85);
  vec3 c2 = vec3(0.22, 0.86, 0.34);
  vec3 c3 = vec3(0.98, 0.86, 0.14);
  vec3 c4 = vec3(0.95, 0.10, 0.08);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
  return mix(c3, c4, (t - 0.75) / 0.25);
}
`;

function createLbsSurfaceMaterial(
  source: Material | Material[],
  uniforms: Record<string, { value: unknown }>,
  cacheTag: string,
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
        `#include <map_fragment>\nif (uShowStrain) { diffuseColor.rgb = strainHeatmapColor(vVertexStrain); } else if (uUsePartColor) { diffuseColor.rgb = uPartColor; }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\nif (uShowStrain) { totalEmissiveRadiance = strainHeatmapColor(vVertexStrain) * 0.22; } else if (uUsePartColor) { totalEmissiveRadiance = vec3(0.0); }`,
      );
  };
  base.customProgramCacheKey = () => `gundam-lbs-surface-v2-${cacheTag}`;
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
  isCap: boolean;
  skinnedMesh: SkinnedMesh;
  customMesh: Mesh;
  shaderMaterial: Material;
  lbsUniforms: Record<string, { value: unknown }>;
  depthMaterial: ShaderMaterial;
  geometry: BufferGeometry;
  customGeometry: BufferGeometry;
  smoothSkinIndex: BufferAttribute;
  smoothSkinWeight: BufferAttribute;
  rigidSkinIndex: Uint16BufferAttribute;
  rigidSkinWeight: Float32BufferAttribute;
  strainAttr: Float32BufferAttribute;
  bones: Object3D[];
  inverseBindMatrices: Matrix4[];
  relInvBinds: Matrix4[];
  origin: Vector3;
  primaryBoneIndex: number;
  boneMatrices: Float32Array;
}

export class LbsManager implements LbsController {
  private mode: SkinningMode = "rigid";
  private shieldVisible = true;
  private showStrain = false;
  private innerFrameVisible = true;
  private entries = new Map<string, SkinnedPartEntry>();
  private boundaries: { mesh: Mesh; index: number }[][] = [];
  private invRootMatrix = new Matrix4();
  private tmpMat = new Matrix4();
  private tmpRef = new Vector3();
  private tmpPt = new Vector3();
  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpC = new Vector3();
  private tmpRA = new Vector3();
  private tmpRB = new Vector3();
  private tmpRC = new Vector3();

  constructor(
    private displayRoot: Group,
    private parts: Record<string, Object3D>,
    private rigidCaps: Object3D[] = [],
    private jointFillers: Object3D[] = [],
  ) {
    this.displayRoot.updateMatrixWorld(true);

    const allCandidates: [string, Object3D, boolean][] = [
      ...Object.entries(this.parts).map(
        ([n, o]) => [n, o, false] as [string, Object3D, boolean],
      ),
      ...this.rigidCaps.map(
        (o) => [o.name, o, true] as [string, Object3D, boolean],
      ),
    ];

    for (const [partName, obj, isCap] of allCandidates) {
      if (!(obj instanceof SkinnedMesh)) continue;
      const primaryBoneName = resolvePrimaryBone(partName);
      if (!primaryBoneName) continue;

      const bones = [...obj.skeleton.bones];
      const inverseBindMatrices = obj.skeleton.boneInverses.map((m) =>
        m.clone(),
      );
      let primaryBoneIndex = bones.findIndex((b) => b.name === primaryBoneName);
      if (primaryBoneIndex < 0) {
        // Fallback for models without secondary skirt bones
        primaryBoneIndex = Math.max(
          0,
          bones.findIndex((b) => b.name === "pelvis"),
        );
      }
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
      const boneMatrices = new Float32Array(MAX_BONES * 16);
      // Fill unused bone slots with identity matrices
      const ident = new Matrix4();
      for (let j = bones.length; j < MAX_BONES; j++) {
        ident.toArray(boneMatrices, j * 16);
      }

      const vCount = obj.geometry.attributes.position.count;
      const smoothSkinIndex = obj.geometry.attributes
        .skinIndex as BufferAttribute;
      const smoothSkinWeight = obj.geometry.attributes
        .skinWeight as BufferAttribute;

      // Explicit rigid 1.0 weights (one bone per vertex, zero blend bands)
      const rigidIdxArr = new Uint16Array(vCount * 4);
      const rigidWgtArr = new Float32Array(vCount * 4);
      for (let i = 0; i < vCount; i++) {
        rigidIdxArr[i * 4 + 0] = primaryBoneIndex;
        rigidWgtArr[i * 4 + 0] = 1.0;
      }
      const rigidSkinIndex = new Uint16BufferAttribute(rigidIdxArr, 4);
      const rigidSkinWeight = new Float32BufferAttribute(rigidWgtArr, 4);
      const strainAttr = new Float32BufferAttribute(new Float32Array(vCount), 1);

      // Shallow-cloned geometry sharing vertex buffers, swapping skinIndex/skinWeight by mode
      const customGeometry = obj.geometry.clone();
      customGeometry.setAttribute("skinIndex", rigidSkinIndex);
      customGeometry.setAttribute("skinWeight", rigidSkinWeight);
      customGeometry.setAttribute("aVertexStrain", strainAttr);

      const partColor = new Color(
        isCap ? 0x1a1d22 : (PART_DEBUG_COLORS[partName] ?? 0xffffff),
      );

      const uniforms = {
        uBoneMatrices: { value: boneMatrices },
        uPartOrigin: { value: origin.clone() },
        uUsePartColor: { value: false },
        uPartColor: { value: partColor },
        uShowStrain: { value: false },
      };

      const shaderMaterial = createLbsSurfaceMaterial(
        obj.material,
        uniforms,
        isCap ? "cap" : "armor",
      );

      const depthMaterial = new ShaderMaterial({
        vertexShader: LBS_VERTEX_SHADER,
        fragmentShader: LBS_DEPTH_FRAGMENT_SHADER,
        uniforms,
      });

      // Plain THREE.Mesh (NOT SkinnedMesh): our LBS vertex stage runs for BOTH
      // rigid armor (weights 1.0 to one bone) and smooth LBS (2-ring weights).
      const customMesh = new Mesh(customGeometry, shaderMaterial);
      customMesh.name = `${partName}_lbs`;
      customMesh.castShadow = true;
      customMesh.receiveShadow = true;
      customMesh.frustumCulled = false;
      customMesh.customDepthMaterial = depthMaterial;
      this.displayRoot.add(customMesh);

      this.entries.set(partName, {
        partName,
        isCap,
        skinnedMesh: obj,
        customMesh,
        shaderMaterial,
        lbsUniforms: uniforms,
        depthMaterial,
        geometry: obj.geometry,
        customGeometry,
        smoothSkinIndex,
        smoothSkinWeight,
        rigidSkinIndex,
        rigidSkinWeight,
        strainAttr,
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
    const isRigid = this.mode === "rigid";
    for (const entry of this.entries.values()) {
      const partVisible = entry.isCap
        ? isRigid && !this.showStrain && this.innerFrameVisible
        : entry.partName === "shield"
          ? this.shieldVisible
          : true;

      entry.skinnedMesh.visible = !entry.isCap && isThree && partVisible;
      entry.customMesh.visible = !isThree && partVisible;

      // Swap skinIndex / skinWeight attributes so Rigid armor runs the exact same LBS shader with weight 1.0
      if (!isThree) {
        entry.customGeometry.setAttribute(
          "skinIndex",
          isRigid || entry.isCap ? entry.rigidSkinIndex : entry.smoothSkinIndex,
        );
        entry.customGeometry.setAttribute(
          "skinWeight",
          isRigid || entry.isCap
            ? entry.rigidSkinWeight
            : entry.smoothSkinWeight,
        );
      }
    }
    for (const filler of this.jointFillers) {
      filler.visible = isRigid && !this.showStrain && this.innerFrameVisible;
    }
  }

  getMode(): SkinningMode {
    return this.mode;
  }

  setMode(mode: SkinningMode) {
    this.mode = mode;
    this.syncVisibility();
    this.updateBoneMatrices();
    if (this.showStrain) this.refreshStrainAttributes();
  }

  setShieldVisible(visible: boolean) {
    this.shieldVisible = visible;
    this.syncVisibility();
  }

  setAppearance(parts: boolean, wireframe: boolean) {
    for (const entry of this.entries.values()) {
      entry.lbsUniforms.uUsePartColor.value = parts && !entry.isCap;
      (entry.shaderMaterial as Material & { wireframe: boolean }).wireframe =
        wireframe;
    }
  }

  setStrainHeatmap(enabled: boolean) {
    this.showStrain = enabled;
    for (const entry of this.entries.values()) {
      entry.lbsUniforms.uShowStrain.value = enabled && !entry.isCap;
    }
    this.syncVisibility();
    if (enabled) this.refreshStrainAttributes();
  }

  setRigidInnerFrameVisible(visible: boolean) {
    this.innerFrameVisible = visible;
    this.syncVisibility();
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
      if (this.mode === "three" && !entry.isCap) {
        entry.skinnedMesh.skeleton.update();
      }
    }
    if (this.showStrain) this.refreshStrainAttributes();
  }

  /**
   * CPU reference of our LBS vertex math:
   *   p' = sum_{k=0..3} w_k * (boneMatrix_{m, j_k} * (p - origin_m))
   * In rigid mode, w = (1, 0, 0, 0) and j_0 = primaryBoneIndex.
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

    const skinIndex =
      mode === "rigid" || entry.isCap
        ? entry.rigidSkinIndex
        : entry.smoothSkinIndex;
    const skinWeight =
      mode === "rigid" || entry.isCap
        ? entry.rigidSkinWeight
        : entry.smoothSkinWeight;

    let rx = 0;
    let ry = 0;
    let rz = 0;

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

    target.set(rx, ry, rz).applyMatrix4(this.displayRoot.matrixWorld);
    return target;
  }

  private refreshStrainAttributes() {
    const evalMode: "lbs" | "rigid" = this.mode === "rigid" ? "rigid" : "lbs";
    for (const entry of this.entries.values()) {
      if (entry.isCap) continue;
      const arr = entry.strainAttr.array as Float32Array;
      arr.fill(0);
      const pos = entry.geometry.attributes.position;
      const index = entry.geometry.index;
      const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
      for (let t = 0; t < triCount; t++) {
        const i0 = index ? index.getX(t * 3 + 0) : t * 3 + 0;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

        this.tmpRA.fromBufferAttribute(pos, i0);
        this.tmpRB.fromBufferAttribute(pos, i1);
        this.tmpRC.fromBufferAttribute(pos, i2);
        const l01 = this.tmpRA.distanceTo(this.tmpRB);
        const l12 = this.tmpRB.distanceTo(this.tmpRC);
        const l20 = this.tmpRC.distanceTo(this.tmpRA);

        this.cpuPosition(entry.skinnedMesh, i0, evalMode, this.tmpA);
        this.cpuPosition(entry.skinnedMesh, i1, evalMode, this.tmpB);
        this.cpuPosition(entry.skinnedMesh, i2, evalMode, this.tmpC);
        const s01 = l01 > 1e-8 ? Math.abs(this.tmpA.distanceTo(this.tmpB) - l01) / l01 : 0;
        const s12 = l12 > 1e-8 ? Math.abs(this.tmpB.distanceTo(this.tmpC) - l12) / l12 : 0;
        const s20 = l20 > 1e-8 ? Math.abs(this.tmpC.distanceTo(this.tmpA) - l20) / l20 : 0;
        const sMax = Math.max(s01, s12, s20);
        if (sMax > arr[i0]) arr[i0] = sMax;
        if (sMax > arr[i1]) arr[i1] = sMax;
        if (sMax > arr[i2]) arr[i2] = sMax;
      }
      entry.strainAttr.needsUpdate = true;
    }
  }

  /**
   * Per-triangle edge-length strain |l' - l| / l across all outer armor triangles.
   */
  computeEdgeStrain(mode?: "lbs" | "rigid"): StrainStats {
    const evalMode = mode ?? (this.mode === "rigid" ? "rigid" : "lbs");
    this.updateBoneMatrices();
    let maxStrain = 0;
    let sumTriStrain = 0;
    let triangleCount = 0;
    let strainedTrianglesOver1Pct = 0;

    for (const entry of this.entries.values()) {
      if (entry.isCap) continue;
      const pos = entry.geometry.attributes.position;
      const index = entry.geometry.index;
      const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
      for (let t = 0; t < triCount; t++) {
        const i0 = index ? index.getX(t * 3 + 0) : t * 3 + 0;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

        this.tmpRA.fromBufferAttribute(pos, i0);
        this.tmpRB.fromBufferAttribute(pos, i1);
        this.tmpRC.fromBufferAttribute(pos, i2);
        const l01 = this.tmpRA.distanceTo(this.tmpRB);
        const l12 = this.tmpRB.distanceTo(this.tmpRC);
        const l20 = this.tmpRC.distanceTo(this.tmpRA);

        this.cpuPosition(entry.skinnedMesh, i0, evalMode, this.tmpA);
        this.cpuPosition(entry.skinnedMesh, i1, evalMode, this.tmpB);
        this.cpuPosition(entry.skinnedMesh, i2, evalMode, this.tmpC);
        const s01 = l01 > 1e-8 ? Math.abs(this.tmpA.distanceTo(this.tmpB) - l01) / l01 : 0;
        const s12 = l12 > 1e-8 ? Math.abs(this.tmpB.distanceTo(this.tmpC) - l12) / l12 : 0;
        const s20 = l20 > 1e-8 ? Math.abs(this.tmpC.distanceTo(this.tmpA) - l20) / l20 : 0;

        const triMax = Math.max(s01, s12, s20);
        const triMean = (s01 + s12 + s20) / 3;
        if (triMax > maxStrain) maxStrain = triMax;
        if (triMax > 0.01) strainedTrianglesOver1Pct++;
        sumTriStrain += triMean;
        triangleCount++;
      }
    }

    return {
      maxStrain,
      meanStrain: triangleCount > 0 ? sumTriStrain / triangleCount : 0,
      triangleCount,
      strainedTrianglesOver1Pct,
    };
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
      if (entry.isCap) continue;
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
