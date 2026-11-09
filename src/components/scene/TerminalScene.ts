import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TruckTrace, TwinResult } from '@/lib/twin/sim';
import { tanksAt } from '@/lib/twin/derive';

import { POIS, EYE, type PoiId } from '@/lib/twin/pois';

/**
 * Изометрическая 3D-сцена отгрузки бензина на Three.js.
 * Анимация — только отображение трассы симуляции: позиции машин вычисляются из времени модели.
 * Архитектура сцены: статичная «диорама» (дороги, здания, эстакада, резервуары) + динамический слой
 * (автоцистерны, шлагбаумы, индикаторы постов, поток в трубопроводе) + HTML-метки точек интереса.
 */

export interface PinScreen { x: number; y: number; visible: boolean }
export interface SceneOptions {
  quality?: 'high' | 'low';
  interactive?: boolean;
  autoRotate?: boolean;
  onPins?: (pins: Record<PoiId, PinScreen>) => void;
  getTime?: () => { t: number; speed: number };
}

const C = {
  slab: 0xeef2f6, slabSide: 0xcfd7e2, asphalt: 0xbac4d1, line: 0xffffff, yellow: 0xf4c430,
  concrete: 0xe4e8ee, white: 0xfbfcfd, glass: 0x8fb8ea, blue: 0x1d5bff, navy: 0x13254a, steel: 0xb8c3d1,
  dark: 0x334155, tank: 0xf7f9fb, green: 0x22c55e, orange: 0xff7a1a, grass: 0xd2e6d2, tree: 0x7bbf8a, tree2: 0x5aa874, trunk: 0x9b7653
};
const PRODUCTS = [
  { name: 'A-1', color: 0x2f6bff },
  { name: 'A-2', color: 0x2f6bff },
  { name: 'B-1', color: 0x0fae9f },
  { name: 'B-2', color: 0x0fae9f }
];

const SOUTH_Z = 22;
const NORTH_Z = -18;
const GATE_X = -62;
const SCALE_IN_X = -40;
const SCALE_OUT_X = -26;
const DOCS_X = -45;
const BAY_X = 8;
const MAX_LANES = 6;

const laneZ = (i: number, n: number) => 4 + (i - (Math.min(n, MAX_LANES) - 1) / 2) * 5.6;

type Phase = 'hidden' | 'approach' | 'gate' | 'wait' | 'bay' | 'leave' | 'gone';

