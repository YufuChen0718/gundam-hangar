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
  Texture,
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

const LBS_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
uniform bool uHasMap;
uniform bool uUsePartColor;
uniform vec3 uPartColor;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

vec3 srgbToLinear(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(2.2));
}

vec3 linearToSrgb(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
}

vec3 acesToneMap(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 baseLinear = srgbToLinear(uPartColor);
  if (!uUsePartColor && uHasMap) {
    vec4 texel = texture2D(uMap, vUv);
    baseLinear = srgbToLinear(texel.rgb);
  }

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  vec3 L1 = normalize(vec3(-3.0, 5.0, 4.0));
  vec3 L2 = normalize(vec3(3.0, 2.0, -3.0));
  float ndl1 = max(dot(N, L1), 0.0);
  float ndl2 = max(dot(N, L2), 0.0);

  vec3 H1 = normalize(L1 + V);
  float spec1 = pow(max(dot(N, H1), 0.0), 36.0) * ndl1;

  float hemiWeight = 0.5 * N.y + 0.5;
  vec3 hemiColor = mix(vec3(0.10, 0.10, 0.11), vec3(0.68, 0.78, 0.95), hemiWeight);

  vec3 irradiance =
    vec3(1.0, 0.93, 0.84) * (1.25 * ndl1) +
    vec3(0.55, 0.75, 1.0) * (0.65 * ndl2) +
    hemiColor * 0.65 +
    vec3(0.10);

  vec3 colorLinear = baseLinear * irradiance + vec3(1.0, 0.96, 0.90) * (0.14 * spec1);
  vec3 mapped = acesToneMap(colorLinear * 1.15);
  gl_FragColor = vec4(linearToSrgb(mapped), 1.0);
}
`;

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
  shaderMaterial: ShaderMaterial;
  depthMaterial: ShaderMaterial;
  geometry: BufferGeometry;
  bones: Object3D[];
  inverseBindMatrices: Matrix4[];
  relInvBinds: Matrix4[];
  origin: Vector3;
  primaryBoneIndex: number;
  boneMatrices: Float32Array;
}

function extractBaseMap(mat: Material | Material[]): Texture | null {
  const m = Array.isArray(mat) ? mat[0] : mat;
  if (m && "map" in m && m.map instanceof Object) {
    return m.map as Texture;
  }
  return null;
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
      const baseMap = extractBaseMap(obj.material);
      const partColor = new Color(PART_DEBUG_COLORS[partName] ?? 0xffffff);

      const uniforms = {
        uBoneMatrices: { value: boneMatrices },
        uPartOrigin: { value: origin.clone() },
        uRigidMode: { value: 0 },
        uPrimaryBoneIndex: { value: primaryBoneIndex },
        uMap: { value: baseMap },
        uHasMap: { value: Boolean(baseMap) },
        uUsePartColor: { value: false },
        uPartColor: { value: partColor },
      };

      const shaderMaterial = new ShaderMaterial({
        vertexShader: LBS_VERTEX_SHADER,
        fragmentShader: LBS_FRAGMENT_SHADER,
        uniforms,
      });

      const depthMaterial = new ShaderMaterial({
        vertexShader: LBS_VERTEX_SHADER,
        fragmentShader: LBS_DEPTH_FRAGMENT_SHADER,
        uniforms,
      });

      // Plain THREE.Mesh (NOT SkinnedMesh) rendered by our custom LBS ShaderMaterial.
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
      entry.shaderMaterial.uniforms.uRigidMode.value = rigidFlag;
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
      entry.shaderMaterial.uniforms.uUsePartColor.value = parts;
      entry.shaderMaterial.wireframe = wireframe;
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
