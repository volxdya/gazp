import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TruckTrace, TwinResult } from '@/lib/twin/sim';
import { levelAt } from '@/lib/twin/derive';

/** цвета тары по рецептурам */
const RECIPE_COLORS = [0xf59e0b, 0x2f6bff, 0x0fae9f, 0xef4444];
import { POIS, type PoiId } from '@/lib/twin/pois';

/**
 * Изометрическая 3D-сцена участка технических масел на Three.js.
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

type Phase = 'hidden' | 'approach' | 'gate' | 'toScale' | 'tare' | 'wait' | 'bay' | 'toGross' | 'gross' | 'docs' | 'leave';

interface TruckVis {
  g: THREE.Group;
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
  private truckGeo: Record<string, THREE.BufferGeometry> = {};
  private simTime = 0;
  private lastSimTime = 0;
  private simSpeed = 60;
  private lanes = 2;
  private dispensers: { light: THREE.Mesh; glow: THREE.Mesh }[] = [];
  private barriers: THREE.Object3D[] = [];
  private levelBars: THREE.Mesh[] = [];
  private flowTex: THREE.CanvasTexture | null = null;
  private arrows: THREE.MeshBasicMaterial[] = [];
  private highlight = new THREE.Group();
  private highlightMat = new THREE.MeshBasicMaterial({ color: C.orange, transparent: true, opacity: 0.9, depthWrite: false });
  private highlightFill = new THREE.MeshBasicMaterial({ color: C.orange, transparent: true, opacity: 0.1, depthWrite: false });
  private fly: { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; t: number } | null = null;
  private baseHalf = 62;
  private pinVec = new THREE.Vector3();
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
    if (Math.min(result.params.bays, MAX_LANES) !== this.lanes) this.buildLanes(result.params.bays);
    for (const v of this.trucks.values()) this.dynamic.remove(v.g);
    this.trucks.clear();
    for (const t of result.trucks) {
      const g = this.makeTruck(t.id, t.component);
      g.visible = false;
      this.dynamic.add(g);
      this.trucks.set(t.id, { g, phase: 'hidden', waypoints: [], heading: 0, lane: -1, slot: -1 });
    }
    this.lastSimTime = -999;
  }

  setTime(t: number, speed = this.simSpeed) {
    this.simTime = t;
    this.simSpeed = speed;
  }

  focus(id: PoiId | null) {
    while (this.highlight.children.length) {
      const c = this.highlight.children.pop()! as THREE.Mesh;
      c.geometry.dispose();
    }
    const poi = id ? POIS.find((p) => p.id === id) : null;
    if (!poi) {
      this.flyTo(new THREE.Vector3(-4, 0, 0), 1.3);
      return;
    }
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

  resetView() { this.focus(null); }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
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
    this.scene.add(new THREE.HemisphereLight(0xf4f8ff, 0xc9d3de, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
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
    // обвалование
    const wall = mat(0xd5dbe3);
    this.box(50, 1.2, 0.6, wall, 18, 0, -50.5);
    this.box(50, 1.2, 0.6, wall, 18, 0, -25.5);
    this.box(0.6, 1.2, 25, wall, -6.7, 0, -38);
    this.box(0.6, 1.2, 25, wall, 42.7, 0, -38);
    this.flat(49, 24.4, mat(0xe9edf1), 18, 0.04, -38);
    const shell = mat(C.tank, { roughness: 0.45, metalness: 0.15 });
    PRODUCTS.forEach((p, i) => {
      const x = 0 + i * 12, z = -38, r = 5, h = 11;
      this.cyl(r + 0.4, r + 0.4, 0.5, mat(C.concrete), x, 0, z, 40);
      this.cyl(r, r, h, shell, x, 0.5, z, 48);
      this.cyl(r + 0.05, r + 0.05, 0.9, mat(p.color, { roughness: 0.5 }), x, h - 1.6, z, 48);
      this.cyl(0.8, r + 0.15, 1.3, mat(0xeef2f6, { roughness: 0.5 }), x, h + 0.5, z, 48);
      // перила на крыше
      const rail = new THREE.Mesh(new THREE.TorusGeometry(r - 0.2, 0.06, 6, 48), mat(C.steel));
      rail.rotation.x = Math.PI / 2;
      rail.position.set(x, h + 1.5, z);
      this.root.add(rail);
      // шкала уровня
      this.box(0.7, h - 3, 0.25, mat(0xd8dee6), x - 2.2, 1.4, z + r - 0.05, this.root, false);
      const lvl = this.box(0.5, h - 3.2, 0.3, mat(p.color, { emissive: p.color, emissiveIntensity: 0.25 }), x - 2.2, 1.5, z + r, this.root, false);
      lvl.geometry.translate(0, -(h - 3.2) / 2, 0);
      lvl.position.y = 1.5;
      lvl.userData.full = h - 3.2;
      this.levelBars.push(lvl);
      const lab = this.label(p.name, p.color);
      lab.position.set(x + 1.6, 5.2, z + r + 0.08);
      this.root.add(lab);
      // лестница
      const ladder = this.box(0.9, h, 0.15, mat(C.dark), x + r * 0.7, 0.5, z + r * 0.7, this.root, false);
      ladder.rotation.y = Math.PI / 4;
    });
    // коллектор под резервуарами
    const pipeM = mat(0x9aa8b8, { metalness: 0.55, roughness: 0.35 });
    PRODUCTS.forEach((p, i) => {
      const y = 1 + i * 0.55;
      tube([new THREE.Vector3(i * 12, y, -33), new THREE.Vector3(i * 12, y, -29 + i * 0.6), new THREE.Vector3(44, y, -29 + i * 0.6)], 0.22, mat(p.color, { roughness: 0.5 }), this.root);
    });
    void pipeM;
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
  private canisters: THREE.InstancedMesh | null = null;
  private canisterMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45 });
  private conveyorPhase = 0;
  private fillerLight: THREE.MeshStandardMaterial | null = null;
  private pallets: THREE.Object3D[] = [];
  private bottleFlowMat: THREE.MeshBasicMaterial | null = null;
  private feedTex: THREE.CanvasTexture | null = null;
  private blenderGroups: THREE.Group[] = [];
  private agitators: THREE.Object3D[] = [];

  /** Цех розлива масла в канистры и склад готовой продукции (без крыши — видно оборудование внутри) */
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
    // конвейер
    const belt = this.box(24, 0.3, 1.5, mat(0x3a4656, { roughness: 0.6 }), 26, 1.1, 40);
    belt.castShadow = false;
    for (let x = 15; x <= 37; x += 3) {
      this.box(0.2, 1.1, 0.2, mat(C.steel), x, 0.27, 39.4, this.root, false);
      this.box(0.2, 1.1, 0.2, mat(C.steel), x, 0.27, 40.6, this.root, false);
    }
    this.box(24, 0.35, 0.12, mat(C.steel, { metalness: 0.5 }), 26, 1.3, 39.2, this.root, false);
    this.box(24, 0.35, 0.12, mat(C.steel, { metalness: 0.5 }), 26, 1.3, 40.8, this.root, false);
    // разливочный автомат, укупорка, этикетировщик
    this.box(3.4, 2.6, 2.6, mat(0xffffff, { roughness: 0.35 }), 20, 1.4, 40);
    this.box(3.6, 0.4, 2.8, band, 20, 4, 40);
    const light = new THREE.MeshStandardMaterial({ color: C.green, emissive: C.green, emissiveIntensity: 0.8 });
    this.fillerLight = light;
    this.box(0.5, 0.5, 0.5, light, 21.3, 4.4, 40, this.root, false);
    for (let i = 0; i < 4; i++) this.box(0.18, 0.9, 0.18, mat(C.steel, { metalness: 0.6 }), 19 + i * 0.7, 2.1, 40, this.root, false);
    this.box(2, 2.2, 2.2, mat(0xf3f6fa), 25.5, 1.4, 40);
    this.box(2.2, 0.3, 2.4, mat(0x14b8a6), 25.5, 3.6, 40);
    this.box(1.8, 1.6, 2, mat(0xf3f6fa), 30, 1.4, 40);
    this.box(0.9, 1.6, 0.6, mat(C.dark), 17, 0.27, 37.6);
    // палетная зона
    this.box(2.2, 0.3, 2.2, mat(0xc49a6c), 36, 0.27, 33.5);
    this.box(2, 1.2, 1.8, mat(0xf59e0b, { roughness: 0.5 }), 36, 0.57, 33.5);
    // канистры на конвейере (инстансы)
    const canGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.9, 14);
    const n = 22;
    this.canisters = new THREE.InstancedMesh(canGeo, this.canisterMat, n);
    this.canisters.castShadow = true;
    this.root.add(this.canisters);
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
    // склад: стеллажи
    const rackM = mat(0x2f6bff, { metalness: 0.3, roughness: 0.5 });
    const palletM = mat(0xc49a6c);
    const stackM = [0x2f6bff, 0x12b981, 0xf59e0b, 0xef4444].map((c) => mat(c, { roughness: 0.5 }));
    let k = 0;
    for (const rz of [33, 38.5, 47]) {
      for (const lvl of [0, 1.9]) {
        if (lvl > 0) this.box(13, 0.15, 2.4, mat(C.steel, { metalness: 0.4 }), 48, 0.27 + lvl, rz, this.root, false);
        for (let i = 0; i < 4; i++) {
          const px = 43 + i * 3.2;
          const g = new THREE.Group();
          const pal = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 2), palletM);
          pal.position.y = 0.1;
          const stack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 1.8), stackM[k % 4]);
          stack.position.y = 0.85;
          pal.castShadow = stack.castShadow = true;
          g.add(pal, stack);
          g.position.set(px, 0.27 + lvl + (lvl ? 0.08 : 0), rz);
          g.visible = false;
          this.root.add(g);
          this.pallets.push(g);
          k++;
        }
      }
      for (const px of [41.6, 48, 54.4]) this.box(0.18, 3.8, 0.18, rackM, px, 0.27, rz - 1.1, this.root, false);
      for (const px of [41.6, 48, 54.4]) this.box(0.18, 3.8, 0.18, rackM, px, 0.27, rz + 1.1, this.root, false);
    }
    // погрузчик
    this.box(1.6, 1.1, 2.4, mat(C.orange), 47, 0.27, 43.2);
    this.box(1.4, 1.2, 0.6, mat(C.dark), 47, 1.37, 42.6);
    this.box(0.15, 2.6, 0.15, mat(C.dark), 46.5, 0.27, 41.6, this.root, false);
    this.box(0.15, 2.6, 0.15, mat(C.dark), 47.5, 0.27, 41.6, this.root, false);
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

  private updateBottling(dt: number) {
    const tr = this.trace;
    if (!tr || !this.canisters) return;
    const now = this.simTime;
    let active: (typeof tr.batches)[number] | null = null;
    let bottled = 0, feeding = false, blending = 0;
    for (const b of tr.batches) {
      if (now >= b.feedStart && now < b.feedEnd) feeding = true;
      if (now >= b.feedStart && now < b.qcEnd) blending++;
      if (now >= b.lineStart && now < b.lineEnd) active = b;
      if (now >= b.lineStart) bottled += now >= b.lineEnd ? b.units : b.units * ((now - b.lineStart) / Math.max(0.01, b.lineEnd - b.lineStart));
    }
    if (active) {
      this.conveyorPhase += dt * (0.9 + this.simSpeed * 0.004);
      this.canisterMat.color.setHex(RECIPE_COLORS[active.product % 4]);
    }
    const m = new THREE.Matrix4();
    const n = this.canisters.count;
    for (let i = 0; i < n; i++) {
      const u = ((i / n + this.conveyorPhase * 0.05) % 1 + 1) % 1;
      const x = 15 + u * 22;
      const show = active ? x > 18.5 || u < 0.06 : x > 21.5 && i % 2 === 0;
      m.makeTranslation(x, 1.72, 40);
      if (!show) m.scale(new THREE.Vector3(0.0001, 0.0001, 0.0001));
      this.canisters.setMatrixAt(i, m);
    }
    this.canisters.instanceMatrix.needsUpdate = true;
    if (this.fillerLight) {
      const col = active ? C.orange : C.green;
      this.fillerLight.color.setHex(col);
      this.fillerLight.emissive.setHex(col);
      this.fillerLight.emissiveIntensity = active ? 0.7 + 0.6 * Math.abs(Math.sin(performance.now() / 240)) : 0.7;
    }
    
    if (this.feedTex && feeding) this.feedTex.offset.x -= dt * 1.4;
    if (this.bottleFlowMat) this.bottleFlowMat.opacity += ((feeding ? 0.95 : 0) - this.bottleFlowMat.opacity) * Math.min(1, dt * 4);
    this.blenderGroups.forEach((g, i) => { g.visible = i < tr.params.blenders; });
    this.agitators.forEach((a, i) => { if (i < blending) a.rotation.y += dt * (2 + this.simSpeed * 0.01); });
    const visible = Math.min(this.pallets.length, Math.floor(bottled / 30));
    this.pallets.forEach((p, i) => { p.visible = i < visible; });
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
      this.box(1.6, 0.25, 0.5, mat(C.dark), x + 0.6, 7, z);
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
    this.root.add(g);
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
    g.scale.setScalar(0.95);
    return g;
  }

  private targetFor(t: TruckTrace, phase: Phase, k: number): THREE.Vector3 {
    switch (phase) {
      case 'approach': return new THREE.Vector3(GATE_X - 13 * (k + 1), 0, SOUTH_Z);
      case 'gate': return new THREE.Vector3(GATE_X, 0, SOUTH_Z);
      case 'toScale': return new THREE.Vector3(SCALE_IN_X - 11 - 13 * k, 0, SOUTH_Z);
      case 'tare': return new THREE.Vector3(SCALE_IN_X, 0, SOUTH_Z);
      case 'wait': {
        const s = Math.min(k, 11);
        return s < 6 ? new THREE.Vector3(-28 + s * 5.5, 0, 33) : new THREE.Vector3(-25.25 + (s - 6) * 5.5, 0, 45.5);
      }
      case 'bay': return new THREE.Vector3(BAY_X, 0, laneZ(t.bay % MAX_LANES, this.lanes));
      case 'toGross': return new THREE.Vector3(SCALE_OUT_X + 13 + 13 * k, 0, NORTH_Z);
      case 'gross': return new THREE.Vector3(SCALE_OUT_X, 0, NORTH_Z);
      case 'docs': return new THREE.Vector3(DOCS_X, 0, NORTH_Z);
      case 'leave': return new THREE.Vector3(-125, 0, NORTH_Z);
      default: return new THREE.Vector3(-125, 0, SOUTH_Z);
    }
  }

  private route(from: THREE.Vector3, prev: Phase, phase: Phase, target: THREE.Vector3, t: TruckTrace): THREE.Vector3[] {
    const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
    if (phase === 'wait' && prev !== 'wait') return [V(target.x, SOUTH_Z), V(target.x, target.z)];
    if (phase === 'bay') {
      const z = target.z;
      return [V(from.x, Math.min(from.z, 27)), V(-12, SOUTH_Z - 1), V(-12, z), target];
    }
    if (phase === 'toGross' && prev === 'bay') return [V(30, from.z), V(34, from.z - 2), V(34, NORTH_Z), target];
    if (phase === 'gross' && prev === 'bay') return [V(30, from.z), V(34, from.z - 2), V(34, NORTH_Z), target];
    return [target];
  }

  private phaseOf(t: TruckTrace, now: number): Phase {
    if (now < t.arrive - 1.2) return 'hidden';
    if (Number.isFinite(t.exit) && now >= t.exit) return now < t.exit + 2 ? 'leave' : 'hidden';
    if (!(now >= t.gateStart)) return 'approach';
    if (!(now >= t.gateEnd)) return 'gate';
    if (!(now >= t.tareStart)) return 'toScale';
    if (!(now >= t.tareEnd)) return 'tare';
    if (!(now >= t.bayStart)) return 'wait';
    if (!(now >= t.bayEnd)) return 'bay';
    if (!(now >= t.grossStart)) return 'toGross';
    if (!(now >= t.grossEnd)) return 'gross';
    return 'docs';
  }

  private updateTrucks(dt: number) {
    const tr = this.trace;
    if (!tr) return;
    const now = this.simTime;
    const jump = Math.abs(now - this.lastSimTime) > 25 || now < this.lastSimTime - 0.01;
    this.lastSimTime = now;
    const speed = 14 + this.simSpeed * 0.07;

    const queues: Partial<Record<Phase, TruckTrace[]>> = {};
    const phases = new Map<number, Phase>();
    for (const t of tr.trucks) {
      const p = this.phaseOf(t, now);
      phases.set(t.id, p);
      if (p === 'approach' || p === 'toScale' || p === 'wait' || p === 'toGross') (queues[p] ??= []).push(t);
    }
    const order = (p: Phase, t: TruckTrace) => {
      const list = queues[p];
      if (!list) return 0;
      return list.indexOf(t);
    };
    queues.approach?.sort((a, b) => a.arrive - b.arrive);
    queues.toScale?.sort((a, b) => a.gateEnd - b.gateEnd);
    queues.toGross?.sort((a, b) => a.bayEnd - b.bayEnd);
    // места на стоянке закрепляются, чтобы машины не «перескакивали»
    const taken = new Set<number>();
    for (const t of queues.wait ?? []) { const v = this.trucks.get(t.id)!; if (v.phase === 'wait' && v.slot >= 0) taken.add(v.slot); }

    for (const t of tr.trucks) {
      const v = this.trucks.get(t.id);
      if (!v) continue;
      const p = phases.get(t.id)!;
      if (p === 'hidden') {
        v.g.visible = false;
        v.phase = 'hidden';
        v.waypoints = [];
        continue;
      }
      let k = 0;
      if (p === 'wait') {
        if (v.phase !== 'wait' || v.slot < 0) {
          let s = 0;
          while (taken.has(s)) s++;
          v.slot = s;
          taken.add(s);
        }
        k = v.slot;
      } else {
        v.slot = -1;
        k = order(p, t);
      }
      const target = this.targetFor(t, p, k);
      if (!v.g.visible || jump) {
        v.g.visible = true;
        v.g.position.copy(v.phase === 'hidden' && !jump ? new THREE.Vector3(-125, 0, SOUTH_Z) : target);
        if (jump) { v.waypoints = []; v.heading = p === 'wait' ? Math.PI / 2 : (p === 'toGross' || p === 'gross' || p === 'docs' || p === 'leave') ? Math.PI : 0; v.g.rotation.y = -v.heading; }
        else v.waypoints = [target];
        v.phase = p;
      } else if (p !== v.phase) {
        v.waypoints = this.route(v.g.position, v.phase, p, target, t);
        v.phase = p;
      } else {
        const last = v.waypoints[v.waypoints.length - 1] ?? v.g.position;
        if (last.distanceToSquared(target) > 0.5) {
          if (v.waypoints.length) v.waypoints[v.waypoints.length - 1] = target;
          else v.waypoints = [target];
        }
      }
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
    }

    // посты слива
    const states = this.dispensers.map(() => 0);
    for (const t of tr.trucks) {
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
      this.flowTex.offset.x += dt * (filling ? 1.6 : 0); // слив: от постов к резервуарам
      const fm = this.flowMesh.material as THREE.MeshBasicMaterial;
      fm.opacity += ((filling ? 0.95 : 0) - fm.opacity) * Math.min(1, dt * 4);
    }

    // шлагбаумы
    const openIn = tr.trucks.some((t) => now >= t.gateEnd - 0.4 && now < t.gateEnd + 0.8);
    const openOut = tr.trucks.some((t) => Number.isFinite(t.exit) && now >= t.exit - 0.3 && now < t.exit + 0.8);
    this.barriers.forEach((b, i) => {
      const want = (i === 0 ? openIn : openOut) ? -1.35 * (b.userData.dir as number) : 0;
      b.rotation.x += (want - b.rotation.x) * Math.min(1, dt * 6);
    });

    this.updateBottling(dt);

    // уровень в резервуарах A и B — прямо из модели
    const lv = levelAt(tr, now);
    this.levelBars.forEach((bar, i) => {
      const want = THREE.MathUtils.clamp(i < 2 ? lv.a : lv.b, 0.03, 1);
      bar.scale.y += (want - bar.scale.y) * Math.min(1, dt * 3);
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
    this.controls.update();
    if (this.opts.getTime) { const c = this.opts.getTime(); this.simTime = c.t; this.simSpeed = c.speed; }
    this.updateTrucks(dt);
    const tnow = performance.now() / 1000;
    this.arrows.forEach((m) => { m.opacity = 0.35 + 0.6 * Math.max(0, Math.sin(tnow * 2.2 - (m.userData.phase as number) * 0.9)); });
    const hm = 0.65 + 0.35 * Math.sin(tnow * 3);
    this.highlightMat.opacity = hm;
    this.renderer.render(this.scene, this.camera);

    if (this.opts.onPins) {
      const w = this.el.clientWidth, h = this.el.clientHeight;
      const out = {} as Record<PoiId, PinScreen>;
      for (const p of POIS) {
        this.pinVec.set(p.anchor[0], p.anchor[1], p.anchor[2]).project(this.camera);
        out[p.id] = { x: (this.pinVec.x * 0.5 + 0.5) * w, y: (-this.pinVec.y * 0.5 + 0.5) * h, visible: Math.abs(this.pinVec.x) < 1.05 && Math.abs(this.pinVec.y) < 1.05 };
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
