import { COUNTRIES } from '../../games/globle/countries';
import { LandLayer } from '../../games/globle/land';
import world from '../../games/globle/data/world.json';
import * as THREE from 'three';
import { paintProduced } from '../mount-frame';
import { glCanvas, snapshotFromGlStats } from '../measure';
import type { Layout } from '../types';

let renderer: THREE.WebGLRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
const names = new Map(COUNTRIES.map(country => [country.id, country.name]));
const guesses = world.countries.slice(0, 24);

function ensure(layout: Layout): void {
  if (renderer && canvas && scene && camera) return;
  const land = new LandLayer('#a19d91', '#4b535b');
  if (!land.buildNow()) throw new Error('globle land did not build');
  scene = new THREE.Scene();
  scene.add(land.group);
  canvas = glCanvas(layout.cssWidth, layout.cssHeight);
  renderer = new THREE.WebGLRenderer({ canvas });
  camera = new THREE.PerspectiveCamera(45, layout.cssWidth / layout.cssHeight, 0.1, 2000);
  camera.position.set(0, 0, 280);
}

export const collector = {
  id: 'globle',
  group: 'three' as const,
  collect(layout: Layout) {
    ensure(layout);
    renderer!.setSize(layout.cssWidth, layout.cssHeight);
    camera!.aspect = layout.cssWidth / layout.cssHeight;
    camera!.updateProjectionMatrix();
    renderer!.render(scene!, camera!);
    const host = document.createElement('div');
    host.style.width = `${layout.cssWidth}px`;
    host.style.height = `${layout.cssHeight}px`;
    const list = document.createElement('ol');
    list.className = 'gl-history';
    for (const country of guesses) {
      const row = document.createElement('li');
      row.className = 'gl-guess';
      row.dataset.id = country.id;
      row.textContent = names.get(country.id) ?? country.id;
      list.append(row);
    }
    host.append(list);
    document.body.append(host);
    try {
      const snap = snapshotFromGlStats({
        calls: renderer!.info.render.calls,
        triangles: renderer!.info.render.triangles,
        width: canvas!.width,
        height: canvas!.height,
      });
      snap.fillPixels += paintProduced(host, layout);
      return snap;
    } finally { host.remove(); }
  },
};
