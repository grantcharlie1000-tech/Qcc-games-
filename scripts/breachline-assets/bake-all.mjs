#!/usr/bin/env node
/** Bakes every art room in parallel, one vite-node process per room (rooms are independent). */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../../src/games/breachline/render/levelgeo.ts', import.meta.url), 'utf8');
const rooms = [...src.matchAll(/room\('[^']+', '([^']+)'\)/g)].map(m => m[1]);
const slots = Math.max(1, availableParallelism());
const queue = [...rooms], running = new Set();
const t0 = Date.now();
await new Promise((resolve, reject) => {
  const next = () => {
    if (!queue.length && !running.size) return resolve();
    while (queue.length && running.size < slots) {
      const room = queue.shift();
      const p = spawn('npx', ['vite-node', 'scripts/breachline-assets/bake.ts'], { env: { ...process.env, BAKE_ONLY: room }, stdio: ['ignore', 'pipe', 'inherit'] });
      p.stdout.on('data', d => process.stdout.write(`[${room}] ${d}`));
      running.add(p);
      p.on('exit', code => { running.delete(p); if (code) reject(new Error(`${room} bake failed (${code})`)); else next(); });
    }
  };
  next();
});
console.log(`baked ${rooms.join(', ')} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
