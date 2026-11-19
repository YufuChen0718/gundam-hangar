import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  CylinderGeometry,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export function createScene(container: HTMLElement) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  container.append(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color("#171d24");
  const camera = new PerspectiveCamera(33, 1, 0.05, 40);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.96, 0);
  controls.minDistance = 0.35;
  controls.maxDistance = 8;
  controls.maxPolarAngle = Math.PI * 0.54;
  const light = new DirectionalLight(0xfff4e4, 3.8);
  light.position.set(-3, 5, 4);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.left = -2;
  light.shadow.camera.right = 2;
  light.shadow.camera.top = 3;
  light.shadow.camera.bottom = -2;
  light.shadow.normalBias = 0.025;
  scene.add(
    light,
    new HemisphereLight(0xdcecff, 0x393838, 2.4),
    new AmbientLight(0xffffff, 0.3),
  );
  const fill = new DirectionalLight(0xaacfff, 2);
  fill.position.set(3, 2, -3);
  scene.add(fill);
  const stage = new Mesh(
    new CylinderGeometry(0.94, 1.0, 0.075, 80),
    new MeshStandardMaterial({
      color: 0x303943,
      roughness: 0.7,
      metalness: 0.35,
    }),
  );
  stage.position.y = -0.04;
  stage.receiveShadow = true;
  scene.add(stage);
  const rim = new Mesh(
    new TorusGeometry(0.935, 0.005, 8, 100),
    new MeshStandardMaterial({
      color: 0xd7a15b,
      emissive: 0xd7a15b,
      emissiveIntensity: 0.35,
    }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.001;
  scene.add(rim);
  const grid = new GridHelper(20, 80, 0x38414c, 0x242c35);
  grid.position.y = -0.08;
  scene.add(grid);
  function resetCamera() {
    camera.position.set(-2.5, 1.85, 4.4);
    controls.target.set(0, 0.96, 0);
    controls.update();
  }
  function front() {
    camera.position.set(0, 1.1, 5);
    controls.target.set(0, 0.96, 0);
    controls.update();
  }
  function side() {
    camera.position.set(-4.8, 1.35, 0.1);
    controls.target.set(0, 0.96, 0);
    controls.update();
  }
  function back() {
    camera.position.set(-1.8, 1.75, -4.8);
    controls.target.set(-0.15, 1.1, 0);
    controls.update();
  }
  function top() {
    camera.position.set(-2.0, 4.5, 2.2);
    controls.target.set(-0.15, 1.05, 0);
    controls.update();
  }
  function zoom(factor: number) {
    camera.position
      .sub(controls.target)
      .multiplyScalar(factor)
      .add(controls.target);
    controls.update();
  }
  function focus(
    target: [number, number, number],
    cameraPos: [number, number, number],
  ) {
    controls.target.set(target[0], target[1], target[2]);
    camera.position.set(cameraPos[0], cameraPos[1], cameraPos[2]);
    controls.update();
  }

  /**
   * Renders the current scene from an arbitrary camera position into a crisp 512x512
   * offscreen target against a pure #ff00ff background (with stage/grid hidden) and
   * counts interior background pixels showing through the body silhouette (holes).
   */
  function measureSilhouetteHoleView(
    target: [number, number, number],
    cameraPos: [number, number, number],
    size = 512,
  ) {
    const savedBg = scene.background;
    const savedTone = renderer.toneMapping;
    const savedStage = stage.visible;
    const savedRim = rim.visible;
    const savedGrid = grid.visible;
    const savedAspect = camera.aspect;
    const savedPos = camera.position.clone();
    const savedTarget = controls.target.clone();

    const rt = new WebGLRenderTarget(size, size, { depthBuffer: true });
    const buf = new Uint8Array(size * size * 4);
    try {
      stage.visible = false;
      rim.visible = false;
      grid.visible = false;
      scene.background = new Color(0xff00ff);
      renderer.toneMapping = NoToneMapping;
      camera.aspect = 1;
      camera.position.set(cameraPos[0], cameraPos[1], cameraPos[2]);
      camera.lookAt(target[0], target[1], target[2]);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      renderer.setRenderTarget(null);
    } finally {
      rt.dispose();
      stage.visible = savedStage;
      rim.visible = savedRim;
      grid.visible = savedGrid;
      scene.background = savedBg;
      renderer.toneMapping = savedTone;
      camera.aspect = savedAspect;
      camera.position.copy(savedPos);
      controls.target.copy(savedTarget);
      camera.updateProjectionMatrix();
      controls.update();
    }

    const total = size * size;
    const isBg = new Uint8Array(total);
    let bodyPixels = 0;
    for (let i = 0; i < total; i++) {
      const r = buf[i * 4];
      const g = buf[i * 4 + 1];
      const b = buf[i * 4 + 2];
      if (r > 215 && g < 35 && b > 215) {
        isBg[i] = 1;
      } else {
        bodyPixels++;
      }
    }

    // 4-connected flood-fill from image edges to mark exterior background
    const exterior = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    const enqueue = (idx: number) => {
      if (isBg[idx] && !exterior[idx]) {
        exterior[idx] = 1;
        queue[tail++] = idx;
      }
    };
    for (let x = 0; x < size; x++) {
      enqueue(x);
      enqueue((size - 1) * size + x);
    }
    for (let y = 0; y < size; y++) {
      enqueue(y * size);
      enqueue(y * size + (size - 1));
    }
    while (head < tail) {
      const idx = queue[head++];
      const x = idx % size;
      const y = (idx - x) / size;
      if (x > 0) enqueue(idx - 1);
      if (x + 1 < size) enqueue(idx + 1);
      if (y > 0) enqueue(idx - size);
      if (y + 1 < size) enqueue(idx + size);
    }

    // Count connected components of interior hole pixels + classify whether inside hand-fist region
    const visited = new Uint8Array(total);
    let holePixels = 0;
    const components: { size: number; cx: number; cy: number }[] = [];
    for (let i = 0; i < total; i++) {
      if (isBg[i] && !exterior[i] && !visited[i]) {
        let ch = 0;
        let ct = 0;
        visited[i] = 1;
        queue[ct++] = i;
        let sumX = 0;
        let sumY = 0;
        while (ch < ct) {
          const cur = queue[ch++];
          const cx = cur % size;
          const cy = (cur - cx) / size;
          sumX += cx;
          sumY += cy;
          const nbrs = [
            cx > 0 ? cur - 1 : -1,
            cx + 1 < size ? cur + 1 : -1,
            cy > 0 ? cur - size : -1,
            cy + 1 < size ? cur + size : -1,
          ];
          for (const n of nbrs) {
            if (n >= 0 && isBg[n] && !exterior[n] && !visited[n]) {
              visited[n] = 1;
              queue[ct++] = n;
            }
          }
        }
        holePixels += ct;
        components.push({
          size: ct,
          cx: Math.round(sumX / ct),
          cy: Math.round(size - 1 - sumY / ct),
        });
      }
    }
    components.sort((a, b) => b.size - a.size);
    return {
      size,
      bodyPixels,
      holePixels,
      componentCount: components.length,
      largestComponentPx: components[0]?.size ?? 0,
      topComponents: components.slice(0, 5),
    };
  }
  const resize = new ResizeObserver(() => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resize.observe(container);
  resetCamera();
  return {
    scene,
    camera,
    renderer,
    controls,
    resetCamera,
    front,
    side,
    back,
    top,
    zoom,
    focus,
    measureSilhouetteHoleView,
  };
}
