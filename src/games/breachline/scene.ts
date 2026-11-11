/** The picture. A baked-light level, destructible panel meshes, fighters, the weapon in hand and pooled effects,
 * drawn with unlit materials so integrated graphics can keep up. Resolution adapts to hold the frame rate. */
import * as THREE from 'three';
import { CELL, ROUND, WEAPONS } from './config';
import { Effects } from './effects';
import { createBake, SUN, SUN_COLOR, type Bake } from './lightbake';
import { PanelView, buildLevel, type PanelMaterials } from './levelmesh';
import { MAP } from './map';
import { loadArtWorld, type ArtWorld } from './render/artworld';
import { boxes } from './models';
import { chargeGeometry, deviceGeometry, deviceScreenTexture } from './render/kit';
import { createPatchFighters } from './render/patchfighters/index';
import { createPatchViewmodel } from './render/patchhero/index';
import { createFighters, createViewmodel, type HeroLighting } from './render/hero';
import { createPost, type PostTier } from './render/post';
import { ACT, shotDirs, weaponIdOf, type Match, type SimEvent } from './state';
import { actDuration } from './sim';
import { makeSprite, makeTextures, type TexId } from './textures';
import { PANEL_T, cellCenter, eyeOf, panelPoint, trace, viewDir, type Panel, type World } from './world';

export type QualityId = 'auto' | 'low' | 'high';
export const QUALITIES: Record<QualityId, { name: string; fps: number; min: number; max: number; cap: number; density: number }> = {
  auto: { name: 'Auto', fps: 60, min: 0.5, max: 1, cap: 1.5, density: 1 },
  low: { name: 'Performance (30 fps)', fps: 30, min: 0.55, max: 0.7, cap: 1, density: 0.5 },
  high: { name: 'Sharp', fps: 60, min: 1, max: 1, cap: 2, density: 1 },
};
export const isQuality = (v: unknown): v is QualityId => v === 'auto' || v === 'low' || v === 'high';