interface TruckVis {
  g: THREE.Group;
  grade: 0 | 1;
  phase: Phase;
  waypoints: THREE.Vector3[];
  heading: number;
  lane: number;
  slot: number;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = `${color}-${JSON.stringify(opts)}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02, ...opts });
    mats.set(key, m);
  }
  return m;
}

export class TerminalScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: OrbitControls;
  private root = new THREE.Group();
  private dynamic = new THREE.Group();
  private lanesGroup = new THREE.Group();
  private raf = 0;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private trace: TwinResult | null = null;
  private trucks = new Map<number, TruckVis>();
  private pool: [THREE.Group[], THREE.Group[]] = [[], []];
  private truckGeo: Record<string, THREE.BufferGeometry> = {};
  private simTime = 0;
  private lastSimTime = 0;
  private simSpeed = 60;
  private lanes = 2;
  private dispensers: { light: THREE.Mesh; glow: THREE.Mesh }[] = [];
  private barriers: THREE.Object3D[] = [];
  private levelBars: THREE.Mesh[] = [];
  private tankLights: THREE.MeshStandardMaterial[] = [];
  private tankGroup = new THREE.Group();
  private tankCounts: [number, number] = [3, 3];
  private flowTex: THREE.CanvasTexture | null = null;
  private arrows: THREE.MeshBasicMaterial[] = [];
  private highlight = new THREE.Group();
  private highlightMat = new THREE.MeshBasicMaterial({ color: C.orange, transparent: true, opacity: 0.9, depthWrite: false });
  private highlightFill = new THREE.MeshBasicMaterial({ color: C.orange, transparent: true, opacity: 0.1, depthWrite: false });
  private fly: { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; t: number } | null = null;
  private baseHalf = 62;
  private pinVec = new THREE.Vector3();
  // вид от первого лица
  private persp: THREE.PerspectiveCamera;
  private active: THREE.Camera;
  private eyeId: PoiId | null = null;
  private eyeFly: { p0: THREE.Vector3; p1: THREE.Vector3; l0: THREE.Vector3; l1: THREE.Vector3; t: number; dur: number; arc: number; then?: () => void } | null = null;
  private yaw = 0;
  private pitch = 0;
  private drag: { x: number; y: number; id: number } | null = null;
  private isoDir = new THREE.Vector3(95, 150, 175).normalize();
  private farGround: THREE.Mesh;
  // освещение и ночь
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private night = false;
  private beacons: THREE.MeshStandardMaterial[] = [];
  private skyDay = skyTexture('#7fb0ee', '#eaf2fc');
  private skyNight = skyTexture('#030816', '#1a2a4d');
  private bgNight = radialTexture('#16233f', '#070d1c');
  private lampMat = new THREE.MeshStandardMaterial({ color: 0x334155, emissive: 0xfff1c9, emissiveIntensity: 0 });
  private headMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xfff6dd, emissiveIntensity: 0 });
  private tailMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, emissive: 0xff2a2a, emissiveIntensity: 0 });
  private disposed = false;

  constructor(private el: HTMLElement, private opts: SceneOptions = {}) {
    const low = opts.quality === 'low';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    el.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
    this.camera.position.set(95, 150, 175);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(-4, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.12;
    this.controls.minZoom = 0.7;
    this.controls.maxZoom = 4.5;
    this.controls.screenSpacePanning = true;
    this.controls.enabled = opts.interactive !== false;
    this.controls.autoRotate = !!opts.autoRotate;
    this.controls.autoRotateSpeed = 0.35;
    this.camera.zoom = 1.3;
    this.camera.updateProjectionMatrix();
    this.controls.update();

    this.persp = new THREE.PerspectiveCamera(55, 1, 0.1, 1500);
    this.active = this.camera;
    this.headMat.userData.nightEmissive = 2.4;
    this.tailMat.userData.nightEmissive = 1.6;
    this.lampMat.userData.nightEmissive = 2.2;
    const fg = new THREE.Mesh(new THREE.CircleGeometry(1200, 48), new THREE.MeshStandardMaterial({ color: 0xbfd6bd, roughness: 1 }));
    fg.rotation.x = -Math.PI / 2;
    fg.position.y = -0.04;
    fg.receiveShadow = true;
    fg.visible = false;
    this.farGround = fg;
    this.scene.add(fg);
    const cv = this.renderer.domElement;
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointercancel', this.onUp);
    cv.addEventListener('wheel', this.onWheel, { passive: false });

    this.lights(low);
    this.scene.add(this.root, this.dynamic, this.highlight);
    this.build();
    this.buildLanes(2);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.loop();
  }

  /* ---------- публичный API ---------- */

  setTrace(result: TwinResult) {
    this.trace = result;
    if (Math.min(result.params.posts, MAX_LANES) !== this.lanes) this.buildLanes(result.params.posts);
    if (result.params.tanks92 !== this.tankCounts[0] || result.params.tanks95 !== this.tankCounts[1]) this.buildTankFarm(result.params.tanks92, result.params.tanks95);
    for (const v of this.trucks.values()) { this.dynamic.remove(v.g); this.pool[v.grade].push(v.g); }
    this.trucks.clear();
    this.lastSimTime = -999;
  }

  setTime(t: number, speed = this.simSpeed) {
    this.simTime = t;
    this.simSpeed = speed;
  }

  focus(id: PoiId | null) {
    if (this.eyeId && id) { this.flyEye(id); this.drawHighlight(id); return; }
    this.drawHighlight(id);
    const poi = id ? POIS.find((p) => p.id === id) : null;
    if (!poi) {
      this.flyTo(new THREE.Vector3(-4, 0, 0), 1.3);
      return;
    }
    const [x0, z0, x1, z1] = poi.zone;
    const w = x1 - x0, d = z1 - z0;
    const span = Math.max(w, d * 1.4);
    const zoom = THREE.MathUtils.clamp(70 / span, 1.5, 3);
    // смещаем фокус, чтобы зона не пряталась под карточкой точки (слева на десктопе, снизу на телефоне)
    const center = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).setY(0).normalize();
    const aspect = (this.el.clientWidth || 1) / (this.el.clientHeight || 1);
    const halfW = (this.baseHalf * aspect) / zoom, halfH = this.baseHalf / zoom;
    if (aspect > 1.15) center.addScaledVector(right, -halfW * 0.3);
    else center.addScaledVector(up, -halfH * 0.35);
    this.flyTo(center, zoom);
  }

  private drawHighlight(id: PoiId | null) {
    while (this.highlight.children.length) {
      const c = this.highlight.children.pop()! as THREE.Mesh;
      c.geometry.dispose();
    }
    const poi = id ? POIS.find((p) => p.id === id) : null;
    if (!poi) return;
    const [x0, z0, x1, z1] = poi.zone;
    const w = x1 - x0, d = z1 - z0, r = 2.2;
    const outer = roundedRect(w, d, r);
    const inner = roundedRect(w - 1.1, d - 1.1, Math.max(0.5, r - 0.55));
    outer.holes.push(inner as unknown as THREE.Path);
    const ring = new THREE.Mesh(new THREE.ShapeGeometry(outer, 6), this.highlightMat);
    const fill = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(w, d, r), 6), this.highlightFill);
    for (const m of [ring, fill]) {
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, m === ring ? 0.16 : 0.12, (z0 + z1) / 2);
      m.renderOrder = 5;
      this.highlight.add(m);
    }
  }

  resetView() { this.focus(null); }

  /** Войти в вид от первого лица в точке id (или перелететь к ней, если уже внутри). null — вернуться к карте. */
  setEye(id: PoiId | null) {
    if (id === this.eyeId && !this.eyeFly) return;
    if (!id) { this.exitEye(); return; }
    if (this.eyeId) { this.flyEye(id); this.drawHighlight(id); return; }
    // переключаемся на перспективную камеру так, чтобы кадр почти совпал с изометрией, и «ныряем» вниз
    const target = this.controls.target.clone();
    this.isoDir.copy(this.camera.position).sub(target).normalize();
    const D = (this.baseHalf / this.camera.zoom) / Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2));
    this.persp.position.copy(target).addScaledVector(this.isoDir, D);
    this.persp.lookAt(target);
    this.active = this.persp;
    this.controls.enabled = false;
    this.eyeId = id;
    this.envForEye(true);
    this.drawHighlight(null);
    const e = EYE[id];
    this.eyeFly = { p0: this.persp.position.clone(), p1: new THREE.Vector3(e.pos[0], 1.7, e.pos[1]), l0: target, l1: new THREE.Vector3(...e.look), t: 0, dur: 2.4, arc: 0 };
  }

  get inEye() { return this.eyeId !== null; }

  setNight(v: boolean) {
    this.night = v;
    this.hemi.color.setHex(v ? 0x3b5590 : 0xf4f8ff);
    this.hemi.groundColor.setHex(v ? 0x0b1020 : 0xc9d3de);
    this.hemi.intensity = v ? 0.32 : 1.25;
    this.sun.color.setHex(v ? 0x9db7ff : 0xffffff);
    this.sun.intensity = v ? 0.35 : 2.1;
    this.fillLight.intensity = v ? 0.08 : 0.55;
    this.renderer.toneMappingExposure = v ? 1.25 : 0.98;
    (this.farGround.material as THREE.MeshStandardMaterial).color.setHex(v ? 0x5d6f62 : 0xbfd6bd);
    this.envForEye(this.eyeId !== null);
    this.applyNight();
    if (!v) this.beacons.forEach((b) => { b.emissiveIntensity = 0; });
  }

  private envForEye(on: boolean) {
    this.farGround.visible = on;
    if (on) {
      this.scene.background = this.night ? this.skyNight : this.skyDay;
      this.scene.fog = new THREE.Fog(this.night ? 0x1a2a4d : 0xeaf2fc, 70, 380);
    } else {
      this.scene.background = this.night ? this.bgNight : null;
      this.scene.fog = null;
    }
  }

  private applyNight() {
    const v = this.night;
    const seen = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      const l = o as THREE.PointLight;
      if ((l as THREE.Light).isLight && typeof o.userData.nightIntensity === 'number') l.intensity = v ? o.userData.nightIntensity : 0;
      const m = (o as THREE.Mesh).material;
      if (m) for (const mm of Array.isArray(m) ? m : [m]) seen.add(mm);
    });
    for (const m of [...seen, this.headMat, this.tailMat, this.lampMat]) {
      const sm = m as THREE.MeshStandardMaterial;
      if (typeof sm.userData?.nightEmissive === 'number') sm.emissiveIntensity = v ? sm.userData.nightEmissive : 0;
    }
    for (const [key, m] of mats) {
      if (key.startsWith(`${C.glass}-`)) { m.emissive.setHex(0xffc56e); m.emissiveIntensity = v ? 0.85 : 0; }
    }
  }

  private flyEye(id: PoiId) {
    const e = EYE[id];
    const p1 = new THREE.Vector3(e.pos[0], 1.7, e.pos[1]);
    const l0 = this.persp.position.clone().add(this.lookDir().multiplyScalar(10));
    const dist = this.persp.position.distanceTo(p1);
    this.eyeId = id;
    this.eyeFly = { p0: this.persp.position.clone(), p1, l0, l1: new THREE.Vector3(...e.look), t: 0, dur: THREE.MathUtils.clamp(dist / 28, 1.3, 3), arc: THREE.MathUtils.clamp(dist * 0.28, 3, 28) };
  }

  private exitEye() {
    if (!this.eyeId) return;
    const poi = POIS.find((p) => p.id === this.eyeId)!;
    const [x0, z0, x1, z1] = poi.zone;
    const center = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const zoom = 1.6;
    const D = (this.baseHalf / zoom) / Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2));
    const p1 = center.clone().addScaledVector(this.isoDir, D);
    const l0 = this.persp.position.clone().add(this.lookDir().multiplyScalar(10));
    this.eyeFly = {
      p0: this.persp.position.clone(), p1, l0, l1: center, t: 0, dur: 1.8, arc: 0,
      then: () => {
        // точно совмещаем изометрию с последним кадром перспективы и возвращаем карту
        this.controls.target.copy(center);
        this.camera.position.copy(center).addScaledVector(this.isoDir, 200);
        this.camera.zoom = zoom;
        this.camera.updateProjectionMatrix();
        this.active = this.camera;
        this.controls.enabled = this.opts.interactive !== false;
        this.controls.update();
        this.eyeId = null;
        this.envForEye(false);
        this.drawHighlight(poi.id);
      }
    };
  }

  private lookDir() {
    return new THREE.Vector3(Math.cos(this.pitch) * Math.sin(this.yaw), Math.sin(this.pitch), Math.cos(this.pitch) * Math.cos(this.yaw));
  }

  private onDown = (e: PointerEvent) => {
    if (!this.eyeId || this.eyeFly) return;
    this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX; this.drag.y = e.clientY;
    this.yaw += dx * 0.0045;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0035, -1.1, 0.9);
  };
  private onUp = (e: PointerEvent) => { if (this.drag?.id === e.pointerId) this.drag = null; };
  private onWheel = (e: WheelEvent) => {
    if (!this.eyeId) return;
    e.preventDefault();
    this.persp.fov = THREE.MathUtils.clamp(this.persp.fov + e.deltaY * 0.03, 30, 75);
    this.persp.updateProjectionMatrix();
  };


  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    const cv = this.renderer.domElement;
    cv.removeEventListener('pointerdown', this.onDown);
    cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('pointercancel', this.onUp);
    cv.removeEventListener('wheel', this.onWheel);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.flowTex?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ---------- окружение ---------- */

  private lights(low: boolean) {
    this.hemi = new THREE.HemisphereLight(0xf4f8ff, 0xc9d3de, 1.25);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    this.sun = sun;
    sun.position.set(-70, 130, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
    const s = sun.shadow.camera;
    s.left = -120; s.right = 120; s.top = 110; s.bottom = -110; s.near = 10; s.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const fillL = new THREE.DirectionalLight(0xdfe9ff, 0.55);
    fillL.position.set(120, 60, -40);
    this.fillLight = fillL;
    this.scene.add(fillL);
  }

  private box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.root, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private cyl(rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 32, parent: THREE.Object3D = this.root) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private flat(w: number, d: number, m: THREE.Material, x: number, y: number, z: number, rot = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rot;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  private build() {
    // Основание-диорама
    const slab = new THREE.Mesh(new THREE.BoxGeometry(170, 3, 124), [
      mat(C.slabSide), mat(C.slabSide), mat(C.slab), mat(C.slabSide), mat(C.slabSide), mat(C.slabSide)
    ]);
    slab.position.set(-8, -1.5, -2);
    slab.receiveShadow = true;
    this.root.add(slab);
    // газоны
    this.flat(170, 10, mat(C.grass), -8, 0.01, 55);
    this.flat(14, 124, mat(C.grass), 70, 0.01, -2);

    const asphalt = mat(C.asphalt, { roughness: 0.95 });
    // дороги
    this.flat(80, 9, asphalt, -53, 0.03, SOUTH_Z);
    this.flat(80, 9, asphalt, -53, 0.03, NORTH_Z);
    // общий перрон эстакады
    this.flat(54, 48, asphalt, 11, 0.03, 2);
    // площадка ожидания
    this.flat(36, 25, asphalt, -14, 0.03, 39.5);

    const white = new THREE.MeshBasicMaterial({ color: C.line });
    const yellow = new THREE.MeshBasicMaterial({ color: C.yellow });
    // разметка дорог
    for (let x = -90; x < -14; x += 6) {
      this.flat(3, 0.3, white, x, 0.06, SOUTH_Z);
      this.flat(3, 0.3, white, x, 0.06, NORTH_Z);
    }
    for (const z of [SOUTH_Z - 4.3, SOUTH_Z + 4.3, NORTH_Z - 4.3, NORTH_Z + 4.3]) this.flat(78, 0.25, yellow, -53, 0.06, z);
    // места стоянки
    for (let k = 0; k <= 6; k++) {
      this.flat(0.25, 10, white, -30.75 + k * 5.5, 0.06, 33);
      this.flat(0.25, 10, white, -28 + k * 5.5, 0.06, 45.5);
    }
    // стрелки направления движения
    const chevron = new THREE.Shape();
    chevron.moveTo(-1.2, 1.3); chevron.lineTo(0.6, 0); chevron.lineTo(-1.2, -1.3); chevron.lineTo(-0.4, -1.3); chevron.lineTo(1.4, 0); chevron.lineTo(-0.4, 1.3); chevron.closePath();
    const chevGeo = new THREE.ShapeGeometry(chevron);
    const addArrow = (x: number, z: number, angle: number, i: number) => {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
      m.userData.phase = i;
      this.arrows.push(m);
      const a = new THREE.Mesh(chevGeo, m);
      a.rotation.x = -Math.PI / 2;
      a.rotation.z = angle;
      a.position.set(x, 0.07, z);
      this.root.add(a);
    };
    [-84, -74, -50, -30, -18].forEach((x, i) => addArrow(x, SOUTH_Z + 2, 0, i));
    [30, 10, -12, -34, -54, -70].forEach((x, i) => addArrow(x, NORTH_Z - 2, Math.PI, i));
    [-4, 6].forEach((z, i) => addArrow(34, z, Math.PI / 2, i + 1));

    this.buildFence();
    this.buildGate();
    this.buildScales();
    this.buildOperatorBuilding();
    this.buildTanks();
    this.buildPumpHouse();
    this.buildBottling();
    this.buildTrees();
  }

  private buildFence() {
    const m = mat(0xc4ced9, { metalness: 0.4, roughness: 0.5 });
    const seg = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const rail = this.box(len, 0.18, 0.18, m, (x0 + x1) / 2, 1.8, (z0 + z1) / 2, this.root, false);
      rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      const n = Math.floor(len / 4);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        this.box(0.2, 2, 0.2, m, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, this.root, false);
      }
    };
    seg(-90, -62, 60, -62);
    seg(60, -62, 60, 52);
    seg(60, 52, -90, 52);
    seg(-90, 52, -90, 28);
    seg(-90, 16, -90, -12);
    seg(-90, -24, -90, -62);
  }

  private buildGate() {
    // будка КПП между въездом и выездом
    const x = -72, z = 2;
    this.box(7, 0.4, 8, mat(C.concrete), x, 0, z);
    this.box(5, 3.4, 5.5, mat(C.white), x, 0.4, z);
    this.box(5.1, 1.3, 5.6, mat(C.glass, { roughness: 0.2, metalness: 0.3 }), x, 2, z);
    this.box(6.2, 0.45, 6.8, mat(C.blue), x, 3.8, z);
    const arm = (zz: number, dir: number) => {
      this.box(0.8, 1.2, 0.8, mat(C.dark), -56, 0, zz + dir * 4.6);
      const pivot = new THREE.Group();
      pivot.position.set(-56, 1.1, zz + dir * 4.6);
      const stripes = new THREE.Group();
      for (let i = 0; i < 8; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 1.05), mat(i % 2 ? 0xffffff : 0xef4444));
        s.position.set(0, 0, -dir * (0.6 + i * 1.05));
        s.castShadow = true;
        stripes.add(s);
      }
      pivot.add(stripes);
      pivot.userData.dir = dir;
      this.root.add(pivot);
      this.barriers.push(pivot);
    };
    arm(SOUTH_Z, 1);
    arm(NORTH_Z, -1);
  }

  private buildScales() {
    const plat = (x: number, z: number) => {
      this.box(16, 0.35, 4.2, mat(0x56657a, { roughness: 0.6, metalness: 0.4 }), x, 0, z);
      this.box(16.2, 0.4, 0.3, mat(C.yellow), x, 0, z - 2.2);
      this.box(16.2, 0.4, 0.3, mat(C.yellow), x, 0, z + 2.2);
    };
    plat(SCALE_IN_X, SOUTH_Z);
    plat(SCALE_OUT_X, NORTH_Z);
    // весовая будка
    this.box(4, 2.8, 3.2, mat(C.white), SCALE_IN_X, 0, SOUTH_Z - 7.5);
    this.box(4.1, 1, 3.3, mat(C.glass, { roughness: 0.2, metalness: 0.3 }), SCALE_IN_X, 1.5, SOUTH_Z - 7.5);
    this.box(4.6, 0.3, 3.8, mat(C.navy), SCALE_IN_X, 2.8, SOUTH_Z - 7.5);
    // светофоры
    for (const [x, z] of [[SCALE_IN_X + 9, SOUTH_Z - 4.8], [SCALE_OUT_X - 9, NORTH_Z + 4.8]] as const) {
      this.box(0.25, 3.2, 0.25, mat(C.dark), x, 0, z);
      this.box(0.6, 1.2, 0.5, mat(C.dark), x, 3.2, z);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: C.green }));
      l.position.set(x, 3.55, z + 0.28);
      this.root.add(l);
    }
  }

  private buildOperatorBuilding() {
    const x0 = -58, x1 = -32, z0 = -10, z1 = 8;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    this.box(w + 2, 0.3, d + 2, mat(C.concrete), cx, 0, cz);
    this.box(w, 8, d, mat(C.white), cx, 0.3, cz);
    const glass = mat(C.glass, { roughness: 0.15, metalness: 0.35 });
    for (const y of [1.6, 5.2]) {
      this.box(w - 3, 1.6, 0.25, glass, cx, y, z1 + 0.05);
      this.box(0.25, 1.6, d - 3, glass, x1 + 0.05, y, cz);
      this.box(w - 3, 1.6, 0.25, glass, cx, y, z0 - 0.05);
    }
    // лаборатория — восточная часть с бирюзовым акцентом
    this.box(8.4, 0.5, d + 0.4, mat(0x14b8a6), x1 - 4, 8.3, cz);
    this.box(w - 8, 0.5, d + 0.4, mat(C.blue), cx - 4, 8.3, cz);
    this.box(w, 0.3, d, mat(0xe8edf3), cx, 8.6, cz);
    for (let i = 0; i < 3; i++) this.cyl(0.5, 0.5, 1.4, mat(C.steel, { metalness: 0.5 }), x1 - 6 + i * 2, 8.9, cz - 4, 16);
    this.box(4, 1.4, 3, mat(0xcfd8e3), cx - 6, 8.9, cz + 2);
    this.box(3, 1.2, 2.4, mat(0xcfd8e3), cx - 1, 8.9, cz + 3);
    // вход и окно выдачи ТТН
    this.box(4, 0.25, 2.6, mat(C.navy), cx - 3, 3.3, z1 + 1.3);
    this.box(2, 2.8, 0.2, mat(0x0f2f6b), cx - 3, 0.3, z1 + 0.1);
    this.box(3, 0.25, 2, mat(C.navy), DOCS_X, 3, z0 - 1);
    // флагшток-антенна
    this.cyl(0.08, 0.08, 4, mat(C.dark), x0 + 2, 8.6, z0 + 2, 6);
  }

  private label(text: string, color: number) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    roundRectPath(ctx, 6, 10, 244, 76, 22);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 46px Onest, Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.72), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  }

  private buildTanks() {
    // обвалование резервуарного парка (статично), сами резервуары — по числу из модели
    const wall = mat(0xd5dbe3);
    this.box(50, 1.2, 0.6, wall, 18, 0, -50.5);
    this.box(50, 1.2, 0.6, wall, 18, 0, -25.5);
    this.box(0.6, 1.2, 25, wall, -6.7, 0, -38);
    this.box(0.6, 1.2, 25, wall, 42.7, 0, -38);
    this.flat(49, 24.4, mat(0xe9edf1), 18, 0.04, -38);
    this.buildTankFarm(3, 3);
  }

  /** Резервуары двумя рядами: АИ-92 ближе к эстакаде, АИ-95 дальше */
  private buildTankFarm(n92: number, n95: number) {
    this.root.remove(this.tankGroup);
    this.tankGroup.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.tankGroup = new THREE.Group();
    this.levelBars = [];
    this.tankLights = [];
    this.beacons = [];
    this.tankCounts = [n92, n95];
    const g = this.tankGroup;
    const shell = mat(C.tank, { roughness: 0.45, metalness: 0.15 });
    const colors = [0x2f6bff, 0x12b981];
    ([[n92, -32.5, 0], [n95, -44, 1]] as const).forEach(([n, z, grade]) => {
      const step = Math.min(12, 46 / Math.max(1, n));
      const r = Math.min(5, step * 0.42), h = r * 2.1;
      for (let k = 0; k < n; k++) {
        const x = -1 + step / 2 + k * step;
        this.cyl(r + 0.35, r + 0.35, 0.4, mat(C.concrete), x, 0, z, 36, g);
        this.cyl(r, r, h, shell, x, 0.4, z, 40, g);
        this.cyl(r + 0.05, r + 0.05, 0.6, mat(colors[grade], { roughness: 0.5 }), x, h - 1.2, z, 40, g);
        this.cyl(0.6, r + 0.12, 1, mat(0xeef2f6, { roughness: 0.5 }), x, h + 0.4, z, 40, g);
        // шкала уровня
        this.box(0.6, h - 2.4, 0.2, mat(0xd8dee6), x - r * 0.45, 1.1, z + r - 0.03, g, false);
        const lvl = this.box(0.42, h - 2.6, 0.26, mat(colors[grade], { emissive: colors[grade], emissiveIntensity: 0.25 }), x - r * 0.45, 1.2, z + r, g, false);
        lvl.geometry.translate(0, -(h - 2.6) / 2, 0);
        lvl.position.y = 1.2;
        this.levelBars.push(lvl);
        // огонь состояния на крыше: наполнение / анализ / налив / свободен
        const lm = new THREE.MeshStandardMaterial({ color: 0x94a3b8, emissive: 0x94a3b8, emissiveIntensity: 0.6 });
        this.tankLights.push(lm);
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), lm);
        light.position.set(x, h + 1.15, z);
        g.add(light);
        const bm = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, emissive: 0xff2020, emissiveIntensity: 0 });
        this.beacons.push(bm);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), bm);
        beacon.position.set(x + r * 0.6, h + 0.6, z);
        g.add(beacon);
        const lab = this.label(`${grade === 0 ? '92' : '95'}-${k + 1}`, colors[grade]);
        lab.scale.setScalar(Math.min(1, r / 4.2));
        lab.position.set(x + r * 0.25, h * 0.5, z + r + 0.08);
        g.add(lab);
      }
    });
    // коллекторы к насосной
    tube([new THREE.Vector3(-2, 1, -28), new THREE.Vector3(44, 1, -28)], 0.24, mat(colors[0], { roughness: 0.5 }), g);
    tube([new THREE.Vector3(-2, 1.6, -38.5), new THREE.Vector3(40, 1.6, -38.5), new THREE.Vector3(44, 1.6, -28.6)], 0.24, mat(colors[1], { roughness: 0.5 }), g);
    this.root.add(g);
    if (this.hemi) this.applyNight();
  }

  private buildPumpHouse() {
    const x = 50, z = -30;
    this.box(12, 0.3, 11, mat(C.concrete), x, 0, z);
    this.box(9, 4.6, 7, mat(C.white), x + 1, 0.3, z - 1.5);
    this.box(9.4, 0.4, 7.4, mat(C.blue), x + 1, 4.9, z - 1.5);
    this.box(2.2, 3, 0.2, mat(0x0f2f6b), x + 1, 0.3, z + 2.05);
    for (let i = 0; i < 3; i++) {
      const px = x - 3 + i * 3, pz = z + 4;
      this.box(1.6, 0.4, 1.2, mat(C.dark), px, 0.3, pz);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 20), mat(C.blue, { metalness: 0.3, roughness: 0.4 }));
      motor.rotation.z = Math.PI / 2;
      motor.position.set(px, 1.2, pz);
      motor.castShadow = true;
      this.root.add(motor);
    }
    // эстакада трубопроводов: посты слива ↔ насосная (надземно)
    const path = [
      new THREE.Vector3(44, 1.6, -27), new THREE.Vector3(44, 7.6, -27), new THREE.Vector3(44, 7.6, -14),
      new THREE.Vector3(30, 7.6, -14), new THREE.Vector3(24, 7.6, -14)
    ];
    PRODUCTS.forEach((p, i) => {
      const off = (i - 1.5) * 0.7;
      tube(path.map((v, k) => new THREE.Vector3(v.x + (k < 3 ? off : 0), v.y, v.z + (k >= 2 ? off : 0))), 0.24, mat(p.color, { roughness: 0.45, metalness: 0.2 }), this.root);
    });
    // опоры
    for (const [sx, sz] of [[44, -24], [44, -19], [44, -15], [38, -14], [31, -14]] as const) {
      this.box(0.35, 7.2, 0.35, mat(C.steel), sx - 1.6, 0, sz);
      this.box(0.35, 7.2, 0.35, mat(C.steel), sx + 1.6, 0, sz);
      this.box(3.6, 0.3, 0.4, mat(C.steel), sx, 7, sz);
    }
    // анимированный поток в трубопроводе
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 8;
    const ctx = cv.getContext('2d')!;
    const grd = ctx.createLinearGradient(0, 0, 128, 0);
    grd.addColorStop(0, 'rgba(255,122,26,0)');
    grd.addColorStop(0.7, 'rgba(255,170,60,0.95)');
    grd.addColorStop(1, 'rgba(255,122,26,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 8);
    this.flowTex = new THREE.CanvasTexture(cv);
    this.flowTex.wrapS = THREE.RepeatWrapping;
    this.flowTex.repeat.set(8, 1);
    const flowMat = new THREE.MeshBasicMaterial({ map: this.flowTex, transparent: true, depthWrite: false, opacity: 0 });
    const curve = new THREE.CurvePath<THREE.Vector3>();
    const fp = [new THREE.Vector3(44, 1.6, -27), new THREE.Vector3(44, 8.3, -27), new THREE.Vector3(44, 8.3, -14), new THREE.Vector3(20, 8.3, -14)];
    for (let i = 0; i < fp.length - 1; i++) curve.add(new THREE.LineCurve3(fp[i], fp[i + 1]));
    const flow = new THREE.Mesh(new THREE.TubeGeometry(curve as unknown as THREE.Curve<THREE.Vector3>, 120, 0.32, 8, false), flowMat);
    flow.userData.flow = true;
    this.root.add(flow);
    this.flowMesh = flow;
  }
  private flowMesh: THREE.Mesh | null = null;
  private fillerLight: THREE.MeshStandardMaterial | null = null;
  private bottleFlowMat: THREE.MeshBasicMaterial | null = null;
  private feedTex: THREE.CanvasTexture | null = null;
  private blenderGroups: THREE.Group[] = [];
  private agitators: THREE.Object3D[] = [];

  /** Установка приготовления бензина (без крыши — видно оборудование внутри) */
  private buildBottling() {
    const x0 = 10, x1 = 56, z0 = 30, z1 = 50, h = 4.2, t = 0.5;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const wallM = mat(0xe9eef4, { roughness: 0.7 });
    const band = mat(C.blue);
    this.box(x1 - x0 + 1.4, 0.25, z1 - z0 + 1.4, mat(C.concrete), cx, 0, cz);
    this.flat(x1 - x0, z1 - z0, mat(0xdfe7f0, { roughness: 0.55 }), cx, 0.27, cz);
    // стены с проёмами: северные ворота под трубу и проход, южные ворота отгрузки
    const wall = (wx0: number, wz0: number, wx1: number, wz1: number) => {
      const len = Math.hypot(wx1 - wx0, wz1 - wz0);
      const horiz = Math.abs(wz1 - wz0) < 0.01;
      this.box(horiz ? len : t, h, horiz ? t : len, wallM, (wx0 + wx1) / 2, 0.25, (wz0 + wz1) / 2);
      this.box(horiz ? len : t + 0.06, 0.35, horiz ? t + 0.06 : len, band, (wx0 + wx1) / 2, h + 0.25 - 0.35, (wz0 + wz1) / 2, this.root, false);
    };
    wall(x0, z0, 20, z0); wall(25, z0, x1, z0);
    wall(x0, z1, 44, z1); wall(51, z1, x1, z1);
    wall(x0, z0, x0, 37); wall(x0, 42, x0, z1);
    wall(x1, z0, x1, z1);
    wall(40, z0, 40, 36); wall(40, 44, 40, z1);
    // разметка проходов
    const yellow = new THREE.MeshBasicMaterial({ color: C.yellow });
    this.flat(28, 0.2, yellow, 25, 0.29, 36.6);
    this.flat(28, 0.2, yellow, 25, 0.29, 43.8);
    this.flat(0.2, 7, yellow, 40.9, 0.29, 40);

    // смесительные ёмкости (вторая показывается, если в сценарии два смесителя)
    for (const [bz, k] of [[34, 0], [46, 1]] as const) {
      const g = new THREE.Group();
      this.cyl(2.1, 2.1, 3.6, mat(0xf3f6f9, { roughness: 0.35, metalness: 0.3 }), 14.5, 1.2, bz, 36, g);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 0.5, 1.2, 36), mat(0xe2e8f0, { metalness: 0.3 }));
      cone.position.set(14.5, 0.9, bz);
      g.add(cone);
      this.cyl(2.15, 2.15, 0.45, mat(C.orange), 14.5, 3.9, bz, 36, g);
      for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) this.box(0.22, 1.3, 0.22, mat(C.steel), 14.5 + lx, 0.27, bz + lz, g);
      this.box(1.2, 0.9, 1.2, mat(C.blue), 14.5, 4.8, bz, g);
      const ag = new THREE.Group();
      ag.position.set(14.5, 5.9, bz);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.3), mat(C.yellow));
      const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2;
      ag.add(blade, blade2);
      g.add(ag);
      this.agitators.push(ag);
      g.userData.k = k;
      this.root.add(g);
      this.blenderGroups.push(g);
    }
    this.box(9, 0.25, 0.5, mat(C.steel, { metalness: 0.5 }), 14.5, 4.6, 40, this.root, false);
    // узел смешения компонентов: колонны, обвязка и пульт
    const colM = mat(0xf3f6f9, { roughness: 0.35, metalness: 0.3 });
    for (const [cx2, cz2, ch] of [[24, 35, 7], [24, 45, 6], [31, 35, 5.5], [31, 45, 6.5]] as const) {
      this.cyl(1.3, 1.3, ch, colM, cx2, 0.27, cz2, 28);
      this.cyl(1.35, 1.35, 0.35, mat(C.blue), cx2, ch * 0.7, cz2, 28);
      this.cyl(0.6, 1.3, 0.8, mat(0xe2e8f0), cx2, ch + 0.27, cz2, 28);
    }
    tube([new THREE.Vector3(14.5, 3, 34), new THREE.Vector3(24, 3, 35), new THREE.Vector3(31, 3, 35), new THREE.Vector3(36, 3, 40)], 0.25, mat(C.orange, { roughness: 0.45 }), this.root);
    tube([new THREE.Vector3(14.5, 3, 46), new THREE.Vector3(24, 3, 45), new THREE.Vector3(31, 3, 45), new THREE.Vector3(36, 3, 40)], 0.25, mat(0x12b981, { roughness: 0.45 }), this.root);
    this.box(2.2, 2.4, 1, mat(C.white), 36.5, 0.27, 40);
    const light = new THREE.MeshStandardMaterial({ color: C.green, emissive: C.green, emissiveIntensity: 0.8 });
    this.fillerLight = light;
    this.box(0.5, 0.5, 0.5, light, 36.5, 2.8, 40, this.root, false);
    // рабочие
    const worker = (x: number, z: number, rot: number) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.9, 4, 10), mat(0x2563eb, { roughness: 0.6 }));
      body.position.y = 1.05;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), mat(0xf2c7a5));
      head.position.y = 1.95;
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(C.orange));
      helmet.position.y = 2.02;
      for (const m of [body, head, helmet]) { m.castShadow = true; g.add(m); }
      g.position.set(x, 0.27, z);
      g.rotation.y = rot;
      this.root.add(g);
    };
    worker(20, 37.8, 0);
    worker(33.5, 37.6, 0.6);
    worker(47, 41, -1.2);
    worker(-29, 4.5, 0.3);
    // освещение цеха и склада
    for (const [lx, lz, it] of [[18, 40, 70], [31, 40, 70], [48, 40, 60]] as const) {
      const pl = new THREE.PointLight(0xfff0d6, 0, 26, 1.5);
      pl.position.set(lx, 4.6, lz);
      pl.userData.nightIntensity = it;
      this.root.add(pl);
    }
    // трубопровод насосная → цех розлива (надземно, вдоль восточной ограды)
    const path = [new THREE.Vector3(55, 1.6, -30), new THREE.Vector3(58, 1.6, -30), new THREE.Vector3(58, 5.4, -30), new THREE.Vector3(58, 5.4, 34), new THREE.Vector3(57, 5.4, 34), new THREE.Vector3(14, 5.4, 34)];
    tube(path, 0.3, mat(C.orange, { roughness: 0.45 }), this.root);
    for (let z = -24; z <= 30; z += 9) {
      this.box(0.3, 5.2, 0.3, mat(C.steel), 58, 0, z, this.root, false);
    }
    this.feedTex = this.flowTex ? this.flowTex.clone() : null;
    if (this.feedTex) this.feedTex.needsUpdate = true;
    const flowM = new THREE.MeshBasicMaterial({ map: this.feedTex ?? undefined, transparent: true, depthWrite: false, opacity: 0 });
    this.bottleFlowMat = flowM;
    const curve = new THREE.CurvePath<THREE.Vector3>();
    const fp = [new THREE.Vector3(58, 6.1, -30), new THREE.Vector3(58, 6.1, 34), new THREE.Vector3(14, 6.1, 34)];
    for (let i = 0; i < fp.length - 1; i++) curve.add(new THREE.LineCurve3(fp[i], fp[i + 1]));
    this.root.add(new THREE.Mesh(new THREE.TubeGeometry(curve as unknown as THREE.Curve<THREE.Vector3>, 120, 0.36, 8, false), flowM));
  }

  /** Установка работает непрерывно; при затаривании — жёлтый сигнал и мешалки останавливаются */
  private updateBottling(dt: number) {
    const tr = this.trace;
    if (!tr) return;
    const now = this.simTime;
    const blocked = tr.blocks.some((b) => now >= b.from && now < b.to);
    if (this.fillerLight) {
      const col = blocked ? 0xf59e0b : C.green;
      this.fillerLight.color.setHex(col);
      this.fillerLight.emissive.setHex(col);
      this.fillerLight.emissiveIntensity = blocked ? 0.6 + 0.6 * Math.abs(Math.sin(performance.now() / 240)) : 0.8;
    }
    const running = !blocked;
    if (this.feedTex && running) this.feedTex.offset.x += dt * 1.2;
    if (this.bottleFlowMat) this.bottleFlowMat.opacity += ((running ? 0.9 : 0.15) - this.bottleFlowMat.opacity) * Math.min(1, dt * 4);
    this.agitators.forEach((a) => { if (running) a.rotation.y += dt * 2.4; });
  }

  private buildTrees() {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const spots: [number, number][] = [];
    for (let x = -86; x <= 64; x += 7) spots.push([x + rnd() * 3, 56 + rnd() * 2]);
    for (let z = -58; z <= 50; z += 7) spots.push([68 + rnd() * 3, z + rnd() * 3]);
    for (let x = -86; x <= 56; x += 9) if (x < -8 || x > 46) spots.push([x + rnd() * 3, -58 + rnd() * 2]);
    spots.push([-82, 4], [-84, 40], [-84, -40], [-60, 38], [-66, 46], [50, 14], [-46, -48], [-26, -54]);
    for (const [x, z] of spots) {
      const k = 0.8 + rnd() * 0.6;
      this.cyl(0.25 * k, 0.32 * k, 1.4 * k, mat(C.trunk), x, 0, z, 6);
      if (rnd() > 0.45) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9 * k, 0), mat(rnd() > 0.5 ? C.tree : C.tree2, { flatShading: true }));
        m.position.set(x, 1.4 * k + 1.5 * k, z);
        m.castShadow = true;
        this.root.add(m);
      } else {
        this.cyl(0, 1.7 * k, 4.2 * k, mat(rnd() > 0.5 ? C.tree2 : C.tree, { flatShading: true }), x, 1.2 * k, z, 7);
      }
    }
    // фонари
    for (const [x, z] of [[-30, 14], [-2, 28], [30, 24], [30, -20], [-60, 12], [-60, -8]] as const) {
      this.cyl(0.12, 0.16, 7, mat(C.steel, { metalness: 0.5 }), x, 0, z, 8);
      this.box(1.6, 0.25, 0.5, this.lampMat, x + 0.6, 7, z);
      const pl = new THREE.PointLight(0xffe2b0, 0, 34, 1.6);
      pl.position.set(x + 0.6, 6.6, z);
      pl.userData.nightIntensity = 90;
      this.root.add(pl);
    }
  }

  private buildLanes(bays: number) {
    const n = Math.min(Math.max(1, bays), MAX_LANES);
    this.lanes = n;
    this.root.remove(this.lanesGroup);
    this.lanesGroup.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.lanesGroup = new THREE.Group();
    this.dispensers = [];
    const g = this.lanesGroup;
    const zs = Array.from({ length: n }, (_, i) => laneZ(i, n));
    const zMin = zs[0] - 4, zMax = zs[n - 1] + 4;
    const yellow = new THREE.MeshBasicMaterial({ color: C.yellow });
    zs.forEach((z, i) => {
      // разметка полосы
      for (const dz of [-1.6, 1.6]) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(20, 0.22), yellow);
        l.rotation.x = -Math.PI / 2;
        l.position.set(BAY_X, 0.07, z + dz);
        g.add(l);
      }
      // островок со сливным стояком
      this.box(14, 0.35, 1.3, mat(C.concrete), BAY_X, 0, z - 2.75, g);
      for (const bx of [BAY_X - 7, BAY_X + 7]) this.box(0.5, 1.1, 0.5, mat(C.yellow), bx, 0, z - 2.75, g);
      this.box(1.2, 2, 0.9, mat(C.white), BAY_X - 3, 0.35, z - 2.75, g);
      const light = this.box(0.9, 0.35, 0.95, new THREE.MeshStandardMaterial({ color: C.green, emissive: C.green, emissiveIntensity: 0.8 }), BAY_X - 3, 2.35, z - 2.75, g, false);
      this.box(0.3, 5.2, 0.3, mat(C.steel, { metalness: 0.5 }), BAY_X + 1.5, 0.35, z - 2.75, g);
      const armM = mat(C.yellow, { roughness: 0.5 });
      const arm = this.box(0.25, 0.25, 2.6, armM, BAY_X + 1.5, 4.3, z - 1.5, g);
      arm.rotation.x = 0.35;
      this.box(0.22, 2.2, 0.22, armM, BAY_X + 1.5, 1.4, z - 0.4, g);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.4), new THREE.MeshBasicMaterial({ color: C.orange, transparent: true, opacity: 0, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(BAY_X, 0.09, z);
      g.add(glow);
      this.dispensers.push({ light, glow });
      // номер поста на покрытии
      const num = this.label(`№${i + 1}`, C.navy);
      num.rotation.x = -Math.PI / 2;
      num.position.set(BAY_X - 11, 0.08, z);
      num.scale.setScalar(0.6);
      g.add(num);
    });
    if (n % 1 === 0) this.box(14, 0.35, 1.3, mat(C.concrete), BAY_X, 0, zs[n - 1] + 2.75, g);
    // навес
    const roofW = 32, roofD = zMax - zMin + 2;
    const cz = (zMin + zMax) / 2;
    const roof = this.box(roofW, 0.5, roofD, new THREE.MeshStandardMaterial({ color: 0xeaf1ff, transparent: true, opacity: 0.32, roughness: 0.2, depthWrite: false }), BAY_X, 7.5, cz, g, false);
    roof.renderOrder = 4;
    for (let x = BAY_X - roofW / 2 + 4; x < BAY_X + roofW / 2; x += 8) this.box(0.3, 0.5, roofD, mat(C.steel, { metalness: 0.4 }), x, 7.4, cz, g, false);
    this.box(roofW + 0.4, 0.9, 0.35, mat(C.blue), BAY_X, 7.3, zMin - 1.1, g);
    this.box(roofW + 0.4, 0.9, 0.35, mat(C.blue), BAY_X, 7.3, zMax + 1.1, g);
    this.box(0.35, 0.9, roofD + 0.4, mat(C.blue), BAY_X - roofW / 2, 7.3, cz, g);
    this.box(0.35, 0.9, roofD + 0.4, mat(C.blue), BAY_X + roofW / 2, 7.3, cz, g);
    for (const z of [zMin - 0.5, ...zs.map((zz) => zz - 2.75), zs[n - 1] + 2.75, zMax + 0.5].filter((_, k, a) => k === 0 || k === a.length - 1)) {
      for (const x of [BAY_X - 13, BAY_X, BAY_X + 13]) this.box(0.6, 7.4, 0.6, mat(C.steel, { metalness: 0.45 }), x, 0, z, g);
    }
    zs.forEach((z) => this.box(0.5, 7.4, 0.5, mat(C.steel, { metalness: 0.45 }), BAY_X - 6, 0.35, z - 2.75, g));
    // ночное освещение навеса: светильники и панели под кровлей
    const panelM = new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xe8f0ff, emissiveIntensity: 0 });
    panelM.userData.nightEmissive = 1.8;
    for (const x of [BAY_X - 8, BAY_X + 8]) {
      this.box(5, 0.12, roofD - 3, panelM, x, 7.1, cz, g, false);
      const pl = new THREE.PointLight(0xe6efff, 0, 30, 1.5);
      pl.position.set(x, 6.6, cz);
      pl.userData.nightIntensity = 140;
      g.add(pl);
    }
    this.root.add(g);
    if (this.hemi) this.applyNight();
  }

  /* ---------- автоцистерны ---------- */

  private makeTruck(id: number, component: 0 | 1 = 0) {
    const g = new THREE.Group();
    const G = this.truckGeo;
    G.chassis ??= new THREE.BoxGeometry(10.6, 0.5, 2.2);
    G.cab ??= new THREE.BoxGeometry(2.4, 2.6, 2.5);
    G.glass ??= new THREE.BoxGeometry(0.1, 1, 2.2);
    G.tank ??= new THREE.CylinderGeometry(1.25, 1.25, 7.6, 28);
    G.cap ??= new THREE.SphereGeometry(1.25, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    G.band ??= new THREE.CylinderGeometry(1.28, 1.28, 0.22, 28);
    G.wheel ??= new THREE.CylinderGeometry(0.55, 0.55, 0.45, 16);
    G.stripe ??= new THREE.BoxGeometry(2.42, 0.3, 2.52);
    const accent = component === 0 ? C.blue : 0x0fae9f;
    void id;
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rz = 0, rx = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rz;
      mesh.rotation.x = rx;
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    add(G.chassis, mat(0x2b3442), 0, 0.85, 0);
    add(G.cab, mat(0xffffff, { roughness: 0.4 }), 4.1, 2.35, 0);
    add(G.stripe, mat(accent, { roughness: 0.5 }), 4.1, 1.6, 0);
    add(G.glass, mat(0x1e293b, { roughness: 0.1, metalness: 0.6 }), 5.32, 2.9, 0);
    const tankM = mat(0xdfe5ec, { roughness: 0.28, metalness: 0.65 });
    add(G.tank, tankM, -0.9, 2.45, 0, Math.PI / 2);
    add(G.cap, tankM, 2.9, 2.45, 0, -Math.PI / 2);
    add(G.cap, tankM, -4.7, 2.45, 0, Math.PI / 2);
    for (const bx of [-3.6, -0.9, 1.8]) add(G.band, mat(accent, { roughness: 0.5 }), bx, 2.45, 0, Math.PI / 2);
    for (const wx of [-3.8, -2.6, 3.9]) for (const wz of [-1.05, 1.05]) add(G.wheel, mat(0x1f2937), wx, 0.55, wz, 0, Math.PI / 2);
    G.lamp ??= new THREE.BoxGeometry(0.08, 0.32, 0.5);
    for (const lz of [-0.82, 0.82]) {
      add(G.lamp, this.headMat, 5.36, 1.55, lz);
      add(G.lamp, this.tailMat, -5.0, 1.0, lz);
    }
    g.scale.setScalar(0.95);
    return g;
  }

  private targetFor(t: TruckTrace, phase: Phase, k: number): THREE.Vector3 | null {
    switch (phase) {
      case 'approach': return k < 3 ? new THREE.Vector3(GATE_X - 13 * (k + 1), 0, SOUTH_Z) : null; // остальные ждут за воротами
      case 'gate': return new THREE.Vector3(GATE_X, 0, SOUTH_Z);
      case 'wait': return k < 6 ? new THREE.Vector3(-28 + k * 5.5, 0, 33) : k < 12 ? new THREE.Vector3(-25.25 + (k - 6) * 5.5, 0, 45.5) : null;
      case 'bay': return new THREE.Vector3(BAY_X, 0, laneZ(t.bay % MAX_LANES, this.lanes));
      case 'leave': return new THREE.Vector3(-125, 0, NORTH_Z);
      default: return null;
    }
  }

  private route(from: THREE.Vector3, prev: Phase, phase: Phase, target: THREE.Vector3): THREE.Vector3[] {
    const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
    if (phase === 'wait' && prev !== 'wait') return [V(target.x, SOUTH_Z), V(target.x, target.z)];
    if (phase === 'bay') return [V(from.x, Math.min(from.z, 27)), V(-12, SOUTH_Z - 1), V(-12, target.z), target];
    if (phase === 'leave' && prev === 'bay') return [V(30, from.z), V(34, from.z - 2), V(34, NORTH_Z), target];
    return [target];
  }

  private phaseOf(t: TruckTrace, now: number): Phase {
    if (now < t.arrive - 1.2) return 'hidden';
    if (now >= t.bayEnd) return now < t.bayEnd + 240 ? 'leave' : 'hidden';
    if (!(now >= t.gateStart)) return 'approach';
    if (!(now >= t.gateEnd)) return 'gate';
    if (!(now >= t.bayStart)) return 'wait';
    return 'bay';
  }

  private updateTrucks(dt: number) {
    const tr = this.trace;
    if (!tr) return;
    const now = this.simTime;
    const jump = Math.abs(now - this.lastSimTime) > 25 || now < this.lastSimTime - 0.01;
    this.lastSimTime = now;
    const speed = 14 + Math.min(this.simSpeed, 1440) * 0.05;

    // окно активных машин: машины отсортированы по прибытию, больше двух суток на базе никто не стоит
    const list = tr.trucks;
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].arrive < now - 2880) lo = m + 1; else hi = m; }
    const active: { t: TruckTrace; p: Phase }[] = [];
    for (let i = lo; i < list.length && list[i].arrive <= now + 2; i++) {
      const p = this.phaseOf(list[i], now);
      if (p !== 'hidden') active.push({ t: list[i], p });
    }
    const approach = active.filter((a) => a.p === 'approach').sort((a, b) => a.t.arrive - b.t.arrive);
    const seen = new Set<number>();
    // места на площадке закрепляются, чтобы машины не «перескакивали» и не наезжали друг на друга
    const taken = new Set<number>();
    for (const a of active) { const v = this.trucks.get(a.t.id); if (a.p === 'wait' && v && v.phase === 'wait' && v.slot >= 0) taken.add(v.slot); }

    for (const { t, p } of active) {
      let v = this.trucks.get(t.id);
      if (v && v.phase === 'gone') { seen.add(t.id); continue; }
      let k = 0;
      if (p === 'approach') k = approach.findIndex((a) => a.t === t);
      if (p === 'wait') {
        if (!v || v.phase !== 'wait' || v.slot < 0) {
          let sl = 0;
          while (taken.has(sl)) sl++;
          if (v) v.slot = sl;
          taken.add(sl);
          k = sl;
        } else k = v.slot;
      }
      const target = this.targetFor(t, p, k);
      if (!target || (p === 'leave' && jump)) {
        if (v) { this.dynamic.remove(v.g); this.pool[v.grade].push(v.g); this.trucks.delete(t.id); }
        continue;
      }
      seen.add(t.id);
      if (!v) {
        const g = this.pool[t.component].pop() ?? this.makeTruck(t.id, t.component);
        this.dynamic.add(g);
        v = { g, grade: t.component, phase: 'hidden', waypoints: [], heading: 0, lane: -1, slot: p === 'wait' ? k : -1 };
        this.trucks.set(t.id, v);
        const start = jump || p !== 'approach' ? target : new THREE.Vector3(-125, 0, SOUTH_Z);
        v.g.position.copy(start);
        v.heading = p === 'wait' ? Math.PI / 2 : p === 'leave' ? Math.PI : 0;
        v.g.rotation.y = -v.heading;
        v.waypoints = start === target ? [] : [target];
        v.phase = p;
      } else if (jump) {
        v.g.position.copy(target);
        v.waypoints = [];
        v.heading = p === 'wait' ? Math.PI / 2 : 0;
        v.g.rotation.y = -v.heading;
        v.phase = p;
      } else if (p !== v.phase) {
        v.waypoints = this.route(v.g.position, v.phase, p, target);
        v.phase = p;
      } else if (p !== 'leave') {
        const last = v.waypoints[v.waypoints.length - 1] ?? v.g.position;
        if (last.distanceToSquared(target) > 0.5) {
          if (v.waypoints.length) v.waypoints[v.waypoints.length - 1] = target;
          else v.waypoints = [target];
        }
      }
      if (p !== 'wait') v.slot = -1;
      // движение по точкам маршрута
      let budget = speed * dt;
      while (budget > 0 && v.waypoints.length) {
        const wp = v.waypoints[0];
        const dx = wp.x - v.g.position.x, dz = wp.z - v.g.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.05) { v.waypoints.shift(); continue; }
        const step = Math.min(dist, budget);
        v.g.position.x += (dx / dist) * step;
        v.g.position.z += (dz / dist) * step;
        budget -= step;
        if (dist > 0.4) v.heading = Math.atan2(dz, dx);
        if (step >= dist) v.waypoints.shift();
      }
      const cur = -v.g.rotation.y;
      let diff = v.heading - cur;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      v.g.rotation.y = -(cur + diff * Math.min(1, dt * 7));
      // доехала до края — исчезает
      if (p === 'leave' && !v.waypoints.length) { this.dynamic.remove(v.g); this.pool[v.grade].push(v.g); v.phase = 'gone'; }
    }
    for (const [id, v] of this.trucks) {
      if (!seen.has(id)) { if (v.phase !== 'gone') { this.dynamic.remove(v.g); this.pool[v.grade].push(v.g); } this.trucks.delete(id); }
    }

    // посты слива
    const states = this.dispensers.map(() => 0);
    for (const { t } of active) {
      if (t.bay < 0 || !(now >= t.bayStart && now < t.bayEnd)) continue;
      const i = t.bay % MAX_LANES;
      if (i >= states.length) continue;
      states[i] = now >= t.fillStart && now < t.fillEnd ? 2 : 1;
    }
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    this.dispensers.forEach((d, i) => {
      const m = d.light.material as THREE.MeshStandardMaterial;
      const col = states[i] === 2 ? C.orange : states[i] === 1 ? C.blue : C.green;
      m.color.setHex(col);
      m.emissive.setHex(col);
      m.emissiveIntensity = states[i] === 2 ? 0.6 + pulse * 0.9 : 0.7;
      (d.glow.material as THREE.MeshBasicMaterial).opacity = states[i] === 2 ? 0.12 + pulse * 0.16 : states[i] === 1 ? 0.06 : 0;
    });
    const filling = states.some((s) => s === 2);
    if (this.flowTex && this.flowMesh) {
      this.flowTex.offset.x -= dt * (filling ? 1.6 : 0); // налив: от резервуаров к постам
      const fm = this.flowMesh.material as THREE.MeshBasicMaterial;
      fm.opacity += ((filling ? 0.95 : 0) - fm.opacity) * Math.min(1, dt * 4);
    }

    // шлагбаумы
    const openIn = active.some(({ t }) => now >= t.gateEnd - 0.4 && now < t.gateEnd + 0.8);
    const openOut = active.some(({ t }) => Number.isFinite(t.exit) && now >= t.exit - 0.3 && now < t.exit + 0.8);
    this.barriers.forEach((b, i) => {
      const want = (i === 0 ? openIn : openOut) ? -1.35 * (b.userData.dir as number) : 0;
      b.rotation.x += (want - b.rotation.x) * Math.min(1, dt * 6);
    });

    this.updateBottling(dt);

    // уровни и состояния резервуаров — прямо из модели
    const tk = tanksAt(tr, now);
    const stateColor = { fill: 0x3b82f6, qc: 0xf59e0b, ship: 0x22c55e, empty: 0x94a3b8 } as const;
    this.levelBars.forEach((bar, i) => {
      const want = THREE.MathUtils.clamp(tk.lv[i] ?? 0, 0.02, 1);
      bar.scale.y += (want - bar.scale.y) * Math.min(1, dt * 3);
    });
    this.tankLights.forEach((m, i) => {
      const c = stateColor[tk.st[i] ?? 'empty'];
      m.color.setHex(c);
      m.emissive.setHex(c);
      m.emissiveIntensity = tk.st[i] === 'fill' ? 0.5 + 0.5 * Math.abs(Math.sin(performance.now() / 400)) : 0.8;
    });
  }

  /* ---------- камера ---------- */

  private flyTo(target: THREE.Vector3, zoom: number) {
    this.fly = { from: this.controls.target.clone(), to: target, z0: this.camera.zoom, z1: zoom, t: 0 };
  }

  private resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    const aspect = w / h;
    this.baseHalf = aspect < 1.1 ? 62 / Math.max(0.55, aspect) * 0.9 : aspect > 2.2 ? 48 : 60;
    const hh = this.baseHalf;
    this.camera.left = -hh * aspect;
    this.camera.right = hh * aspect;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
    this.persp.aspect = aspect;
    this.persp.fov = aspect < 0.9 ? 68 : 55;
    this.persp.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
  }

  private onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else { this.clock.getDelta(); this.loop(); }
  };

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.fly) {
      this.fly.t = Math.min(1, this.fly.t + dt / 0.9);
      const e = 1 - Math.pow(1 - this.fly.t, 3);
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.controls.target.lerpVectors(this.fly.from, this.fly.to, e);
      this.camera.position.copy(this.controls.target).add(offset);
      this.camera.zoom = this.fly.z0 + (this.fly.z1 - this.fly.z0) * e;
      this.camera.updateProjectionMatrix();
      if (this.fly.t >= 1) this.fly = null;
    }
    if (this.eyeFly) {
      const f = this.eyeFly;
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
      this.persp.position.lerpVectors(f.p0, f.p1, e);
      this.persp.position.y += Math.sin(Math.PI * e) * f.arc;
      const look = new THREE.Vector3().lerpVectors(f.l0, f.l1, e);
      this.persp.lookAt(look);
      if (f.t >= 1) {
        const d = f.l1.clone().sub(f.p1).normalize();
        this.yaw = Math.atan2(d.x, d.z);
        this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
        this.eyeFly = null;
        f.then?.();
      }
    } else if (this.eyeId) {
      this.persp.lookAt(this.persp.position.clone().add(this.lookDir()));
    }
    if (this.active === this.camera) this.controls.update();
    if (this.opts.getTime) { const c = this.opts.getTime(); this.simTime = c.t; this.simSpeed = c.speed; }
    this.updateTrucks(dt);
    const tnow = performance.now() / 1000;
    this.arrows.forEach((m) => { m.opacity = 0.35 + 0.6 * Math.max(0, Math.sin(tnow * 2.2 - (m.userData.phase as number) * 0.9)); });
    const hm = 0.65 + 0.35 * Math.sin(tnow * 3);
    this.highlightMat.opacity = hm;
    if (this.night) {
      const blink = Math.sin(tnow * 3.2) > 0.55 ? 2.4 : 0.15;
      this.beacons.forEach((b) => { b.emissiveIntensity = blink; });
    }
    this.renderer.render(this.scene, this.active);

    if (this.opts.onPins) {
      const w = this.el.clientWidth, h = this.el.clientHeight;
      const out = {} as Record<PoiId, PinScreen>;
      for (const p of POIS) {
        this.pinVec.set(p.anchor[0], p.anchor[1], p.anchor[2]);
        const far = this.active === this.persp && this.pinVec.distanceTo(this.persp.position) > 58;
        this.pinVec.project(this.active);
        out[p.id] = { x: (this.pinVec.x * 0.5 + 0.5) * w, y: (-this.pinVec.y * 0.5 + 0.5) * h, visible: !far && this.pinVec.z < 1 && Math.abs(this.pinVec.x) < 1.05 && Math.abs(this.pinVec.y) < 1.05 };
      }
      this.opts.onPins(out);
    }
  };
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tube(points: THREE.Vector3[], r: number, m: THREE.Material, parent: THREE.Object3D) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = a.distanceTo(b);
    if (len < 0.01) continue;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    mesh.castShadow = true;
    parent.add(mesh);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 10, 8), m);
    joint.position.copy(b);
    parent.add(joint);
  }
}

function skyTexture(top: string, bottom: string) {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 256;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.62, bottom);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function radialTexture(inner: string, outer: string) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 110, 10, 128, 128, 200);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
