// Builds the owner's listening files from a sound-lab render (tests/games/breachline/audio-lab.ts output).
// Usage: node tests/games/breachline/audio-listen.mjs <labDir> <outDir> <set>
//   set "phase1": scenes (stereo) plus "rooms" and "walls" comparisons (mono), 16-bit 22.05 kHz.
//   set "decision" <name>: rifle and shotgun four ways, then a rifle burst (the plan A / plan B pair).
//   set "phase3": footsteps by floor and pace, impacts by material, glass, set pieces, bodies, reinforcement, breach.
//   set "round": the one-minute round, stereo.
//   set "phase2": each gun four ways (own shot indoors, outdoors; someone else's at 10 m; at 60 m), automatic fire, reloads.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [lab, out, set = 'phase1'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const wav = n => join(lab, 'wav', `${n}.wav`);
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const single = (name, file, stereo) => ff(['-i', wav(name), '-ac', stereo ? '2' : '1', '-ar', '22050', '-c:a', 'pcm_s16le', join(out, file)]);
/** Several renders one after another, each followed by a short gap. */
const chain = (names, file) => ff([...names.flatMap(n => ['-i', wav(n)]), '-filter_complex',
  names.map((_, i) => `[${i}]aformat=channel_layouts=mono,apad=pad_dur=0.35[a${i}]`).join(';') + ';' + names.map((_, i) => `[a${i}]`).join('') + `concat=n=${names.length}:v=0:a=1`,
  '-ar', '22050', '-c:a', 'pcm_s16le', join(out, file)]);

const files = [];
if (set === 'phase1') {
  single('scene-corridor', 'p1-corridor-firefight.wav', true); files.push('p1-corridor-firefight.wav');
  single('scene-breach', 'p1-breach.wav', true); files.push('p1-breach.wav');
  chain(['shot-ar-fp-soft', 'shot-ar-fp-in', 'shot-ar-fp-corridor', 'shot-ar-fp-out'], 'p1-rooms.wav'); files.push('p1-rooms.wav');
  chain(['shot-ar-12m-block0', 'shot-ar-12m-block1', 'shot-ar-12m-block3', 'shot-ar-12m-block4'], 'p1-walls.wav'); files.push('p1-walls.wav');
}
if (set === 'phase2') {
  for (const w of ['ar', 'carbine', 'smg', 'shotgun', 'dmr', 'pistol']) {
    chain([`shot-${w}-fp-in`, `shot-${w}-fp-out`, `shot-${w}-10m-in`, `shot-${w}-60m-out`], `p2-gun-${w}.wav`); files.push(`p2-gun-${w}.wav`);
  }
  chain(['auto-ar-fp', 'auto-smg-fp'], 'p2-automatic.wav'); files.push('p2-automatic.wav');
  chain(['reload-ar', 'reload-ar-empty', 'reload-shotgun-empty', 'reload-pistol-empty'], 'p2-reloads.wav'); files.push('p2-reloads.wav');
}
if (set === 'phase3') {
  chain(['step-asphalt', 'step-grass', 'step-slab', 'step-tile', 'step-lino', 'step-carpet', 'step-planks', 'step-raised', 'step-check'], 'p3-footsteps-by-floor.wav'); files.push('p3-footsteps-by-floor.wav');
  chain(['step-tile-crouch', 'step-tile', 'step-tile-sprint'], 'p3-crouch-walk-sprint.wav'); files.push('p3-crouch-walk-sprint.wav');
  single('impacts', 'p3-impacts.wav', false); files.push('p3-impacts.wav');
  chain(['glass', 'breaks'], 'p3-glass-and-breaks.wav'); files.push('p3-glass-and-breaks.wav');
  chain(['body', 'reinforce', 'crumble-wood-big'], 'p3-bodies-reinforcement-barricade.wav'); files.push('p3-bodies-reinforcement-barricade.wav');
  single('scene-breach', 'p3-breach.wav', true); files.push('p3-breach.wav');
}
if (set === 'decision') {
  // The owner's A/B: rifle and shotgun four ways each, then a two-second rifle burst. File name from argv[5].
  const name = process.argv[5] || 'decision.wav';
  chain(['shot-ar-fp-in', 'shot-ar-fp-out', 'shot-ar-10m-in', 'shot-ar-60m-out', 'shot-shotgun-fp-in', 'shot-shotgun-fp-out', 'shot-shotgun-10m-in', 'shot-shotgun-60m-out', 'auto-ar-fp'], name); files.push(name);
}
if (set === 'guns') {
  // The owner's set after step 1 (route A): each gun four ways, then a burst per automatic weapon.
  for (const w of ['ar', 'carbine', 'smg', 'shotgun', 'dmr', 'pistol']) { chain([`shot-${w}-fp-in`, `shot-${w}-fp-out`, `shot-${w}-10m-in`, `shot-${w}-60m-out`], `a1-gun-${w}.wav`); files.push(`a1-gun-${w}.wav`); }
  chain(['auto-ar-fp', 'auto-carbine-fp', 'auto-smg-fp'], 'a1-automatic.wav'); files.push('a1-automatic.wav');
}
if (set === 'reloads') {
  // The owner's reload set: every reload, tactical then empty, weapon by weapon; then bursts ending in real casings.
  const p = process.argv[5] || 'a2';
  for (const w of ['ar', 'carbine', 'smg', 'shotgun', 'dmr', 'pistol']) { chain([`reload-${w}`, `reload-${w}-empty`], `${p}-reload-${w}.wav`); files.push(`${p}-reload-${w}.wav`); }
  if (process.argv[5]) { chain(['auto-ar-fp', 'auto-carbine-fp', 'auto-smg-fp'], `${p}-automatic-casings.wav`); files.push(`${p}-automatic-casings.wav`); }
}
if (set === 'foley') {
  // Phase 3 on real sources: footsteps by floor, crouch/walk/sprint, impacts by material, glass and set pieces,
  // bodies and hits with reinforcement, then the breach scene.
  chain(['step-asphalt', 'step-grass', 'step-slab', 'step-tile', 'step-lino', 'step-carpet', 'step-planks', 'step-raised', 'step-check'], 'b3-footsteps-by-floor.wav'); files.push('b3-footsteps-by-floor.wav');
  chain(['step-tile-crouch', 'step-tile', 'step-tile-sprint'], 'b3-crouch-walk-sprint.wav'); files.push('b3-crouch-walk-sprint.wav');
  single('impacts', 'b3-impacts.wav', false); files.push('b3-impacts.wav');
  chain(['glass', 'breaks'], 'b3-glass-and-breaks.wav'); files.push('b3-glass-and-breaks.wav');
  chain(['body', 'reinforce'], 'b3-bodies-and-reinforcement.wav'); files.push('b3-bodies-and-reinforcement.wav');
  single('scene-breach', 'b3-breach.wav', true); files.push('b3-breach.wav');
}
if (set === 'round') {
  // One round in a minute, everything together, in stereo.
  single('round-in-sound', 'c2-round-in-sound.wav', true); files.push('c2-round-in-sound.wav');
}
let total = 0;
for (const f of files) { const b = statSync(join(out, f)).size; total += b; console.log(`${f} ${(b / 1024).toFixed(0)} KB`); }
console.log(`total ${(total / 1048576).toFixed(2)} MB`);