export interface SceneView {
  m: Match;
  /** This device's seat (-1 when it has none) and the seat whose eyes the camera uses (-1 for the overview). */
  self: number; watch: number;
  yaw: number; pitch: number;
  /** Where the local fighter was one step ago, and how far between steps this frame is. */
  px: number; pz: number; alpha: number;
  dt: number;
  reduced: boolean;
  menu: boolean;
}
export interface BreachScene {
  render(view: SceneView): void;
  handle(events: readonly SimEvent[], m: Match, self: number): void;
  resize(width: number, height: number): void;
  setQuality(q: QualityId): void;
  /** Screen position (0 to 1) of a world point, and whether it is in front of the camera. */
  project(x: number, y: number, z: number): { x: number; y: number; front: boolean };
  /** Where the camera is and which way it faces, for sound. */
  readonly ear: { x: number; y: number; z: number; yaw: number };
  readonly stats: { calls: number; triangles: number; scale: number; level: number; post?: string; art?: string; cpu?: number; programs?: number; textures?: number; geometries?: number; ready?: boolean };
  dispose(): void;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
/** True when WebGL is drawn by a CPU rasteriser (SwiftShader, llvmpipe), as on a machine with no usable GPU. */
function softwareGL(renderer: THREE.WebGLRenderer): boolean {
  const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  return /swiftshader|llvmpipe|softpipe|software/i.test(name);
}

export function createScene(canvas: HTMLCanvasElement, initial: QualityId): BreachScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: initial === 'high', powerPreference: 'high-performance', stencil: false, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color(0xd9a37a);
  scene.fog = new THREE.Fog(HORIZON, 50, 260);
  const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.08, 600);
  camera.rotation.order = 'YXZ';
  let quality = initial, scale = QUALITIES[initial].max, width = 1, height = 1, slow = 0, fast = 0, frameMs = 16;

  // ---- Level ----
  const bake: Bake = createBake();
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const textures = makeTextures(aniso);
  const materials = {} as Record<TexId, THREE.Material>;
  for (const id of Object.keys(textures) as TexId[]) materials[id] = new THREE.MeshBasicMaterial({ map: textures[id], vertexColors: true });
  let level = buildLevel(bake, materials);
  scene.add(level.group);
  // The asset renderer's rooms draw first, in a scene with no run-time lights (their light is baked).
  const artScene = new THREE.Scene();
  if (typeof location !== 'undefined' && /artdbg=[^&]*world/.test(location.search)) Object.assign(window, { __blScenes: { scene, artScene, camera: () => camera } });
  artScene.fog = scene.fog;
  let art: ArtWorld | null = null, disposed = false, probesDone = true;
  const fxFast = typeof location !== 'undefined' && /artdbg=[^&]*fxfast/.test(location.search);
  const panelMats: PanelMaterials = { wall: materials.drywall, core: materials.core, planks: materials.planks, plate: materials.plate };
  const panelGroup = new THREE.Group(); scene.add(panelGroup);
  let world: World | null = null, panels: PanelView[] = [];
  function bind(w: World) {
    for (const p of panels) { panelGroup.remove(p.mesh); p.dispose(); }
    world = w;
    // `?artdbg=world` exposes the bound world to evidence scripts (read-only use: finding damaged or reinforced panels).
    if (typeof location !== 'undefined' && /artdbg=[^&]*world/.test(location.search)) (window as unknown as { __blWorld: World }).__blWorld = w;
    panels = w.panels.map((p, i) => { const v = new PanelView(p, bake, panelMats, art?.panelLook(i) ?? null); panelGroup.add(v.mesh); return v; });
  }
  // Photo-sourced rooms stream in after the first frame; until then, and if anything fails, the procedural look stays.
  const artOff = typeof location !== 'undefined' && /[?&]art=off\b/.test(location.search);
  if (!artOff) {
    // A software rasteriser (no usable GPU) gets the light art tier, the same as the Low setting: the full one costs it
    // seconds of CPU while it streams in. `?arttier=` forces either, for evidence renders.
    const forced = /[?&]arttier=(low|high)\b/.exec(location.search)?.[1];
    const artTier = forced ?? (initial === 'low' || softwareGL(renderer) ? 'low' : 'high');
    loadArtWorld(renderer, artTier as 'low' | 'high', textures, () => {}).then(a => {
      if (disposed) { a.dispose(); return; }
      // Compile the art's shaders before it joins the scene, so the frame that first draws it does not freeze.
      const tW = performance.now();
      return a.warm(renderer, camera, artScene, post.tier === 'high' ? 4 : 0).catch(() => {}).then(() => {
        if (/artdbg=[^&]*timing/.test(location.search)) console.warn(`art timing: warm ${(performance.now() - tW).toFixed(0)} ms`);
        return a;
      });
    }).then(a => {
      if (!a) return;
      if (disposed) { a.dispose(); return; }
      art = a;
      const tI = performance.now();
      scene.remove(level.group);
      level.group.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
      level = buildLevel(bake, materials, a.claim);
      scene.add(level.group);
      artScene.add(a.group);
      if (/artdbg=[^&]*timing/.test(location.search)) console.warn(`art timing: integrate ${(performance.now() - tI).toFixed(0)} ms`);
      probesDone = false;
      stats.level = level.triangles + a.stats.triangles;
      if (world) bind(world);
    }).catch(e => { console.warn('Breachline art unavailable; using the procedural look.', e); }).finally(() => { void warmRest(); });
  } else queueMicrotask(() => { void warmRest(); });
  /** After the art: compile and upload everything that otherwise appears first in a fight (the weapon in hand, the
   * fighters, the effects), with the match's lights in place, so nothing is built during play. Then `stats.ready`. */
  async function warmRest() {
    const tick = (ms = 0) => new Promise(res => setTimeout(res, ms));
    for (let i = 0; i < 600 && !disposed; i++) { if (viewmodel.warm()) break; await tick(100); }
    if (disposed) return;
    await tick();
    try { await fighters.warm(renderer, camera); } catch (e) { console.warn('Breachline fighters warm-up failed', e); }
    if (disposed) return;
    const prev = renderer.getRenderTarget(), hdr = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, samples: post.tier === 'high' ? 4 : 0 });
    fx.prime(true);
    // Every material a damaged wall can show (cut edges, cavity, studs, planks, plate): an intact wall draws only its
    // face, so without this the first bullet hole would compile them. A tiny triangle with the panels' attributes each.
    const wallMats = new Set<THREE.Material>(Object.values(panelMats));
    if (art) for (let i = 0; i < MAP.panels.length; i++) { const l = art.panelLook(i); if (l) { wallMats.add(l.wall); if (l.planks) wallMats.add(l.planks); if (l.plate) wallMats.add(l.plate); } }
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1e-3, 0, 0, 0, 1e-3, 0], 3));
    tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    tri.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
    const wallWarm = new THREE.Group();
    for (const m of wallMats) { const mesh = new THREE.Mesh(tri, m); mesh.frustumCulled = false; wallWarm.add(mesh); }
    camera.updateMatrixWorld(); wallWarm.position.copy(camera.localToWorld(new THREE.Vector3(0, 0, -1))); fx.group.add(wallWarm);
    // The gadgets are hidden until used (charges, the uplink, grenades, the pulse ring): show them for this draw too.
    const gadgets: THREE.Object3D[] = [device, pulse, ...chargeMeshes, ...nades.map(n => n.mesh)];
    const kept = gadgets.map(o => [o.visible, o.position.clone()] as const);
    for (const o of gadgets) { o.visible = true; o.position.copy(wallWarm.position); o.updateMatrixWorld(true); }
    try {
      renderer.setRenderTarget(hdr);
      const done = renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(prev);
      await done;
      // One real draw, so the flash's and the walls' textures are uploaded too.
      renderer.setRenderTarget(hdr); renderer.render(scene, camera); renderer.setRenderTarget(prev);
    } finally {
      gadgets.forEach((o, i) => { o.visible = kept[i][0]; o.position.copy(kept[i][1]); o.updateMatrixWorld(true); });
      fx.prime(false); fx.group.remove(wallWarm); tri.dispose(); renderer.setRenderTarget(prev); hdr.dispose(); }
    stats.ready = true;
  }

  // ---- Sky, sun and a far skyline (late afternoon, matching the bake's sun) ----
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 4; skyCanvas.height = 256;
  const sg = skyCanvas.getContext('2d')!, grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f5d99'); grad.addColorStop(0.3, '#6b93c4'); grad.addColorStop(0.44, '#b8cbdc'); grad.addColorStop(0.5, '#e4e2d6'); grad.addColorStop(0.53, '#8c8a84'); grad.addColorStop(1, '#46464a');
  sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 20, 12), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  sky.renderOrder = -10; scene.add(sky);
  const sunTex = makeSprite('puff');
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: 0xfff1d6, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, toneMapped: false }));
  sun.scale.setScalar(150); sun.renderOrder = -9; scene.add(sun);
  {
    let seed = 91; const rnd = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 8) & 0xffff) / 65536; };
    const parts = [];
    for (let i = 0; i < 46; i++) { const a = i / 46 * Math.PI * 2 + rnd() * 0.1, r = 120 + rnd() * 70, h = 8 + rnd() * 26, w = 14 + rnd() * 22; parts.push({ s: [w, h, w * (0.6 + rnd() * 0.6)] as [number, number, number], p: [Math.cos(a) * r, h / 2, Math.sin(a) * r] as [number, number, number], c: 0x56607a + (Math.floor(rnd() * 3) * 0x060606), r: [0, a, 0] as [number, number, number] }); }
    const skyline = new THREE.Mesh(boxes(parts), new THREE.MeshBasicMaterial({ vertexColors: true }));
    skyline.matrixAutoUpdate = false; scene.add(skyline);
  }

  // ---- Lights: only fighters, gadgets and the weapon in hand are lit at run time ----
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a847c, 1.5), key = new THREE.DirectionalLight(0xfff0dd, 0.9);
  key.position.set(SUN.x, SUN.y + 0.5, SUN.z); scene.add(hemi, key);

  // ---- Fighters and the weapon in hand (render/hero) ----
  const heroLighting: HeroLighting = {
    probe(x, _y, z) { const l = bake.probe(x, z); return { color: [l[0], l[1], l[2]] }; },
    environment(x, z) { return art?.environment(x, z) ?? null; },
    environmentScale(x, z) { return art?.environmentScale(x, z) ?? 1; },
    sun: { x: SUN.x, y: SUN.y, z: SUN.z, color: SUN_COLOR },
  };
  // The Patch-asset soldiers are the default (they fall back to the stock ones if an asset fails to load);
  // `?fighters=stock` keeps the old ones for comparison. `?weapons=patch` opts into the Patch viewmodel.
  const opts = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const fighters = opts.get('fighters') === 'stock' ? createFighters(scene, heroLighting) : createPatchFighters(scene, heroLighting);
  const viewmodel = opts.get('weapons') === 'patch' ? createPatchViewmodel(renderer, heroLighting) : createViewmodel(renderer, heroLighting);
  const v3 = new THREE.Vector3();

  // ---- Gadgets and markers ----
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  // The uplink: the case (lit like the charges), a screen and progress bar drawn bright, three status lights, a glow
  // over the screen and a pool of its light on the floor; all tinted by the device's state, nothing redrawn.
  const dev = deviceGeometry(), screenTex = deviceScreenTexture(), devMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
  const glowBasic = (map: THREE.Texture | null, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ map, toneMapped: false, ...extra });
  const devScreen = glowBasic(screenTex), devBar = glowBasic(null), devLeds = [0, 1, 2].map(() => glowBasic(null));
  const device = new THREE.Group();
  device.add(new THREE.Mesh(dev.body, devMat), new THREE.Mesh(dev.screen, devScreen));
  const barMesh = new THREE.Mesh(dev.bar, devBar); barMesh.position.x = -0.13; device.add(barMesh);
  dev.leds.forEach((g, i) => device.add(new THREE.Mesh(g, devLeds[i])));
  const devGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeSprite('puff'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  devGlow.position.set(0, 0.36, 0.05); devGlow.scale.setScalar(1); device.add(devGlow);
  const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  const devPool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ map: makeSprite('puff'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  devPool.position.set(0, 0.012, 0.25); devPool.scale.setScalar(2.6); devPool.renderOrder = 2; device.add(devPool);
  device.visible = false; scene.add(device);
  const ringTex = makeSprite('ring');
  const ringGeo = new THREE.PlaneGeometry(1, 1); ringGeo.rotateX(-Math.PI / 2);
  const pulse = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, color: 0xff5a3c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pulse.visible = false; pulse.renderOrder = 3; scene.add(pulse);
  // The LED is drawn bright enough to bloom; the charge itself is lit like the fighters (hemisphere and key light).
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.06).multiplyScalar(6), toneMapped: false });
  const kitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const { body: chargeGeo, led: ledGeo } = chargeGeometry();
  const chargeMeshes: THREE.Group[] = [];
  // Each charge has its own copy of the material (same shader), tinted by the baked light where it sits, so it is lit
  // like the wall behind it rather than only by the scene's two run-time lights.
  const kitMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 6; i++) { const mm = kitMat.clone(); kitMats.push(mm); const g = new THREE.Group(), l = new THREE.Mesh(ledGeo, led); g.add(new THREE.Mesh(chargeGeo, mm), l); g.visible = false; scene.add(g); chargeMeshes.push(g); }
  const nadeGeo = [boxes([{ s: [0.07, 0.1, 0.07], p: [0, 0, 0], c: 0x39452f }, { s: [0.03, 0.04, 0.03], p: [0, 0.07, 0], c: 0x8a8d90 }]), boxes([{ s: [0.065, 0.13, 0.065], p: [0, 0, 0], c: 0x2a2d30 }, { s: [0.07, 0.03, 0.07], p: [0, 0.03, 0], c: 0xe0b020 }])];
  const nades: { mesh: THREE.Mesh; id: number }[] = [];
  for (let i = 0; i < 6; i++) { const mesh = new THREE.Mesh(nadeGeo[0], lambert); mesh.visible = false; scene.add(mesh); nades.push({ mesh, id: -1 }); }
  // Site letters painted on the floor.
  const siteTex: THREE.Texture[] = [];
  MAP.sites.forEach(site => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 12; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 170px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(site.id, 128, 138);
    // Worn floor paint: scuffed out in small patches, but the marker stays clearly readable.
    let seed = site.id.charCodeAt(0) * 977;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${0.25 + rnd() * 0.5})`; g.beginPath(); g.ellipse(rnd() * 256, rnd() * 256, 1 + rnd() * 5, 1 + rnd() * 2.5, rnd() * 3, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; siteTex.push(t);
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: t, color: 0xf2c23a, transparent: true, opacity: 0.85, depthWrite: false }));
    mesh.position.set((site.x0 + site.x1) / 2, 0.035, (site.z0 + site.z1) / 2 + (site.id === 'A' ? 2 : -0.2)); mesh.scale.setScalar(1.8); mesh.renderOrder = 2; scene.add(mesh);
  });

  const fx = new Effects();
  fx.density = QUALITIES[quality].density;
  scene.add(fx.group);

  let exposure = 0;
  // Post-processing by quality: the throttled setting keeps the grade and an edge pass but no bloom.
  const postTier = (q: QualityId): PostTier => (q === 'low' ? 'low' : q === 'high' ? 'high' : 'medium');
  const post = createPost(renderer, /[?&]post=off\b/.test(typeof location !== 'undefined' ? location.search : '') ? 'off' : postTier(initial));
  const drawSize = new THREE.Vector2();

  const ear = { x: 0, y: 1.6, z: 0, yaw: 0 };
  const stats: BreachScene['stats'] = { calls: 0, triangles: 0, scale, level: level.triangles };
  let orbit = 0, lastOrigin = { x: 0, y: 1, z: 0 }, time = 0;
  const cam = { x: 0, y: 12, z: 30, yaw: 0, pitch: -0.3, set: false };

  function applySize() {
    const q = QUALITIES[quality], ratio = Math.min(window.devicePixelRatio || 1, q.cap) * scale;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    renderer.getDrawingBufferSize(drawSize);
    post.setSize(drawSize.x, drawSize.y);
    stats.scale = scale;
  }
  /** Lowers the resolution when frames run long and raises it again when there is headroom. */
  function adapt(dt: number) {
    const q = QUALITIES[quality];
    if (q.min === q.max) return;
    frameMs += (dt * 1000 - frameMs) * 0.08;
    const budget = 1000 / Math.min(q.fps, 60);
    if (frameMs > budget * 1.22) { slow++; fast = 0; } else if (frameMs < budget * 1.06) { fast++; slow = 0; } else slow = fast = 0;
    if (slow > 25 && scale > q.min) { scale = Math.max(q.min, scale - 0.1); slow = 0; applySize(); }
    else if (fast > 240 && scale < q.max) { scale = Math.min(q.max, scale + 0.05); fast = 0; applySize(); }
  }

  function updateGadgets(m: Match, dt: number) {
    const blink = (time * 5) % 1 < 0.5;
    chargeMeshes.forEach((g, i) => {
      const c = m.charges[i], panel = c && m.world.panels[c.panel];
      g.visible = !!panel;
      if (!c || !panel) return;
      const at = panelPoint(panel, c.u, c.y, c.side * (panel.kind === 'wall' ? PANEL_T / 2 : 0.035));
      g.position.set(at.x, at.y, at.z);
      const lit = bake.probe(at.x, at.z); kitMats[i].color.setRGB(1.2 + lit[0] * 2.4, 1.2 + lit[1] * 2.4, 1.2 + lit[2] * 2.4);
      g.rotation.y = panel.axis === 'x' ? (c.side > 0 ? 0 : Math.PI) : c.side > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.children[1].visible = blink;
    });
    for (const n of nades) if (n.id >= 0 && !m.grenades.some(g => g.id === n.id)) { n.id = -1; n.mesh.visible = false; }
    for (const g of m.grenades) {
      let n = nades.find(v => v.id === g.id);
      if (!n) { n = nades.find(v => v.id < 0); if (!n) continue; n.id = g.id; n.mesh.geometry = nadeGeo[g.kind === 'frag' ? 0 : 1]; n.mesh.position.set(g.x, g.y, g.z); n.mesh.visible = true; }
      n.mesh.position.lerp(v3.set(g.x, g.y, g.z), Math.min(1, dt * 30));
      n.mesh.rotation.x += dt * 9; n.mesh.rotation.z += dt * 6;
    }
    device.visible = pulse.visible = !!m.device && m.phase !== 'lobby';
    if (m.device) {
      device.position.set(m.device.x, 0, m.device.z);
      device.rotation.y = ((m.device.x * 7.31 + m.device.z * 3.17) % 1) * 6.283;
      // State: counting while planted, complete when the uplink went through, shut down when defused; armed otherwise.
      // Each has its own colour and rhythm: armed breathes slowly (cyan), counting blinks faster as time runs out
      // (amber), complete holds steady (green), shut down is dark with a single red flash every two seconds.
      const counting = m.phase === 'planted', done = m.phase !== 'planted' && m.reason === 'uplink', off = m.phase !== 'planted' && m.reason === 'defused';
      const progress = counting ? Math.min(1, Math.max(0, 1 - m.t / ROUND.fuse)) : done ? 1 : 0;
      const hue = done ? [0.35, 1, 0.45] : off ? [1, 0.12, 0.08] : counting ? [1, 0.62, 0.16] : [0.3, 0.8, 1];
      const rate = counting ? (m.t < 10 ? 6 : m.t < 20 ? 3 : 1.5) : 1;
      const beat = counting ? ((time * rate) % 1 < 0.5 ? 1 : 0.35) : done ? 1 : off ? ((time * 0.5) % 1 < 0.08 ? 1 : 0) : 0.6 + 0.4 * Math.sin(time * 2.2);
      const k = off ? 0.15 : 3;
      devScreen.color.setRGB(hue[0] * k, hue[1] * k, hue[2] * k);
      devBar.color.setRGB(hue[0] * 4, hue[1] * 4, hue[2] * 4); barMesh.scale.x = Math.max(0.001, progress); barMesh.visible = progress > 0;
      devLeds[0].color.setRGB(off ? 0.05 : 0.3, off ? 0.05 : 5, off ? 0.05 : 0.6);
      devLeds[1].color.setRGB(hue[0] * 6 * beat, hue[1] * 6 * beat, hue[2] * 6 * beat);
      devLeds[2].color.setRGB(off ? 8 * beat + 0.05 : 0.05, 0.05, 0.05);
      const glow = off ? 0.6 * beat : 0.75 * beat;
      (devGlow.material as THREE.SpriteMaterial).color.setRGB(hue[0] * glow, hue[1] * glow, hue[2] * glow);
      (devPool.material as THREE.MeshBasicMaterial).color.setRGB(hue[0] * glow * 0.6, hue[1] * glow * 0.6, hue[2] * glow * 0.6);
      const lit = bake.probe(m.device.x, m.device.z); devMat.color.setRGB(1.2 + lit[0] * 2.4, 1.2 + lit[1] * 2.4, 1.2 + lit[2] * 2.4);
      const ringRate = m.phase === 'planted' ? (m.t < 10 ? 4 : m.t < 20 ? 2 : 1) : 0, t = (time * ringRate) % 1;
      pulse.position.set(m.device.x, 0.05, m.device.z); pulse.scale.setScalar(0.6 + t * 3.2);
      (pulse.material as THREE.MeshBasicMaterial).opacity = ringRate ? 0.8 * (1 - t) : 0;
    }
  }

  function place(view: SceneView) {
    const { m, dt } = view, watched = view.watch >= 0 ? m.players[view.watch] : null;
    let fov = 64, roll = 0;
    if (view.menu || !watched || m.phase === 'lobby') {
      // A slow circuit of the annex.
      orbit += dt * (view.reduced ? 0 : 0.035);
      const r = view.menu ? 36 : 30, tx = Math.cos(orbit) * r, tz = Math.sin(orbit) * r * 0.8, ty = view.menu ? 11 : 16;
      const k = cam.set ? Math.min(1, dt * 2) : 1; cam.set = true;
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * k;
      cam.yaw = Math.atan2(cam.x, cam.z); cam.pitch = -Math.atan2(cam.y - 1.5, Math.hypot(cam.x, cam.z));
      fov = 50;
    } else {
      const f = fighters.pose(view.watch), local = view.watch === view.self;
      const pose = f ? { x: f.x, z: f.z, yaw: local ? view.yaw : f.yaw, crouch: f.crouch, lean: f.lean } : watched;
      const eye = eyeOf(pose), def = WEAPONS[weaponIdOf(m, watched)], ads = smooth(watched.adsT);
      const step = view.reduced ? 0 : Math.abs(Math.sin((f?.phase ?? 0))) * 0.018 * Math.min(1.3, watched.pace);
      cam.x = eye.x; cam.y = eye.y - step; cam.z = eye.z; cam.yaw = pose.yaw; cam.pitch = local ? view.pitch : f ? f.pitch : watched.pitch; cam.set = true;
      roll = -pose.lean * 0.11;
      fov = 2 * Math.atan(Math.tan(64 * Math.PI / 360) / (1 + (def.zoom - 1) * (local ? ads : watched.ads ? 1 : 0))) * 180 / Math.PI;
    }
    camera.position.set(cam.x, cam.y, cam.z); camera.rotation.set(cam.pitch, cam.yaw, roll);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    ear.x = cam.x; ear.y = cam.y; ear.z = cam.z; ear.yaw = cam.yaw;
    sky.position.copy(camera.position); sun.position.set(cam.x + SUN.x * 400, cam.y + SUN.y * 400, cam.z + SUN.z * 400);
  }

  const DUST: Record<string, [number, number, number]> = { wall: [0.86, 0.83, 0.76], wood: [0.6, 0.45, 0.28], concrete: [0.62, 0.62, 0.6], brick: [0.62, 0.38, 0.3], metal: [0.5, 0.52, 0.55] };
  /** A round through a soft wall: a small entry hole with a puff of plaster on the near face, a wider blow-out on the
   * far face with a spray of gypsum dust and crumbs that stay on the floor. Decals belong to the cell, so they go when
   * the cell is knocked out. Planks splinter instead. */
  function softHit(m: Match, panel: Panel, cell: number, x: number, y: number, z: number, dx: number, dy: number, dz: number) {
    if (fx.density < 1 && Math.random() < 0.5) return;
    const along = panel.axis === 'x', s = Math.sign(along ? dz : dx) || 1, nx = along ? 0 : -s, nz = along ? -s : 0;
    const wood = panel.kind !== 'wall', half = (wood ? 0.07 : PANEL_T) / 2, tag = panel.id * 4096 + cell;
    const l = bake.probe(x, z), b = 0.35 + (l[0] + l[1] + l[2]) / 3, c = wood ? DUST.wood : DUST.wall;
    // Entry, on the face toward the shooter.
    fx.hole(x + nx * half, y, z + nz * half, nx, 0, nz, (wood ? 0.05 : 0.045) + Math.random() * 0.02, tag);
    impact(x + nx * half, y, z + nz * half, nx, 0, nz, wood ? 'wood' : 'wall', false);
    // Exit: a wider, ragged blow-out and a cone of dust and crumbs on the far side.
    const ex = x - nx * half, ez = z - nz * half;
    fx.hole(ex, y, ez, -nx, 0, -nz, (wood ? 0.08 : 0.1) + Math.random() * 0.05, tag);
    const n = fx.density < 1 ? 2 : 4;
    for (let i = 0; i < n; i++) fx.dust(ex - nx * 0.04, y, ez - nz * 0.04, dx * (1 + Math.random() * 2) + (Math.random() - 0.5) * 0.7, dy + Math.random() * 0.4 - 0.1, dz * (1 + Math.random() * 2) + (Math.random() - 0.5) * 0.7, 0.12 + Math.random() * 0.12, 0.6 + Math.random() * 0.6, c[0] * b, c[1] * b, c[2] * b, 0.45, 1.8, 0.4);
    // A haze that hangs for a few seconds, and powder settling on the floor below the hole on both sides.
    fx.dust(ex - nx * 0.1, y, ez - nz * 0.1, dx * 0.25, 0.04, dz * 0.25, 0.45, 3 + Math.random(), c[0] * b, c[1] * b, c[2] * b, 0.16, 2.4, -0.02, 1.2);
    if (Math.random() < 0.5) for (const sd of [1, -1]) fx.powder(x + nx * sd * (0.12 + Math.random() * 0.15), z + nz * sd * (0.12 + Math.random() * 0.15), 0.25 + Math.random() * 0.25);
    for (let i = 0; i < (fx.density < 1 ? 1 : 2); i++) fx.debris(ex, y, ez, dx * (0.5 + Math.random() * 1.5) + (Math.random() - 0.5), Math.random() * 0.8, dz * (0.5 + Math.random() * 1.5) + (Math.random() - 0.5), 0.012 + Math.random() * 0.02, c[0] * b, c[1] * b, c[2] * b, true);
  }
  /** Chips on the intact board round a fresh hole, on both faces: rounds and blast tear more than they cut. */
  const k0 = (i: number) => i % 2 === 0;
  function chipRim(panel: Panel, broken: number[], per: number, scorched = false) {
    if (fx.density < 1) per = 1;
    const half = PANEL_T / 2, nx = panel.axis === 'z' ? 1 : 0, nz = panel.axis === 'x' ? 1 : 0;
    for (const k of broken.slice(0, 12)) {
      const c0 = k % panel.cols, r0 = Math.floor(k / panel.cols);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = c0 + dc, r = r0 + dr;
        if (c < 0 || r < 0 || c >= panel.cols || r >= panel.rows || !panel.cells[r * panel.cols + c]) continue;
        for (let i = 0; i < per; i++) {
          // A point in the neighbour, beyond where its board can tear back (up to half a cell from the break).
          const back = Math.random() * 0.2, across = (Math.random() - 0.5) * 0.6;
          const u = panel.u0 + (c + 0.5 + dc * back + (dr ? across : 0)) * CELL;
          const y = panel.y0 + (r + 0.5 + dr * back + (dc ? across : 0)) * CELL;
          for (const side of [1, -1]) {
            const p = panelPoint(panel, u, y, side * half);
            fx.hole(p.x, p.y, p.z, nx * side, 0, nz * side, 0.03 + Math.random() * 0.03, panel.id * 4096 + r * panel.cols + c);
          }
          // A charge blackens the board round the opening on the side it was set (once per neighbour).
          if (scorched && i === 0 && Math.random() < 0.6) {
            const side = (panel.axis === 'x' ? lastOrigin.z : lastOrigin.x) < panel.pos ? -1 : 1, p = panelPoint(panel, u, y, side * (half + 0.002));
            fx.scorch(p.x, p.y, p.z, nx * side, 0, nz * side, 0.3 + Math.random() * 0.25, panel.id * 4096 + r * panel.cols + c);
          }
        }
      }
    }
  }
  /** A reinforcement going up: while a defender works on a wall, the plate rises from the floor over the action's
   * duration (fast at first, settling at the top), drawn from the same geometry the finished plate will have. */
  const deploys = new Map<number, PanelView>();
  function updateDeploys(m: Match) {
    const live = new Set<number>();
    for (const pl of m.players) {
      if (!pl.alive || pl.act !== ACT.reinforce || pl.actTarget < 0) continue;
      const panel = m.world.panels[pl.actTarget];
      if (!panel || panel.reinforced) continue;
      live.add(panel.id);
      let v = deploys.get(panel.id);
      if (!v) {
        v = new PanelView({ ...panel, reinforced: true, version: panel.version + 1 }, bake, panelMats, art?.panelLook(panel.id) ?? null);
        v.sync(); panelGroup.add(v.mesh); deploys.set(panel.id, v);
      }
      // First half: the folded plate is lifted into place (rising from the floor, a third of its width); second half:
      // it unfolds sideways across the wall, about its middle.
      const t = Math.min(1, pl.actT / actDuration(ACT.reinforce)), rise = 1 - (1 - Math.min(1, t * 2)) ** 3, open = Math.max(0, t * 2 - 1);
      const sx = 0.33 + 0.67 * (1 - (1 - open) ** 2), mid = panel.u0 + panel.cols * CELL / 2;
      v.mesh.scale.set(panel.axis === 'x' ? sx : 1, Math.max(0.02, rise), panel.axis === 'z' ? sx : 1);
      v.mesh.position.set(panel.axis === 'x' ? mid * (1 - sx) : 0, 0, panel.axis === 'z' ? mid * (1 - sx) : 0);
      v.mesh.updateMatrix();
    }
    for (const [id, v] of deploys) if (!live.has(id)) {
      // Done (or abandoned): when the wall is now reinforced, the anchors fire into floor and ceiling.
      const panel = m.world.panels[id];
      if (panel?.reinforced) {
        const W = panel.cols * CELL, leaves = Math.max(2, Math.round(W / 0.5));
        for (let i = 1; i < leaves; i += 2) for (const y of [0.04, panel.y0 + panel.rows * CELL - 0.04]) {
          const at = panelPoint(panel, panel.u0 + i * W / leaves, y, 0);
          for (let k = 0; k < 6; k++) fx.spark(at.x, at.y, at.z, (Math.random() - 0.5) * 3, (y < 1 ? 1 : -1) * Math.random() * 2, (Math.random() - 0.5) * 3, 0.04, 0.25);
          fx.dust(at.x, at.y, at.z, 0, y < 1 ? 0.3 : -0.2, 0, 0.18, 0.8, 0.6, 0.58, 0.55, 0.4, 1.8);
        }
      }
      panelGroup.remove(v.mesh); v.dispose(); deploys.delete(id);
    }
  }
  function impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, kind: keyof typeof DUST, hard: boolean) {
    const c = DUST[kind], l = bake.probe(x, z), b = 0.35 + (l[0] + l[1] + l[2]) / 3;
    const n = fx.density < 1 ? 1 : 2;
    for (let i = 0; i < n; i++) fx.dust(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, nx * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.6, ny * (0.6 + Math.random()) + Math.random() * 0.5, nz * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.6, 0.16 + Math.random() * 0.12, 0.5 + Math.random() * 0.4, c[0] * b, c[1] * b, c[2] * b, 0.5);
    if (hard) {
      if (kind === 'metal') {
        // Steel stops rounds: a bright scar and a spray of sparks, never a hole.
        fx.scar(x, y, z, nx, ny, nz, 0.045 + Math.random() * 0.035);
        for (let i = 0; i < (fx.density < 1 ? 3 : 6); i++) fx.spark(x, y, z, nx * 3 + (Math.random() - 0.5) * 4, ny * 3 + Math.random() * 3, nz * 3 + (Math.random() - 0.5) * 4);
      } else fx.hole(x, y, z, nx, ny, nz, 0.07 + Math.random() * 0.04);
    }
  }

  return {
    ear, stats,
    handle(events, m, self) {
      viewmodel.handle(events, m, self);
      fighters.handle?.(events, m, self);
      for (const e of events) {
        switch (e.e) {
          case 'shot': {
            const def = WEAPONS[e.w], mine = e.id === self;
            lastOrigin = { x: e.x, y: e.y, z: e.z };
            let ox = e.x, oy = e.y, oz = e.z;
            const fwd = viewDir(e.yaw, e.pitch);
            if (mine) { ox += fwd.x * 0.7 + Math.cos(e.yaw) * 0.1; oy += fwd.y * 0.7 - 0.09; oz += fwd.z * 0.7 - Math.sin(e.yaw) * 0.1; }
            else if (fighters.muzzle(e.id, v3)) { ox = v3.x; oy = v3.y; oz = v3.z; fx.flash(ox, oy, oz, 0.5 + Math.random() * 0.25, 0.05); }
            const dirs = shotDirs(e.yaw, e.pitch, e.spread, def.pellets, e.seed);
            dirs.forEach((d, i) => {
              const tr = trace(m.world, e.x, e.y, e.z, d.x, d.y, d.z, 120), hx = e.x + d.x * tr.t, hy = e.y + d.y * tr.t, hz = e.z + d.z * tr.t;
              if (def.pellets === 1 || i % 2 === 0) fx.tracer(ox, oy, oz, hx, hy, hz);
              for (const sh of tr.soft) softHit(m, sh.panel, sh.cell, e.x + d.x * sh.t, e.y + d.y * sh.t, e.z + d.z * sh.t, d.x, d.y, d.z);
              if (!tr.solid) return;
              const mat = tr.panel ? 'metal' : !tr.box ? 'concrete' : tr.box.mat === 'brick' ? 'brick' : tr.box.mat === 'wood' || tr.box.mat === 'crate' || tr.box.mat === 'trim' || tr.box.mat === 'shelf' ? 'wood' : tr.box.mat === 'concrete' ? 'concrete' : tr.box.mat === 'plaster' ? 'wall' : 'metal';
              // The simulation stops a round at a reinforced panel's centre plane; the steel face the shooter sees is
              // in front of that (plate half-thickness plus its folds).
              const lift = tr.panel ? 0.12 : 0;
              impact(hx + tr.nx * lift, hy + tr.ny * lift, hz + tr.nz * lift, tr.nx, tr.ny, tr.nz, mat, true);
            });
            break;
          }
          case 'cells': {
            const panel = m.world.panels[e.p];
            if (!panel) break;
            for (const c of e.c) fx.clearHoles(e.p * 4096 + c);
            if (panel.kind === 'wall') chipRim(panel, e.c, e.cause === 1 ? 1 : 2, e.cause === 1);
            const wood = panel.kind !== 'wall', max = e.cause === 1 ? 46 : 10, stride = Math.max(1, Math.ceil(e.c.length / max));
            const src = lastOrigin, side = (panel.axis === 'x' ? src.z : src.x) < panel.pos ? 1 : -1;
            for (let i = 0; i < e.c.length; i += stride) {
              const at = cellCenter(panel, e.c[i]), l = bake.probe(at.x, at.z), b = 0.3 + (l[0] + l[1] + l[2]) / 3;
              const lowWood = wood || at.y < 1.1, c = lowWood ? [0.5, 0.36, 0.22] : [0.85, 0.82, 0.74];
              const speed = e.cause === 1 ? 3 + Math.random() * 6 : 1 + Math.random() * 2.5, nx = panel.axis === 'z' ? side : 0, nz = panel.axis === 'x' ? side : 0;
              const count = e.cause === 1 ? 1 : 2;
              // Board fragments: thin, flat pieces that come to rest and stay; a broken barricade also leaves long
              // splintered shards of plank.
              if (wood && k0(i)) fx.debris(at.x, at.y, at.z, nx * speed * 0.6 + (Math.random() - 0.5), Math.random() * 1.5, nz * speed * 0.6 + (Math.random() - 0.5), 0.16 + Math.random() * 0.1, 0.55 * b, 0.4 * b, 0.26 * b, true, 0.1);
              for (let k = 0; k < count; k++) fx.debris(at.x, at.y, at.z, nx * speed + (Math.random() - 0.5) * 2, Math.random() * 2.5, nz * speed + (Math.random() - 0.5) * 2, 0.05 + Math.random() * (e.cause === 1 ? 0.13 : 0.07), c[0] * b, c[1] * b, c[2] * b, true, wood ? 0.3 : 0.12);
              if (i % (stride * 2) === 0) impact(at.x, at.y, at.z, nx, 0, nz, wood ? 'wood' : 'wall', false);
            }
            break;
          }
          case 'boom': {
            lastOrigin = { x: e.x, y: e.y, z: e.z };
            const power = e.kind === 'impact' ? 0.7 : e.kind === 'charge' ? 1.1 : 1.25, l = bake.probe(e.x, e.z);
            fx.blast(e.x, e.y, e.z, power, l, e.kind === 'impact' ? 'impact' : e.kind === 'charge' ? 'charge' : 'frag');
            const d = Math.hypot(e.x - ear.x, e.z - ear.z);
            if (d < 16) exposure = Math.max(exposure, (1 - d / 16) * 1.1);
            break;
          }
          case 'hit': {
            const f = fighters.pose(e.on), p = m.players[e.on];
            if (!f || !p) break;
            const y = e.head ? 1.6 - f.crouch * 0.6 : 1.1 - f.crouch * 0.4;
            for (let i = 0; i < 3; i++) fx.dust(f.x + (Math.random() - 0.5) * 0.2, y + (Math.random() - 0.5) * 0.2, f.z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 1.5, Math.random(), (Math.random() - 0.5) * 1.5, 0.12, 0.35, 0.5, 0.06, 0.05, 0.6, 1.2, 2);
            break;
          }
          case 'panel': {
            const panel = m.world.panels[e.p];
            if (!panel) break;
            const c = panelPoint(panel, panel.u0 + panel.cols * CELL / 2, panel.y0 + panel.rows * CELL / 2);
            for (let i = 0; i < 6; i++) fx.dust(c.x + (Math.random() - 0.5) * 1.5, c.y + (Math.random() - 0.5) * 1.5, c.z + (Math.random() - 0.5) * 1.5, (Math.random() - 0.5), Math.random() * 0.5, (Math.random() - 0.5), 0.3, 0.8, 0.6, 0.58, 0.52, 0.35);
            break;
          }
          case 'phase': if (e.phase === 'prep') { fx.clear(); fighters.reset(); } break;
          case 'spawn': fighters.reset(e.at.map(([id]) => id)); break;
        }
      }
    },
    render(view) {
      const cpuStart = performance.now();
      const dt = Math.min(0.1, view.dt);
      // Resolution changes resize (and so clear) the canvas: do them before drawing, never after, or the frame
      // just drawn is lost and the screen flashes empty.
      if (dt > 0) adapt(view.dt);
      // Reflection probes are captured one room per frame after the art arrives, so no single frame stalls.
      art?.cull(camera.position);
      if (art && !probesDone) { const t = performance.now(); probesDone = art.captureNext(renderer, artScene); if (/artdbg=[^&]*timing/.test(location.search)) console.warn(`art timing: probe ${(performance.now() - t).toFixed(0)} ms`); }
      time += dt;
      if (view.m.world !== world) bind(view.m.world);
      for (const p of panels) p.sync();
      updateDeploys(view.m);
      fighters.update(view);
      place(view);
      updateGadgets(view.m, dt);
      viewmodel.update(view, time);
      // `?artdbg=fxfast` ages effects 25 times faster, for evidence renders of how smoke and dust clear.
      fx.update(fxFast ? dt * 25 : dt, height * (window.devicePixelRatio || 1) * scale, camera.fov);
      exposure = Math.max(0, exposure - dt * 3.5);
      renderer.toneMappingExposure = 1.02 + (view.reduced ? 0 : exposure);
      const graded = post.begin();
      renderer.clear();
      let calls = 0, tris = 0;
      if (art) { renderer.render(artScene, camera); calls = renderer.info.render.calls; tris = renderer.info.render.triangles; }
      renderer.render(scene, camera);
      stats.calls = calls + renderer.info.render.calls; stats.triangles = tris + renderer.info.render.triangles;
      stats.calls += viewmodel.render();
      if (graded) post.end(renderer.toneMappingExposure);
      // Script time on the main thread for this frame (command submission included, GPU work not), smoothed.
      stats.cpu = +((stats.cpu ?? 0) * 0.9 + (performance.now() - cpuStart) * 0.1).toFixed(3);
      stats.programs = renderer.info.programs?.length ?? 0; stats.textures = renderer.info.memory.textures; stats.geometries = renderer.info.memory.geometries;
      stats.post = graded ? post.tier : 'off'; stats.art = art ? (art.envReady ? 'env' : 'noenv') : 'none';
    },
    resize(w, h) {
      width = Math.max(1, Math.round(w)); height = Math.max(1, Math.round(h));
      camera.aspect = width / height; camera.updateProjectionMatrix(); viewmodel.resize(camera.aspect);
      applySize();
    },
    setQuality(q) {
      quality = q; const d = QUALITIES[q];
      scale = Math.max(d.min, Math.min(d.max, q === 'auto' ? scale : d.max)); slow = fast = 0; fx.density = d.density;
      post.setTier(/[?&]post=off\b/.test(location.search) ? 'off' : postTier(q));
      applySize();
    },
    project(x, y, z) {
      v3.set(x, y, z).project(camera);
      return { x: v3.x * 0.5 + 0.5, y: 0.5 - v3.y * 0.5, front: v3.z < 1 && v3.z > -1 };
    },
    dispose() {
      disposed = true;
      art?.dispose();
      post.dispose();
      for (const p of panels) p.dispose();
      fighters.dispose(); viewmodel.dispose();
      fx.dispose();
      scene.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose(); });
      for (const m of Object.values(materials)) m.dispose();
      for (const t of [...Object.values(textures), skyTex, sunTex, ringTex, ...siteTex]) t.dispose();
      for (const m of [lambert, led, kitMat, ...kitMats, devMat, devScreen, devBar, ...devLeds, devGlow.material, devPool.material]) m.dispose();
      screenTex.dispose(); (devGlow.material as THREE.SpriteMaterial).map?.dispose(); (devPool.material as THREE.MeshBasicMaterial).map?.dispose();
      renderer.dispose();
    },
  };
}

