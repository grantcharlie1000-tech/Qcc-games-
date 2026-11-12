#!/usr/bin/env node
/** Calibrates the ruler: four plain scenes timed in the same browser and renderer as the game's measurements, so a
 * software millisecond can be related to a real GPU. Each figure is the median of five runs of three frames forced to
 * finish (a one-pixel read). 1280 x 720.
 *   node scripts/breachline-assets/calibrate.mjs [--url http://127.0.0.1:5199]
 */
import { chromium } from 'playwright';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5199');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(`${url}/favicon.svg`).catch(() => {});
const out = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720; document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false }), gl = renderer.getContext(), px = new Uint8Array(4);
  renderer.setSize(1280, 720, false);
  const camera = new THREE.PerspectiveCamera(70, 1280 / 720, 0.1, 100); camera.position.set(0, 0, 3);
  const data = new Uint8Array(1024 * 1024 * 4); for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 24;
  const tex = new THREE.DataTexture(data, 1024, 1024); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const scenes = {};
  scenes.clear = new THREE.Scene();
  { const s = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { map: { value: tex } }, vertexShader: 'varying vec2 v; void main(){ v = uv * 4.0; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D map; varying vec2 v; void main(){ gl_FragColor = texture2D(map, v); }' })); q.frustumCulled = false; s.add(q); scenes.fullscreenTexture = s; }
  { const s = new THREE.Scene(), g = new THREE.BoxGeometry(0.02, 0.02, 0.02); for (let i = 0; i < 250; i++) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: i * 997 })); m.position.set((i % 25) / 10 - 1.2, Math.floor(i / 25) / 10 - 0.5, 0); s.add(m); } scenes.draws250 = s; }
  { const s = new THREE.Scene(), g = new THREE.SphereGeometry(0.3, 500, 250), m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x808080 })); s.add(m); scenes.triangles250k = s; }
  const time = s => { renderer.render(s, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t0 = performance.now(); for (let k = 0; k < 3; k++) { renderer.render(s, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return (performance.now() - t0) / 3; };
  const res = { cores: navigator.hardwareConcurrency, gpu: (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER); })() };
  for (const [k, s] of Object.entries(scenes)) { const runs = [0, 1, 2, 3, 4].map(() => time(s)).sort((a, b) => a - b); res[k] = { median: +runs[2].toFixed(2), runs: runs.map(v => +v.toFixed(1)) }; }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
