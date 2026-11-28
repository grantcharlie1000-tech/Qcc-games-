import { CS, PAD_VOLUME } from '../../games/blockcraft/engine/constants';
import type { ChunkData, ChunkMesh } from '../../games/blockcraft/engine/contracts';
import { meshChunk } from '../../games/blockcraft/render/mesher';
import { createTerrain } from '../../games/blockcraft/world/terrain';
import * as THREE from 'three';
import { glCanvas, snapshotFromGlStats } from '../measure';
import type { Layout } from '../types';

/** Floor view distance is 2 chunks: a 5×5 window, meshed with its 3×3 neighbourhood. */
const RADIUS = 2;
let renderer: THREE.WebGLRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

function neighbourhood(chunks: Map<string, ChunkData>, cx: number, cz: number): ChunkData[] {
  const out: ChunkData[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) out.push(chunks.get(`${cx + dx},${cz + dz}`)!);
  return out;
}

function partMesh(part: ChunkMesh['opaque'], material: THREE.Material): THREE.Mesh | null {
  if (part.quads <= 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(part.quads * 12), 3));
  const index = new Uint32Array(part.quads * 6);
  for (let quad = 0; quad < part.quads; quad++) {
    const vertex = quad * 4;
    const offset = quad * 6;
    index[offset] = vertex; index[offset + 1] = vertex + 1; index[offset + 2] = vertex + 2;
    index[offset + 3] = vertex + 2; index[offset + 4] = vertex + 1; index[offset + 5] = vertex + 3;
  }
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return new THREE.Mesh(geometry, material);
}

function ensure(layout: Layout): void {
  if (renderer) return;
  const terrain = createTerrain(1);
  const chunks = new Map<string, ChunkData>();
  for (let cz = -RADIUS - 1; cz <= RADIUS + 1; cz++) for (let cx = -RADIUS - 1; cx <= RADIUS + 1; cx++) {
    const chunk = terrain.generate(cx, cz);
    (chunk as ChunkData & { cx: number; cz: number }).cx = cx;
    (chunk as ChunkData & { cx: number; cz: number }).cz = cz;
    chunks.set(`${cx},${cz}`, chunk);
  }
  const light = new Uint8Array(PAD_VOLUME);
  light.fill(0xf0);
  scene = new THREE.Scene();
  const opaque = new THREE.MeshBasicMaterial();
  const cutout = new THREE.MeshBasicMaterial();
  const water = new THREE.MeshBasicMaterial({ transparent: true });
  let drawn = 0;
  for (let cz = -RADIUS; cz <= RADIUS; cz++) for (let cx = -RADIUS; cx <= RADIUS; cx++) {
    const mesh = meshChunk(neighbourhood(chunks, cx, cz), light);
    for (const [part, material] of [[mesh.opaque, opaque], [mesh.cutout, cutout], [mesh.translucent, water]] as const) {
      const node = partMesh(part, material);
      if (!node) continue;
      node.position.set(cx * CS, 0, cz * CS);
      scene.add(node);
      drawn += 1;
    }
  }
  if (drawn <= 0) throw new Error('blockcraft meshed nothing');
  canvas = glCanvas(layout.cssWidth, layout.cssHeight);
  renderer = new THREE.WebGLRenderer({ canvas });
  camera = new THREE.PerspectiveCamera(70, layout.cssWidth / layout.cssHeight, 0.1, 500);
  camera.position.set(8, 40, 24);
  camera.lookAt(0, 20, 0);
}

export const collector = {
  id: 'blockcraft',
  group: 'heavy-sim' as const,
  collect(layout: Layout) {
    ensure(layout);
    renderer!.setSize(layout.cssWidth, layout.cssHeight);
    camera!.aspect = layout.cssWidth / layout.cssHeight;
    camera!.updateProjectionMatrix();
    renderer!.render(scene!, camera!);
    return snapshotFromGlStats({ calls: renderer!.info.render.calls, triangles: renderer!.info.render.triangles, width: canvas!.width, height: canvas!.height });
  },
};
