// Reproduction of the read-only audit's inline model probe. Run from /workspace/Qcc-games-.
// /tmp/neon-review-model.mjs is the exact checkpoint model transpiled with TypeScript.
const m = await import('/tmp/neon-review-model.mjs');
for (const seed of [1, 2, 42]) {
  const s = m.createArena(seed); s.phase = 'running'; let invalid = null;
  for (let i = 0; i < 7200 && s.phase === 'running'; i++) {
    m.stepArena(s, { angle: i * .04 });
    if (i % 60 === 0 && !m.restoreArena(s)) { invalid = i; break; }
  }
  console.log({ seed, ticks: s.ticks, phase: s.phase, invalid, defeated: s.defeated,
    mass: s.snakes[0].mass, bytes: JSON.stringify(s).length });
}
