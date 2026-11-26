import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Plane,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Camera, Scene, WebGLRenderer } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * Viewport markers for the two-bone IK target (orange sphere) and pole (cyan
 * diamond), plus a thin line shoulder → target. Lives in world space, outside the
 * model's displayRoot, so it never takes part in skinning / appearance passes.
 */
export class IkGizmo {
  readonly group = new Group();
  readonly target: Mesh;
  readonly pole: Mesh;
  private line: Line;
  private linePositions: Float32BufferAttribute;

  constructor(scene: Scene) {
    this.group.name = "ikGizmo";
    this.group.visible = false;
    const overlay = { depthTest: false, depthWrite: false, transparent: true };
    this.target = new Mesh(
      new SphereGeometry(0.032, 20, 14),
      new MeshBasicMaterial({ color: 0xff8a2a, opacity: 0.95, ...overlay }),
    );
    this.target.name = "ikTarget";
    this.pole = new Mesh(
      new OctahedronGeometry(0.026),
      new MeshBasicMaterial({ color: 0x46c9c1, opacity: 0.9, ...overlay }),
    );
    this.pole.name = "ikPole";
    this.linePositions = new Float32BufferAttribute(new Float32Array(9), 3);
    const lineGeom = new BufferGeometry();
    lineGeom.setAttribute("position", this.linePositions);
    this.line = new Line(
      lineGeom,
      new LineBasicMaterial({ color: 0xffc58a, opacity: 0.6, ...overlay }),
    );
    this.line.frustumCulled = false;
    for (const o of [this.line, this.target, this.pole]) {
      o.renderOrder = 10;
      this.group.add(o);
    }
    scene.add(this.group);

    this.feetGroup.name = "footPlantGizmo";
    this.feetGroup.visible = false;
    const footMat = new MeshBasicMaterial({
      color: 0x7fd36b,
      opacity: 0.9,
      ...overlay,
    });
    const footGeom = new SphereGeometry(0.036, 16, 10);
    const kneeMat = new MeshBasicMaterial({
      color: 0xb48cff,
      opacity: 0.9,
      ...overlay,
    });
    const kneeGeom = new OctahedronGeometry(0.03);
    const kneeLineMat = new LineBasicMaterial({
      color: 0xb48cff,
      opacity: 0.55,
      ...overlay,
    });
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? "right" : "left";
      const m = new Mesh(footGeom, footMat);
      m.name = `${side}FootPlant`;
      const k = new Mesh(kneeGeom, kneeMat);
      k.name = `${side}KneePole`;
      const pos = new Float32BufferAttribute(new Float32Array(6), 3);
      const g = new BufferGeometry();
      g.setAttribute("position", pos);
      const l = new Line(g, kneeLineMat);
      l.frustumCulled = false;
      for (const o of [m, k, l]) {
        o.renderOrder = 10;
        this.feetGroup.add(o);
      }
      this.feet.push(m);
      this.knees.push(k);
      this.kneeLines.push(pos);
    }
    scene.add(this.feetGroup);
  }

  /**
   * Green spheres on the planted ankles and purple diamonds on the knee poles,
   * each with a thin line from the knee to its pole (world space, [right, left]).
   */
  readonly feetGroup = new Group();
  readonly feet: Mesh[] = [];
  readonly knees: Mesh[] = [];
  private kneeLines: Float32BufferAttribute[] = [];
  updateFeet(
    visible: boolean,
    plantsWorld: Vector3[],
    polesWorld: Vector3[],
    kneesWorld: Vector3[],
  ) {
    this.feetGroup.visible = visible;
    if (!visible) return;
    plantsWorld.forEach((p, i) => this.feet[i]?.position.copy(p));
    polesWorld.forEach((p, i) => {
      this.knees[i]?.position.copy(p);
      const k = kneesWorld[i];
      const line = this.kneeLines[i];
      if (!k || !line) return;
      line.setXYZ(0, k.x, k.y, k.z);
      line.setXYZ(1, p.x, p.y, p.z);
      line.needsUpdate = true;
    });
  }

  /** All points in world space. The guide line runs target ← shoulder → pole. */
  update(
    visible: boolean,
    targetWorld: Vector3,
    poleWorld: Vector3,
    shoulderWorld: Vector3,
  ) {
    this.group.visible = visible;
    if (!visible) return;
    this.target.position.copy(targetWorld);
    this.pole.position.copy(poleWorld);
    const p = this.linePositions;
    p.setXYZ(0, targetWorld.x, targetWorld.y, targetWorld.z);
    p.setXYZ(1, shoulderWorld.x, shoulderWorld.y, shoulderWorld.z);
    p.setXYZ(2, poleWorld.x, poleWorld.y, poleWorld.z);
    p.needsUpdate = true;
  }
}

