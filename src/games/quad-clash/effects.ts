/** Pooled visual effects: bullet tracers, sparks and dust, smoke, explosion flashes and report-card confetti.
 * Everything is allocated once per mount; nothing is created per shot. */
import * as THREE from 'three';

const MAX_PARTICLES = 600;
const MAX_TRACERS = 40;
const MAX_CONFETTI = 360;
const MAX_BLASTS = 6;

export interface Effects {
  readonly group: THREE.Group;
  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number): void;
  sparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, color: number, count: number, speed?: number): void;
  smoke(x: number, y: number, z: number, count: number, size?: number): void;
  blast(x: number, y: number, z: number, r: number): void;
  confetti(x: number, y: number, z: number, color: number, count: number): void;
  update(dt: number, reduced: boolean): void;
  /** Pixels per metre at one metre away: viewport height / (2 tan(fov / 2)), in device pixels. */
  setScale(pixelsPerMetre: number): void;
  clear(): void;
  dispose(): void;
}

export function createEffects(dot: THREE.Texture): Effects {
  const group = new THREE.Group();

  // ---- Particles: one Points cloud with per-particle colour and size ----
  const pos = new Float32Array(MAX_PARTICLES * 3), col = new Float32Array(MAX_PARTICLES * 3), size = new Float32Array(MAX_PARTICLES), alpha = new Float32Array(MAX_PARTICLES);
  const vel = new Float32Array(MAX_PARTICLES * 3), life = new Float32Array(MAX_PARTICLES), maxLife = new Float32Array(MAX_PARTICLES), grav = new Float32Array(MAX_PARTICLES), grow = new Float32Array(MAX_PARTICLES), base = new Float32Array(MAX_PARTICLES * 3);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { map: { value: dot }, scale: { value: 600 } },
    vertexShader: 'attribute float size; attribute float alpha; varying vec3 vColor; varying float vAlpha; uniform float scale; void main(){ vColor=color; vAlpha=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform sampler2D map; varying vec3 vColor; varying float vAlpha; void main(){ vec4 t=texture2D(map,gl_PointCoord); float a=t.a*vAlpha; if(a<0.02) discard; gl_FragColor=vec4(vColor,a); }',
    vertexColors: true, transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(pgeo, pmat);
  points.frustumCulled = false;
  group.add(points);
  let pNext = 0;
  function emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: THREE.Color, s: number, l: number, g: number, gr: number) {
    const i = pNext; pNext = (pNext + 1) % MAX_PARTICLES;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    base[i * 3] = c.r; base[i * 3 + 1] = c.g; base[i * 3 + 2] = c.b;
    size[i] = s; life[i] = l; maxLife[i] = l; grav[i] = g; grow[i] = gr;
  }

  // ---- Tracers: thin additive boxes stretched between two points ----
  const tgeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
  const tracers: { mesh: THREE.Mesh; life: number }[] = [];
  for (let i = 0; i < MAX_TRACERS; i++) {
    const mesh = new THREE.Mesh(tgeo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.visible = false; mesh.frustumCulled = false;
    group.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tNext = 0;

  // ---- Explosion flashes ----
  const bgeo = new THREE.SphereGeometry(1, 20, 14);
  const blasts: { mesh: THREE.Mesh; life: number; r: number }[] = [];
  for (let i = 0; i < MAX_BLASTS; i++) {
    const mesh = new THREE.Mesh(bgeo, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.8, depthWrite: false }));
    mesh.visible = false;
    group.add(mesh);
    blasts.push({ mesh, life: 0, r: 1 });
  }
  let bNext = 0;

  // ---- Confetti: paper squares that flutter down ----
  const cgeo = new THREE.PlaneGeometry(0.11, 0.08);
  const cmat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const conf = new THREE.InstancedMesh(cgeo, cmat, MAX_CONFETTI);
  conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  conf.frustumCulled = false;
  const cState = new Float32Array(MAX_CONFETTI * 10); // x y z vx vy vz rx ry spin life
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX_CONFETTI; i++) { conf.setMatrixAt(i, zero); conf.setColorAt(i, new THREE.Color(1, 1, 1)); }
  group.add(conf);
  let cNext = 0;
  const color = new THREE.Color();

  return {
    group,
    tracer(ax, ay, az, bx, by, bz, c) {
      const t = tracers[tNext]; tNext = (tNext + 1) % MAX_TRACERS;
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      if (len < 0.5) return;
      t.mesh.position.set(ax, ay, az);
      t.mesh.lookAt(bx, by, bz);
      t.mesh.scale.set(0.025, 0.025, len);
      (t.mesh.material as THREE.MeshBasicMaterial).color.setHex(c);
      t.mesh.visible = true; t.life = 0.07;
    },
    sparks(x, y, z, nx, ny, nz, c, count, speed = 4) {
      color.setHex(c);
      for (let i = 0; i < count; i++) {
        const rx = (Math.random() - 0.5) * 2, ry = (Math.random() - 0.5) * 2, rz = (Math.random() - 0.5) * 2;
        emit(x, y, z, (nx + rx * 0.7) * speed, (ny + ry * 0.7 + 0.4) * speed, (nz + rz * 0.7) * speed, color, 0.035 + Math.random() * 0.03, 0.25 + Math.random() * 0.25, 9, 0);
      }
    },
    smoke(x, y, z, count, s = 0.5) {
      for (let i = 0; i < count; i++) {
        const v = 0.55 + Math.random() * 0.25;
        color.setRGB(v, v, v);
        emit(x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8, color, s * (0.6 + Math.random() * 0.6), 0.8 + Math.random() * 0.8, -0.3, 0.9);
      }
    },
    blast(x, y, z, r) {
      const b = blasts[bNext]; bNext = (bNext + 1) % MAX_BLASTS;
      b.mesh.position.set(x, y, z); b.r = r; b.life = 0.35; b.mesh.visible = true;
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, s = 4 + Math.random() * 7;
        color.setHSL(0.06 + Math.random() * 0.06, 1, 0.55 + Math.random() * 0.2);
        emit(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s, Math.sin(a) * Math.cos(e) * s, color, 0.18 + Math.random() * 0.15, 0.35 + Math.random() * 0.3, 6, 0);
      }
      this.smoke(x, y, z, 16, 1.4);
    },
    confetti(x, y, z, c, count) {
      for (let k = 0; k < count; k++) {
        const i = cNext; cNext = (cNext + 1) % MAX_CONFETTI;
        const o = i * 10;
        cState[o] = x + (Math.random() - 0.5) * 0.5; cState[o + 1] = y + Math.random() * 0.8; cState[o + 2] = z + (Math.random() - 0.5) * 0.5;
        cState[o + 3] = (Math.random() - 0.5) * 5; cState[o + 4] = 2 + Math.random() * 4; cState[o + 5] = (Math.random() - 0.5) * 5;
        cState[o + 6] = Math.random() * 6; cState[o + 7] = Math.random() * 6; cState[o + 8] = 4 + Math.random() * 8; cState[o + 9] = 2.2 + Math.random() * 1.2;
        const pick = Math.random();
        color.setHex(pick < 0.45 ? c : pick < 0.75 ? 0xffffff : pick < 0.9 ? 0xf2b733 : 0x1d2f5c);
        conf.setColorAt(i, color);
      }
      if (conf.instanceColor) conf.instanceColor.needsUpdate = true;
    },
    update(dt, reduced) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (life[i] <= 0) { size[i] = 0; continue; }
        life[i] -= dt;
        vel[i * 3 + 1] -= grav[i] * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.02) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.3; vel[i * 3] *= 0.6; vel[i * 3 + 2] *= 0.6; }
        const k = Math.max(0, life[i] / maxLife[i]);
        size[i] += grow[i] * dt;
        col[i * 3] = base[i * 3]; col[i * 3 + 1] = base[i * 3 + 1]; col[i * 3 + 2] = base[i * 3 + 2];
        alpha[i] = Math.min(1, k * 1.6);
        if (life[i] <= 0) size[i] = 0;
      }
      pgeo.attributes.position.needsUpdate = true; pgeo.attributes.color.needsUpdate = true; pgeo.attributes.size.needsUpdate = true; pgeo.attributes.alpha.needsUpdate = true;
      for (const t of tracers) if (t.life > 0) { t.life -= dt; const m = t.mesh.material as THREE.MeshBasicMaterial; m.opacity = Math.max(0, t.life / 0.07) * 0.9; if (t.life <= 0) t.mesh.visible = false; }
      for (const b of blasts) if (b.life > 0) {
        b.life -= dt;
        const k = 1 - Math.max(0, b.life) / 0.35;
        b.mesh.scale.setScalar(b.r * (reduced ? 0.7 : 0.3 + k * 0.8));
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.75;
        if (b.life <= 0) b.mesh.visible = false;
      }
      let any = false;
      for (let i = 0; i < MAX_CONFETTI; i++) {
        const o = i * 10;
        if (cState[o + 9] <= 0) continue;
        any = true;
        cState[o + 9] -= dt;
        cState[o + 4] -= 6 * dt;
        cState[o + 3] *= 1 - 1.5 * dt; cState[o + 5] *= 1 - 1.5 * dt;
        if (cState[o + 4] < -1.2) cState[o + 4] = -1.2; // paper flutters, it does not plummet
        cState[o] += cState[o + 3] * dt; cState[o + 1] += cState[o + 4] * dt; cState[o + 2] += cState[o + 5] * dt;
        if (cState[o + 1] < 0.02) { cState[o + 1] = 0.02; cState[o + 3] = cState[o + 5] = 0; cState[o + 8] = 0; }
        cState[o + 6] += cState[o + 8] * dt; cState[o + 7] += cState[o + 8] * 0.7 * dt;
        if (cState[o + 9] <= 0) { conf.setMatrixAt(i, zero); continue; }
        tmpE.set(cState[o + 6], cState[o + 7], 0); tmpQ.setFromEuler(tmpE); tmpV.set(cState[o], cState[o + 1], cState[o + 2]);
        tmpS.setScalar(Math.min(1, cState[o + 9] * 2));
        conf.setMatrixAt(i, tmpM.compose(tmpV, tmpQ, tmpS));
      }
      if (any) conf.instanceMatrix.needsUpdate = true;
    },
    setScale(ppm) { pmat.uniforms.scale.value = ppm; },
    clear() {
      life.fill(0); size.fill(0);
      for (const t of tracers) { t.life = 0; t.mesh.visible = false; }
      for (const b of blasts) { b.life = 0; b.mesh.visible = false; }
      for (let i = 0; i < MAX_CONFETTI; i++) { cState[i * 10 + 9] = 0; conf.setMatrixAt(i, zero); }
      conf.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      pgeo.dispose(); pmat.dispose(); tgeo.dispose(); bgeo.dispose(); cgeo.dispose(); cmat.dispose(); conf.dispose();
      for (const t of tracers) (t.mesh.material as THREE.Material).dispose();
      for (const b of blasts) (b.mesh.material as THREE.Material).dispose();
    },
  };
}
