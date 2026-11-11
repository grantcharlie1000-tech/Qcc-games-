/** The picture. A baked-light level, destructible panel meshes, fighters, the weapon in hand and pooled effects,
 * drawn with unlit materials so integrated graphics can keep up. Resolution adapts to hold the frame rate. */
import * as THREE from 'three';
import { CELL, WEAPONS } from './config';
import { Effects } from './effects';
import { createBake, SUN, type Bake } from './lightbake';
import { PanelView, buildLevel, type PanelMaterials } from './levelmesh';
import { MAP } from './map';
import { loadArtWorld, type ArtWorld } from './render/artworld';
import { boxes, chargeParts, deviceParts } from './models';
import { createFighters, createViewmodel, type HeroLighting } from './render/hero';
import { createPost, type PostTier } from './render/post';
import { shotDirs, weaponIdOf, type Match, type SimEvent } from './state';
import { makeSprite, makeTextures, type TexId } from './textures';
import { cellCenter, eyeOf, panelPoint, trace, viewDir, type World } from './world';

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
  readonly stats: { calls: number; triangles: number; scale: number; level: number; post?: string; art?: string; cpu?: number; programs?: number; textures?: number; geometries?: number };
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
  artScene.fog = scene.fog;
  let art: ArtWorld | null = null, disposed = false, probesDone = true;
  const panelMats: PanelMaterials = { wall: materials.drywall, core: materials.core, planks: materials.planks, plate: materials.plate };
  const panelGroup = new THREE.Group(); scene.add(panelGroup);
  let world: World | null = null, panels: PanelView[] = [];
  function bind(w: World) {
    for (const p of panels) { panelGroup.remove(p.mesh); p.dispose(); }
    world = w;
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
    }).catch(e => { console.warn('Breachline art unavailable; using the procedural look.', e); });
  }

  // ---- Sky, sun and a far skyline ----
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 4; skyCanvas.height = 256;
  const sg = skyCanvas.getContext('2d')!, grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#22335c'); grad.addColorStop(0.3, '#4f6791'); grad.addColorStop(0.44, '#b9a096'); grad.addColorStop(0.5, '#e6ad7c'); grad.addColorStop(0.53, '#8a7468'); grad.addColorStop(1, '#3d3a3e');
  sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 20, 12), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  sky.renderOrder = -10; scene.add(sky);
  const sunTex = makeSprite('puff');
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: 0xffd9a0, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, toneMapped: false }));
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
    sun: { x: SUN.x, y: SUN.y, z: SUN.z, color: [1.55, 1.12, 0.7] },
  };
  const fighters = createFighters(scene, heroLighting);
  const viewmodel = createViewmodel(renderer, heroLighting);
  const v3 = new THREE.Vector3();

  // ---- Gadgets and markers ----
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  const device = new THREE.Mesh(boxes(deviceParts()), lambert); device.visible = false; scene.add(device);
  const ringTex = makeSprite('ring');
  const ringGeo = new THREE.PlaneGeometry(1, 1); ringGeo.rotateX(-Math.PI / 2);
  const pulse = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, color: 0xff5a3c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pulse.visible = false; pulse.renderOrder = 3; scene.add(pulse);
  const led = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const chargeGeo = boxes(chargeParts()), ledGeo = new THREE.BoxGeometry(0.03, 0.03, 0.02);
  const chargeMeshes: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) { const g = new THREE.Group(), l = new THREE.Mesh(ledGeo, led); l.position.set(-0.08, -0.04, 0.05); g.add(new THREE.Mesh(chargeGeo, lambert), l); g.visible = false; scene.add(g); chargeMeshes.push(g); }
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
      const at = panelPoint(panel, c.u, c.y, c.side * 0.075);
      g.position.set(at.x, at.y, at.z);
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
      const rate = m.phase === 'planted' ? (m.t < 10 ? 4 : m.t < 20 ? 2 : 1) : 0, t = (time * rate) % 1;
      pulse.position.set(m.device.x, 0.05, m.device.z); pulse.scale.setScalar(0.6 + t * 3.2);
      (pulse.material as THREE.MeshBasicMaterial).opacity = rate ? 0.8 * (1 - t) : 0;
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
  function impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, kind: keyof typeof DUST, hard: boolean) {
    const c = DUST[kind], l = bake.probe(x, z), b = 0.35 + (l[0] + l[1] + l[2]) / 3;
    const n = fx.density < 1 ? 1 : 2;
    for (let i = 0; i < n; i++) fx.dust(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, nx * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.6, ny * (0.6 + Math.random()) + Math.random() * 0.5, nz * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.6, 0.16 + Math.random() * 0.12, 0.5 + Math.random() * 0.4, c[0] * b, c[1] * b, c[2] * b, 0.5);
    if (hard) { fx.hole(x, y, z, nx, ny, nz, 0.07 + Math.random() * 0.04); if (kind === 'metal') for (let i = 0; i < 4; i++) fx.spark(x, y, z, nx * 3 + (Math.random() - 0.5) * 4, ny * 3 + Math.random() * 3, nz * 3 + (Math.random() - 0.5) * 4); }
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
              if (!tr.solid) return;
              const mat = tr.panel ? 'metal' : !tr.box ? 'concrete' : tr.box.mat === 'brick' ? 'brick' : tr.box.mat === 'wood' || tr.box.mat === 'crate' || tr.box.mat === 'trim' || tr.box.mat === 'shelf' ? 'wood' : tr.box.mat === 'concrete' ? 'concrete' : tr.box.mat === 'plaster' ? 'wall' : 'metal';
              impact(hx, hy, hz, tr.nx, tr.ny, tr.nz, mat, true);
            });
            break;
          }
          case 'cells': {
            const panel = m.world.panels[e.p];
            if (!panel) break;
            const wood = panel.kind !== 'wall', max = e.cause === 1 ? 46 : 10, stride = Math.max(1, Math.ceil(e.c.length / max));
            const src = lastOrigin, side = (panel.axis === 'x' ? src.z : src.x) < panel.pos ? 1 : -1;
            for (let i = 0; i < e.c.length; i += stride) {
              const at = cellCenter(panel, e.c[i]), l = bake.probe(at.x, at.z), b = 0.3 + (l[0] + l[1] + l[2]) / 3;
              const lowWood = wood || at.y < 1.1, c = lowWood ? [0.5, 0.36, 0.22] : [0.85, 0.82, 0.74];
              const speed = e.cause === 1 ? 3 + Math.random() * 6 : 1 + Math.random() * 2.5, nx = panel.axis === 'z' ? side : 0, nz = panel.axis === 'x' ? side : 0;
              const count = e.cause === 1 ? 1 : 2;
              for (let k = 0; k < count; k++) fx.debris(at.x, at.y, at.z, nx * speed + (Math.random() - 0.5) * 2, Math.random() * 2.5, nz * speed + (Math.random() - 0.5) * 2, 0.05 + Math.random() * (e.cause === 1 ? 0.13 : 0.07), c[0] * b, c[1] * b, c[2] * b);
              if (i % (stride * 2) === 0) impact(at.x, at.y, at.z, nx, 0, nz, wood ? 'wood' : 'wall', false);
            }
            break;
          }
          case 'boom': {
            lastOrigin = { x: e.x, y: e.y, z: e.z };
            const power = e.kind === 'impact' ? 0.7 : e.kind === 'charge' ? 1.1 : 1.25, l = bake.probe(e.x, e.z);
            fx.blast(e.x, e.y, e.z, power, l);
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
      if (art && !probesDone) { const t = performance.now(); probesDone = art.captureNext(renderer, artScene); if (/artdbg=[^&]*timing/.test(location.search)) console.warn(`art timing: probe ${(performance.now() - t).toFixed(0)} ms`); }
      time += dt;
      if (view.m.world !== world) bind(view.m.world);
      for (const p of panels) p.sync();
      fighters.update(view);
      place(view);
      updateGadgets(view.m, dt);
      viewmodel.update(view, time);
      fx.update(dt, height * (window.devicePixelRatio || 1) * scale, camera.fov);
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
      for (const m of [lambert, led]) m.dispose();
      renderer.dispose();
    },
  };
}