export interface IkDragHandlers {
  target(world: Vector3): void;
  pole(world: Vector3): void;
  /** Planted ankle `leg` (0 = right, 1 = left), dragged in the sagittal plane. */
  foot(leg: 0 | 1, world: Vector3): void;
  /** World normal of `leg`'s own swing plane (hip→ankle and body forward). */
  footPlaneNormal(leg: 0 | 1): Vector3;
  /** Knee pole of `leg` dragged on the camera-facing plane. */
  knee(leg: 0 | 1, world: Vector3): void;
}

type DragKind = "target" | "pole" | "foot0" | "foot1" | "knee0" | "knee1";

/**
 * Drag the IK target / pole and knee poles on a camera-facing plane through the
 * picked marker, and the planted-foot markers in their leg's swing plane
 * (forward/back, and up/down along the leg). Listens in the capture phase so OrbitControls is
 * disabled before it sees the pointerdown; orbiting resumes on release.
 */
export function attachIkDrag(
  world: {
    camera: Camera;
    renderer: WebGLRenderer;
    controls: OrbitControls;
  },
  gizmo: IkGizmo,
  handlers: IkDragHandlers,
) {
  const el = world.renderer.domElement;
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const plane = new Plane();
  const hit = new Vector3();
  const camDir = new Vector3();
  const grabOffset = new Vector3();
  let dragging: DragKind | null = null;
  let pointerId = -1;

  const setRay = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, world.camera);
  };
  const markerOf = (k: DragKind) =>
    k === "target"
      ? gizmo.target
      : k === "pole"
        ? gizmo.pole
        : k === "foot0" || k === "foot1"
          ? gizmo.feet[k === "foot0" ? 0 : 1]
          : gizmo.knees[k === "knee0" ? 0 : 1];
  const pick = (): DragKind | null => {
    const candidates: [DragKind, Mesh][] = [];
    if (gizmo.group.visible)
      candidates.push(["target", gizmo.target], ["pole", gizmo.pole]);
    if (gizmo.feetGroup.visible)
      candidates.push(
        ["foot0", gizmo.feet[0]],
        ["foot1", gizmo.feet[1]],
        ["knee0", gizmo.knees[0]],
        ["knee1", gizmo.knees[1]],
      );
    if (!candidates.length) return null;
    const hits = raycaster.intersectObjects(
      candidates.map(([, m]) => m),
      false,
    );
    if (!hits.length) return null;
    return candidates.find(([, m]) => m === hits[0].object)?.[0] ?? null;
  };

  el.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      setRay(e);
      const which = pick();
      if (!which) return;
      const marker = markerOf(which);
      if (which === "foot0" || which === "foot1") {
        // legs walk fore–aft: the foot moves in its leg's own swing plane
        // (forward/back, and up toward the hip), so it cannot splay sideways
        plane.setFromNormalAndCoplanarPoint(
          handlers.footPlaneNormal(which === "foot0" ? 0 : 1),
          marker.position,
        );
      } else {
        world.camera.getWorldDirection(camDir);
        plane.setFromNormalAndCoplanarPoint(camDir, marker.position);
      }
      if (raycaster.ray.intersectPlane(plane, hit))
        grabOffset.subVectors(marker.position, hit);
      else grabOffset.set(0, 0, 0);
      dragging = which;
      pointerId = e.pointerId;
      world.controls.enabled = false;
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    { capture: true },
  );
  el.addEventListener("pointermove", (e) => {
    setRay(e);
    if (!dragging) {
      el.style.cursor = pick() ? "grab" : "";
      return;
    }
    if (e.pointerId !== pointerId) return;
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    hit.add(grabOffset);
    if (dragging === "target") handlers.target(hit.clone());
    else if (dragging === "pole") handlers.pole(hit.clone());
    else if (dragging === "foot0" || dragging === "foot1")
      handlers.foot(dragging === "foot0" ? 0 : 1, hit.clone());
    else handlers.knee(dragging === "knee0" ? 0 : 1, hit.clone());
    el.style.cursor = "grabbing";
  });
  const end = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = null;
    pointerId = -1;
    world.controls.enabled = true;
    el.style.cursor = "";
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}
