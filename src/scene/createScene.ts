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
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
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
  };
}
