/** Quad Clash: an original first-person arena shooter set on the QCC campus. This file is the shell contract: the
 * setup menu, the fixed-step loop, input to intents, events to sound/HUD/announcements, saving and restoring. */
import type { GameContext, GameInstance, GameModule } from '../../core/types';
import { DIFFICULTIES, HOUSES, MODES, MODE_IDS, PRIMARIES, STEP, STREAKS, WEAPONS, isPrimary, type Difficulty, type ModeId, type PrimaryId } from './config';
import { MAP_IDS, getMap, isMapId, type MapId } from './map';
import { createMatch, chooseLoadout, damage, modeOf, playerWon, restore as restoreMatch, serialize as serializeMatch, spreadOf, standings, worldFor } from './sim';
import { createAi, stepWithBots, type Ai } from './bots';
import { enemies, eyeY, lookAt, viewDir, weaponOf, wrapAngle, type Intent, type Match, type SimEvent } from './state';
import { rayBox, raySphere, rayWorld } from './physics';
import { BODY, HITBOX } from './config';
import { createScene, type ClashScene, type SceneView } from './scene';
import { QUALITY, RenderPacer, isQuality, type QualityId } from './performance';
import { createHud } from './hud';
import { createInput } from './input';
import { createSfx } from './audio';
import { FLASK_ICON, UI_ICONS, WEAPON_ICONS } from './icons';
import './style.css';

const ID = 'quad-clash';
const SNAPSHOT_VERSION = 1;

interface Prefs { mode: ModeId; map: MapId; difficulty: Difficulty; primary: PrimaryId; sens: number; quality: QualityId }
const DEFAULT_PREFS: Prefs = { mode: 'brawl', map: 'campus', difficulty: 'normal', primary: 'bell', sens: 1, quality: 'potato' };
type Phase = 'menu' | 'playing' | 'over';
type Layer = 'menu' | 'over' | 'continue' | 'lost' | null;

const stat = (v: number) => `<span class="qc-bar"><i style="width:${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%"></i></span>`;
function weaponStats(id: PrimaryId) {
  const w = WEAPONS[id];
  const dps = (w.damage * w.pellets * w.burst) / w.interval;
  return { damage: Math.min(1, (w.damage * w.pellets) / 120), rate: Math.min(1, (1 / w.interval) / 14), range: Math.min(1, w.falloff[1] / 120), mobility: (w.speed - 0.85) / 0.3, dps };
}

const TEMPLATE = `<canvas class="qc-canvas" tabindex="0" aria-label="Quad Clash arena. W A S D move, mouse or arrow keys look, click or F fires, Shift aims, Space jumps, R reloads, Q swaps weapon, G throws a flask grenade."></canvas>
<div class="qc-click" hidden><button type="button" class="game-button qc-click-btn">Click to play</button><p>The mouse aims. Esc frees it and pauses.</p></div>
<div class="qc-layer">
  <section class="qc-card qc-menu" aria-labelledby="qc-menu-title">
    <header class="qc-brand"><span class="qc-crest" aria-hidden="true">Q</span><div><h2 id="qc-menu-title">Quad Clash</h2><p>Crack the competition. Kia kaha, QCC.</p></div></header>
    <fieldset class="qc-loadout"><legend>Loadout</legend>
      <div class="qc-guns"></div>
      <div class="qc-gun-info" aria-live="polite"><div class="qc-gun-head"><span class="qc-gun-art" aria-hidden="true"></span><div><b class="qc-gun-name"></b><small class="qc-gun-role"></small></div></div><p class="qc-gun-blurb"></p><div class="qc-stats"></div></div>
      <p class="qc-sidearm"><span class="qc-side-art" aria-hidden="true"></span><span>Plus the <b>Pencil Pusher</b> sidearm and Science Fair flasks.</span></p>
    </fieldset>
    <fieldset class="qc-choice qc-modes"><legend>Mode</legend></fieldset>
    <p class="qc-choice-note qc-mode-note"></p>
    <fieldset class="qc-choice qc-maps"><legend>Arena</legend></fieldset>
    <fieldset class="qc-choice qc-skills"><legend>Bots</legend></fieldset>
    <label class="qc-quality"><span>Graphics</span><select aria-label="Graphics quality"><option value="potato">Potato — 30 fps</option><option value="balanced">Balanced — 60 fps</option></select></label>
    <label class="qc-sens"><span>Look speed</span><input type="range" min="0.4" max="2.2" step="0.1" value="1"><output>1.0×</output></label>
    <div class="qc-actions"><button type="button" class="game-button qc-play"><span class="qc-play-icon" aria-hidden="true"></span>Play</button></div>
    <p class="qc-help"></p>
  </section>
  <section class="qc-card ui-glass-sheet qc-over" aria-labelledby="qc-over-title" hidden>
    <h2 id="qc-over-title" class="qc-over-title" tabindex="-1">Match over</h2>
    <p class="qc-over-sub"></p>
    <dl class="qc-over-stats"><div><dt>Place</dt><dd class="qc-o-place">1st</dd></div><div><dt>Elims</dt><dd class="qc-o-kills">0</dd></div><div><dt>Falls</dt><dd class="qc-o-deaths">0</dd></div><div><dt>Points</dt><dd class="qc-o-score">0</dd></div></dl>
    <p class="qc-over-new" hidden>New personal best!</p>
    <div class="qc-actions"><button type="button" class="game-button qc-again">Play again</button><button type="button" class="game-button secondary qc-setup">Change setup</button></div>
  </section>
  <section class="qc-card ui-glass-sheet qc-continue" aria-labelledby="qc-continue-title" hidden>
    <h2 id="qc-continue-title">Match on hold</h2>
    <p class="qc-continue-sub"></p>
    <div class="qc-actions"><button type="button" class="game-button qc-resume">Continue</button><button type="button" class="game-button secondary qc-quit">Leave match</button></div>
  </section>
  <section class="qc-card ui-glass-sheet qc-lost" aria-labelledby="qc-lost-title" hidden>
    <h2 id="qc-lost-title" tabindex="-1">Graphics interrupted</h2>
    <p>Your match is saved. Leave and reopen Quad Clash to restore the graphics.</p>
    <div class="qc-actions"><a class="game-button" href="#/collection">Back to games</a></div>
  </section>
</div>`;

function mount(container: HTMLElement, context: GameContext): GameInstance {
  const root = document.createElement('div');
  root.className = 'quad-clash';
  root.innerHTML = TEMPLATE;
  container.append(root);
  const canvas = root.querySelector<HTMLCanvasElement>('.qc-canvas')!;
  let scene: ClashScene;
  const coarse = matchMedia('(pointer: coarse)').matches;
  try { scene = createScene(canvas, { shadows: !coarse, quality: DEFAULT_PREFS.quality }); }
  catch {
    root.innerHTML = '<div class="qc-fallback" role="status"><h2>3D graphics unavailable</h2><p>Quad Clash needs WebGL. Turn on hardware acceleration in the browser settings, or try a recent browser.</p><a class="game-button" href="#/collection">Choose another game</a></div>';
    context.setStatus('This browser could not start the 3D graphics Quad Clash needs.');
    return { pause() {}, resume() {}, restart() {}, serialize: () => undefined, restore() {}, dispose() { root.remove(); } };
  }
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const abort = new AbortController(), signal = abort.signal;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => context.settings.reducedMotion || motionQuery.matches;
  const sfx = createSfx(() => context.settings.sound);
  const hud = createHud(root, signal);
  const layer = q('.qc-layer'), clickLayer = q('.qc-click');
  const cards: Record<Exclude<Layer, null>, HTMLElement> = { menu: q('.qc-menu'), over: q('.qc-over'), continue: q('.qc-continue'), lost: q('.qc-lost') };

  let prefs: Prefs = { ...DEFAULT_PREFS };
  let phase: Phase = 'menu';
  let m: Match = createMatch({ ...settingsFrom(prefs), seed: 1 });
  let ais: Ai[] = m.fighters.map(f => createAi(f.id));
  let prev = new Float32Array(m.fighters.length * 3);
  let paused = false, held = false, frozen = false, disposed = false, lost = false;
  let frameId = 0, last = 0, acc = 0, runs = 0;
  const pacer=new RenderPacer();
  let adsBlend = 0, aimName = '', aimFriendly = false, aimTick = 0;
  let reportedScore = -1, reportedLevel = '', best = Math.max(0, Math.floor(context.highScore) || 0), bestAtStart = best;
  let shown: Layer = null;
  const frameEvents: SimEvent[] = [];
  const data: Record<string, string> = {};
  const setData = (k: string, v: string) => { if (data[k] !== v) { data[k] = v; root.dataset[k] = v; } };

  function settingsFrom(p: Prefs) { return { mode: p.mode, map: p.map, difficulty: p.difficulty, primary: p.primary }; }

  const input = createInput({
    root, canvas, signal,
    playing: () => phase === 'playing' && !paused && !held && !lost && !m.over,
    canLock: () => phase === 'playing' && !paused && !held && !lost && !m.over && m.fighters[0].alive,
    sensitivity: () => prefs.sens,
    zoomScale: () => 1 / Math.pow(1 + (weaponOf(m.fighters[0]).zoom - 1) * adsBlend, 0.8),
    onPause: () => { if (context.setPaused) context.setPaused(!paused); else document.querySelector<HTMLButtonElement>('#pause-game')?.click(); },
    onUnlock: () => { if (phase === 'playing' && !paused && !m.over && context.setPaused) context.setPaused(true); },
    onLockChange: locked => { setData('locked', String(locked)); updateClickLayer(); },
    onTouchMode: () => {},
  });

  // ---- Setup menu ----
  function radios(sel: string, name: string, items: readonly { value: string; label: string; sub?: string }[], current: string, onPick: (v: string) => void) {
    const box = q(sel);
    for (const it of items) {
      const label = document.createElement('label');
      label.className = 'qc-opt';
      label.innerHTML = `<input type="radio" name="${name}" value="${it.value}"><span><b>${it.label}</b>${it.sub ? `<small>${it.sub}</small>` : ''}</span>`;
      const radio = label.querySelector('input')!;
      radio.checked = it.value === current;
      radio.addEventListener('change', () => { if (radio.checked) onPick(it.value); }, { signal });
      box.append(label);
    }
  }
  radios('.qc-modes', 'qc-mode', MODE_IDS.map(id => ({ value: id, label: MODES[id].name })), prefs.mode, v => { prefs.mode = v as ModeId; syncMenu(); });
  radios('.qc-maps', 'qc-map', MAP_IDS.map(id => ({ value: id, label: getMap(id).name })), prefs.map, v => { prefs.map = v as MapId; syncMenu(); backdrop(); });
  radios('.qc-skills', 'qc-skill', DIFFICULTIES.map(id => ({ value: id, label: id[0].toUpperCase() + id.slice(1) })), prefs.difficulty, v => { prefs.difficulty = v as Difficulty; });
  const guns = q('.qc-guns');
  for (const id of PRIMARIES) {
    const w = WEAPONS[id];
    const label = document.createElement('label');
    label.className = 'qc-gun';
    label.title = `${w.name}: ${w.role}`;
    label.innerHTML = `<input type="radio" name="qc-gun" value="${id}" aria-label="${w.name}">${WEAPON_ICONS[id]}`;
    const radio = label.querySelector('input')!;
    radio.addEventListener('change', () => { if (radio.checked) { prefs.primary = id; syncMenu(); } }, { signal });
    guns.append(label);
  }
  q('.qc-side-art').innerHTML = WEAPON_ICONS.pencil;
  q('.qc-play-icon').innerHTML = UI_ICONS.fire;
  function showGun(id: PrimaryId) {
    const w = WEAPONS[id], st = weaponStats(id);
    q('.qc-gun-art').innerHTML = WEAPON_ICONS[id];
    q('.qc-gun-name').textContent = w.name;
    q('.qc-gun-role').textContent = w.role;
    q('.qc-gun-blurb').textContent = w.blurb;
    q('.qc-stats').innerHTML = `<span>Damage</span>${stat(st.damage)}<span>Rate</span>${stat(st.rate)}<span>Range</span>${stat(st.range)}<span>Agility</span>${stat(st.mobility)}`;
  }
  const sens = q<HTMLInputElement>('.qc-sens input'), sensOut = q<HTMLOutputElement>('.qc-sens output');
  sens.addEventListener('input', () => { prefs.sens = Number(sens.value) || 1; sensOut.textContent = `${prefs.sens.toFixed(1)}×`; }, { signal });
  q('.qc-help').textContent = coarse
    ? 'Left thumb moves, right thumb looks. Hold Fire (drag it to aim while shooting), tap Aim to zoom.'
    : 'WASD move · Mouse look · Click fire · Right-click or Shift aim · Space jump · R reload · Q swap · G grenade · Tab scores · Esc pause';
  const graphics = q<HTMLSelectElement>('.qc-quality select');
  graphics.addEventListener('change',()=>{
    if(!isQuality(graphics.value))return;
    prefs.quality=graphics.value;pacer.reset();
    scene.setQuality(prefs.quality);syncMenu();draw(0);
  },{signal});
  function syncMenu() {
    for (const r of root.querySelectorAll<HTMLInputElement>('.qc-menu input[type=radio]')) {
      r.checked = (r.name === 'qc-mode' && r.value === prefs.mode) || (r.name === 'qc-map' && r.value === prefs.map) || (r.name === 'qc-skill' && r.value === prefs.difficulty) || (r.name === 'qc-gun' && r.value === prefs.primary);
    }
    graphics.value=prefs.quality;
    graphics.title=prefs.quality==='potato'?'Full detail with a 30 fps render target to save GPU work.':'The same detail with a 60 fps render target.';
    sens.value = String(prefs.sens); sensOut.textContent = `${prefs.sens.toFixed(1)}×`;
    showGun(prefs.primary);
    q('.qc-mode-note').textContent = `${MODES[prefs.mode].blurb} ${getMap(prefs.map).blurb}`;
  }
  syncMenu();

  hud.onLoadout(id => {
    if (phase !== 'playing') return;
    prefs.primary = id;
    chooseLoadout(m, m.fighters[0], id);
    syncMenu();
  });

  // ---- Lifecycle ----
  const active = () => !paused && !disposed && !lost;
  function schedule() { if (!frameId && active()) { last = 0;pacer.reset(); frameId = requestAnimationFrame(loop); } }
  function cancel() { if (frameId) cancelAnimationFrame(frameId); frameId = 0; }

  function show(next: Layer) {
    shown = next;
    layer.hidden = next === null;
    for (const [name, card] of Object.entries(cards)) card.hidden = name !== next;
    canvas.tabIndex = next === null ? 0 : -1;
    root.dataset.layer = next ?? '';
    updateClickLayer();
  }
  function updateClickLayer() {
    clickLayer.hidden = !(phase === 'playing' && shown === null && !paused && !input.touch && !input.locked && input.lockable && data.wantLock === 'true' && m.fighters[0].alive && !m.over);
  }

  function snapPrev() { m.fighters.forEach((f, i) => { prev[i * 3] = f.x; prev[i * 3 + 1] = f.y; prev[i * 3 + 2] = f.z; }); }

  function begin(seed?: number) {
    runs++;
    m = createMatch({ ...settingsFrom(prefs), seed: seed ?? (((Date.now() ^ (runs * 2654435761)) >>> 0) || 1) });
    ais = m.fighters.map(f => createAi(f.id));
    prev = new Float32Array(m.fighters.length * 3);
    snapPrev();
    scene.setMatch(m);
    hud.reset();
    input.clear();
    input.setLook(m.fighters[0].yaw, 0);
    phase = 'playing'; held = false; acc = 0; adsBlend = 0;
    bestAtStart = best;
    reportedScore = -1; report();
    show(null);
    if (!paused) sfx.bell();
    context.setStatus(`${MODES[prefs.mode].name} on ${getMap(prefs.map).name}. ${MODES[prefs.mode].blurb}`);
    context.announce(`${MODES[prefs.mode].name} started.`);
    hud.toast(MODES[prefs.mode].name, MODES[prefs.mode].blurb);
    canvas.focus({ preventScroll: true });
    if (!coarse) { setData('wantLock', 'true'); if (!paused) input.lock(); }
    // Restarted from the pause overlay: show the new arena now; play (and the mouse) wait for Resume.
    if (paused) draw(0);
    updateClickLayer();
    schedule();
  }

  /** Behind the setup menu, show the chosen arena. */
  function backdrop() {
    if (phase !== 'menu' || m.settings.map === prefs.map) return;
    m = createMatch({ ...settingsFrom(prefs), seed: 1 });
    ais = m.fighters.map(f => createAi(f.id));
    prev = new Float32Array(m.fighters.length * 3);
    snapPrev();
    scene.setMatch(m);
    if (!frameId) draw(0);
  }

  function toMenu() {
    phase = 'menu'; held = false;
    input.unlock(); input.clear();
    syncMenu();
    show('menu');
    context.setStatus('Choose a mode, an arena, the bots and your loadout, then press Play.');
    q<HTMLButtonElement>('.qc-play').focus({ preventScroll: true });
    schedule();
  }

  function report() {
    const you = m.fighters[0];
    if (you.score !== reportedScore) {
      reportedScore = you.score;
      context.setScore(you.score);
      if (you.score > best) best = you.score;
    }
    const mode = modeOf(m);
    const left = Math.max(0, Math.ceil(mode.duration - m.t));
    const level = phase === 'menu' ? 'Setup' : `${mode.short} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (level !== reportedLevel) { reportedLevel = level; context.setLevel(level); }
  }

  function intentFor(first: boolean): Intent {
    const s = input.state;
    const edges = first ? input.take() : { reload: false, swap: false, slot: -1 as const, grenade: false };
    return { mx: s.mx, mz: s.mz, jump: s.jump, fire: s.fire, ads: s.ads, reload: edges.reload, swap: edges.swap, slot: edges.slot, grenade: edges.grenade, yaw: s.yaw, pitch: s.pitch };
  }

  function loop(now: number) {
    frameId = 0;
    if (!active()) return;
    const interval = last ? (now - last) / 1000 : 0, dt = Math.min(interval, 0.1);
    last = now;
    input.frame(dt);
    if (phase === 'playing' && !held && !frozen && !m.over) advance(dt);
    // Keep input and fixed-step simulation responsive; cap GPU work independently.
    const elapsed=pacer.next(interval,phase==='menu'?15:QUALITY[prefs.quality].fps);
    if(elapsed>0)draw(elapsed);
    if (active()) frameId = requestAnimationFrame(loop);
  }

  function advance(seconds: number) {
    acc += seconds;
    let first = true;
    while (acc >= STEP - 1e-9 && !m.over) {
      acc -= STEP;
      snapPrev();
      stepWithBots(m, ais, STEP, intentFor(first));
      first = false;
      frameEvents.push(...m.events);
      m.events.length = 0;
    }
    if (m.over) acc = 0;
    if (frameEvents.length) { handleEvents(frameEvents); frameEvents.length = 0; }
    if (m.over && phase === 'playing') ended();
  }

  function handleEvents(events: SimEvent[]) {
    scene.handle(events, m);
    const you = m.fighters[0];
    const dist = (id: number) => { const f = m.fighters[id]; return Math.hypot(f.x - you.x, f.y - you.y, f.z - you.z); };
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          sfx.shot(e.weapon, e.owner === 0 ? 0 : dist(e.owner));
          if (e.owner === 0) {
            const w = WEAPONS[e.weapon], k = (input.state.ads ? 0.6 : 1) * (0.75 + Math.random() * 0.5);
            input.state.pitch = Math.min(1.45, input.state.pitch + w.recoil * k);
            input.state.yaw += (Math.random() - 0.5) * w.recoil * 0.5;
          }
          break;
        }
        case 'hit':
          if (e.attacker === 0 && e.target !== 0) { hud.hitmarker(false, e.head); sfx.hit(e.head); }
          if (e.target === 0) {
            const a = m.fighters[e.attacker];
            const rel = wrapAngle(lookAt(you.x, 0, you.z, a.x, 0, a.z).yaw - you.yaw);
            if (e.attacker !== 0) hud.hurt(-rel, e.amount);
            sfx.hurt();
          }
          break;
        case 'kill': {
          const killer = m.fighters[e.killer], victim = m.fighters[e.victim];
          const wname = e.weapon === 'grenade' ? 'Flask' : WEAPONS[e.weapon].name;
          const icon = e.weapon === 'grenade' ? FLASK_ICON : WEAPON_ICONS[e.weapon];
          if (killer === victim) hud.feed(`${victim.name} self-eliminated (${wname})`, e.victim === 0);
          else hud.feedKill(killer.name, victim.name, icon, wname, e.head, e.killer === 0 || e.victim === 0);
          if (e.killer === 0 && e.victim !== 0) { hud.hitmarker(true, e.head); sfx.kill(); context.announce(`You eliminated ${victim.name}${e.head ? ' with a headshot' : ''}.`); }
          if (e.victim === 0) {
            context.announce(killer === victim ? 'You eliminated yourself. Respawning in 3 seconds.' : `Eliminated by ${killer.name}. Respawning in 3 seconds. Press 1 to 7 to pick your next weapon.`);
            input.clear();
            // Free the mouse so the next-life weapon buttons can be clicked.
            input.unlock();
            updateClickLayer();
          }
          break;
        }
        case 'explode': sfx.explode(Math.hypot(e.x - you.x, e.y - you.y, e.z - you.z)); break;
        case 'reload': if (e.owner === 0) sfx.reload(); break;
        case 'dry': if (e.owner === 0) sfx.dry(); break;
        case 'swap': if (e.owner === 0) sfx.swap(); break;
        case 'pickup': if (e.owner === 0) { sfx.pickup(); hud.toast(e.kind === 'ammo' ? 'Ammo' : 'Flask grenade', e.kind === 'ammo' ? 'Spare rounds restocked' : `${you.grenades} carried`); } break;
        case 'jump': if (e.owner === 0) sfx.jump(); break;
        case 'bounce': sfx.bounce(Math.hypot(e.x - you.x, e.y - you.y, e.z - you.z)); break;
        case 'streak':
          if (e.owner === 0) { const s = STREAKS[e.index]; sfx.streak(); hud.toast(s.name, s.text); context.announce(`${s.name}: ${s.text}.`); }
          else hud.feed(`${m.fighters[e.owner].name} earned ${STREAKS[e.index].name}`, false);
          break;
        case 'spawn':
          if (e.owner === 0) {
            input.setLook(you.yaw, 0); input.clear();
            if (!coarse && data.wantLock === 'true') input.lock();
            updateClickLayer();
          }
          break;
        case 'zone': { const z = getMap(m.settings.map).zones[e.index]; sfx.zone(); hud.toast('The zone moved', z.name); context.announce(`The zone moved to the ${z.name}.`); break; }
      }
    }
  }

  function ended() {
    phase = 'over';
    input.unlock(); input.clear();
    sfx.bell();
    report();
    const you = m.fighters[0], ranked = standings(m), place = ranked.findIndex(f => f.id === 0) + 1, teams = modeOf(m).teams;
    const won = playerWon(m), draw = m.winner === -1;
    const title = draw ? 'Draw!' : won ? 'Victory!' : 'Defeat';
    const sub = teams
      ? `${HOUSES[0].name} ${m.teamScores[0]} – ${m.teamScores[1]} ${HOUSES[1].name}. ${draw ? 'Honours even.' : `${HOUSES[m.winner].name} House wins.`}`
      : draw ? 'A tie at the top.' : won ? 'Top of the class.' : `${ranked[0].name} topped the board.`;
    q('.qc-over-title').textContent = title;
    q('.qc-over-sub').textContent = sub;
    q('.qc-o-place').textContent = ordinal(place);
    q('.qc-o-kills').textContent = String(you.kills);
    q('.qc-o-deaths').textContent = String(you.deaths);
    q('.qc-o-score').textContent = String(you.score);
    q('.qc-over-new').hidden = !(you.score > bestAtStart && bestAtStart > 0);
    show('over');
    context.setStatus(`${title} ${sub} You placed ${ordinal(place)} with ${you.kills} eliminations and ${you.score} points.`);
    context.announce(`${title} ${sub}`);
    q<HTMLButtonElement>('.qc-again').focus({ preventScroll: true });
  }

  function aimCheck() {
    const you = m.fighters[0];
    if (!you.alive) { aimName = ''; return; }
    const s = input.state, d = viewDir(s.yaw, s.pitch), ox = you.x, oy = eyeY(you), oz = you.z;
    const wall = rayWorld(worldFor(m), ox, oy, oz, d.x, d.y, d.z, 70);
    let bestT = wall ? wall.t : 70, name = '', friendly = false;
    for (const g of m.fighters) {
      if (g.id === 0 || !g.alive) continue;
      const th = raySphere(ox, oy, oz, d.x, d.y, d.z, g.x, g.y + HITBOX.headY, g.z, HITBOX.headR + 0.1);
      const tb = rayBox(ox, oy, oz, d.x, d.y, d.z, g.x - BODY.radius, g.y, g.z - BODY.radius, g.x + BODY.radius, g.y + BODY.height, g.z + BODY.radius);
      const t = th >= 0 ? (tb >= 0 ? Math.min(th, tb) : th) : tb;
      if (t >= 0 && t < bestT) { bestT = t; name = g.name; friendly = !enemies(m, you, g); }
    }
    aimName = name; aimFriendly = friendly;
  }

  function draw(dt: number) {
    if (disposed || lost) return;
    const you = m.fighters[0], wpn = weaponOf(you);
    const wantAds = phase === 'playing' && you.alive && you.ads;
    adsBlend += ((wantAds ? 1 : 0) - adsBlend) * Math.min(1, dt * (reduced() ? 30 : 14));
    if (++aimTick % 5 === 0) aimCheck();
    const view: SceneView = {
      m, alpha: phase === 'playing' ? Math.min(1, acc / STEP) : 1, prev, yaw: input.state.yaw, pitch: input.state.pitch, dt,
      reduced: reduced(), colorBlind: context.settings.colorBlind, ads: adsBlend, lookDX: input.state.lookDX, lookDY: input.state.lookDY,
      showcase: phase === 'menu' && shown === 'menu' ? { weapon: prefs.primary, color: HOUSES[0].color } : undefined,
    };
    input.state.lookDX = 0; input.state.lookDY = 0;
    scene.render(view);
    if (phase !== 'menu') hud.update(m, { spread: spreadOf(m, you), ads: adsBlend, scoped: wpn.id === 'valedictorian' && adsBlend > 0.85, aimName, aimFriendly, damageDir: null, board: input.state.board, dt, reduced: reduced() });
    if (phase === 'playing') report();
    setData('phase', phase);
    setData('alive', String(you.alive));
    setData('kills', String(you.kills));
    setData('mode', m.settings.mode);
    setData('map', m.settings.map);
    setData('quality',prefs.quality);
    setData('hud', String(phase !== 'menu'));
  }

  // ---- Buttons ----
  q('.qc-play').addEventListener('click', () => begin(), { signal });
  q('.qc-again').addEventListener('click', () => begin(), { signal });
  q('.qc-setup').addEventListener('click', () => toMenu(), { signal });
  q('.qc-resume').addEventListener('click', () => proceed(), { signal });
  q('.qc-quit').addEventListener('click', () => toMenu(), { signal });
  q('.qc-click-btn').addEventListener('click', () => { input.lock(); canvas.focus({ preventScroll: true }); }, { signal });
  window.addEventListener('keydown', e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t instanceof Element && t !== document.body && !root.contains(t)) return;
    // R on the result card plays again.
    if (shown === 'over' && e.code === 'KeyR') { e.preventDefault(); begin(); return; }
    // 1 to 7 choose the next life's weapon while waiting to respawn.
    const digit = /^Digit([1-7])$/.exec(e.code);
    if (digit && phase === 'playing' && !paused && !m.fighters[0].alive && !m.over) {
      e.preventDefault();
      const id = PRIMARIES[Number(digit[1]) - 1];
      prefs.primary = id; chooseLoadout(m, m.fighters[0], id); syncMenu();
      context.announce(`Next life: ${WEAPONS[id].name}.`);
    }
  }, { signal });

  function proceed() {
    if (!held || paused || disposed || lost) return;
    held = false;
    show(null);
    context.setStatus(`${MODES[m.settings.mode].name} resumed.`);
    canvas.focus({ preventScroll: true });
    if (!coarse) { setData('wantLock', 'true'); input.lock(); }
    schedule();
  }

  canvas.addEventListener('webglcontextlost', event => {
    if (disposed) return;
    event.preventDefault();
    lost = true;
    cancel();
    input.unlock();
    show('lost');
    context.save(instance.serialize());
    q('.qc-lost h2').focus({ preventScroll: true });
    context.setStatus('Graphics interrupted. Your match is saved. Leave and reopen Quad Clash.');
  }, { signal });

  const resizeCanvas = () => {
    if (disposed || lost) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 1 || h < 1) return;
    scene.resize(w, h);
    if (!frameId) draw(0);
  };
  const resize = new ResizeObserver(resizeCanvas);
  resize.observe(canvas);
  window.addEventListener('resize', resizeCanvas, { signal });

  let removeHook: (() => void) | undefined;
  if (import.meta.env.DEV) {
    const api = {
      state: () => { const y = m.fighters[0]; return { phase, held, paused, t: m.t, over: m.over, alive: y.alive, x: y.x, y: y.y, z: y.z, yaw: input.state.yaw, pitch: input.state.pitch, health: y.health, kills: y.kills, deaths: y.deaths, score: y.score, slot: y.slot, mag: [...y.mag], reserve: y.reserve, grenades: y.grenades, weapon: weaponOf(y).id, teamScores: [...m.teamScores], mode: m.settings.mode, map: m.settings.map, fighters: m.fighters.map(f => ({ id: f.id, alive: f.alive, x: f.x, y: f.y, z: f.z, team: f.team, health: f.health })) }; },
      start: (p: Partial<Prefs> & { seed?: number }) => { prefs = { ...prefs, ...p };scene.setQuality(prefs.quality); syncMenu(); begin(p.seed ?? 12345); },
      freeze: (on: boolean) => { frozen = on; acc = 0; },
      advance: (seconds: number) => { if (disposed) return; input.frame(seconds); advance(seconds); draw(0); },
      look: (yaw: number, pitch: number) => input.setLook(yaw, pitch),
      /** Moves a bot into a spot in front of you (testing only). */
      placeBot: (id: number, dist: number) => { const y = m.fighters[0], f = m.fighters[id], d = viewDir(input.state.yaw, 0); f.x = y.x + d.x * dist; f.z = y.z + d.z * dist; f.y = y.y; f.vx = f.vy = f.vz = 0; f.protectUntil = 0; ais[id].frozen = true; },
      /** Hurts you as if fighter `from` shot you (testing only). */
      hurtYou: (amount: number, from = 1) => { damage(m, m.fighters[0], m.fighters[from], amount, 'bell', false, m.fighters[0].x, m.fighters[0].y + 1, m.fighters[0].z); handleEvents(m.events.splice(0)); draw(0); },
      /** Parks every bot except the listed ones until much later (testing only). */
      isolate: (keep: number[] = []) => { for (const f of m.fighters) if (f.id !== 0 && !keep.includes(f.id)) { f.alive = false; f.respawnAt = 1e9; } },
      /** Jumps the match clock forward (testing only). */
      skip: (seconds: number) => { m.t = Math.min(modeOf(m).duration - 0.01, m.t + seconds); },
      stats: () => ({ ...scene.stats }),
      frames: () => frames,
    };
    let frames = 0;
    const count = () => { frames++; if (!disposed) countId = requestAnimationFrame(count); };
    let countId = requestAnimationFrame(count);
    (window as unknown as { __quadClashTest?: typeof api }).__quadClashTest = api;
    removeHook = () => { cancelAnimationFrame(countId); delete (window as unknown as { __quadClashTest?: unknown }).__quadClashTest; };
  }

  scene.setMatch(m);
  snapPrev();
  toMenu();
  report();

  const instance: GameInstance = {
    pause() {
      if (disposed || paused) return;
      paused = true;
      cancel();
      input.unlock();
      input.clear();
      updateClickLayer();
      if (phase === 'playing' && !held) context.announce('Quad Clash paused');
    },
    resume() {
      if (disposed || lost || !paused) return;
      paused = false;
      updateClickLayer();
      if (phase === 'playing' && !held) context.announce('Quad Clash resumed');
      schedule();
    },
    restart() {
      if (disposed || lost) return false;
      if (phase === 'menu') { toMenu(); return true; }
      begin();
      return true;
    },
    serialize() {
      return { v: SNAPSHOT_VERSION, prefs: { ...prefs }, match: phase === 'playing' && !m.over ? serializeMatch(m) : null };
    },
    restore(value) {
      if (!value || typeof value !== 'object' || disposed) return;
      const v = value as { v?: unknown; prefs?: Partial<Prefs>; match?: unknown };
      if (v.v !== SNAPSHOT_VERSION) return;
      const p = v.prefs ?? {};
      prefs = {
        mode: MODE_IDS.includes(p.mode as ModeId) ? p.mode as ModeId : DEFAULT_PREFS.mode,
        map: isMapId(p.map) ? p.map : DEFAULT_PREFS.map,
        difficulty: DIFFICULTIES.includes(p.difficulty as Difficulty) ? p.difficulty as Difficulty : DEFAULT_PREFS.difficulty,
        primary: isPrimary(p.primary) ? p.primary : DEFAULT_PREFS.primary,
        quality: isQuality(p.quality) ? p.quality : DEFAULT_PREFS.quality,
        sens: typeof p.sens === 'number' && Number.isFinite(p.sens) ? Math.max(0.4, Math.min(2.2, p.sens)) : 1,
      };
      scene.setQuality(prefs.quality);
      syncMenu();
      const restored = v.match ? restoreMatch(v.match) : null;
      if (!restored || restored.over) { toMenu(); return; }
      cancel();
      m = restored;
      prefs.mode = m.settings.mode; prefs.map = m.settings.map; prefs.difficulty = m.settings.difficulty;
      ais = m.fighters.map(f => createAi(f.id));
      prev = new Float32Array(m.fighters.length * 3);
      snapPrev();
      scene.setMatch(m);
      hud.reset();
      input.clear();
      input.setLook(m.fighters[0].yaw, m.fighters[0].pitch);
      phase = 'playing'; held = true; acc = 0;
      reportedScore = -1; report();
      q('.qc-continue-sub').textContent = `${MODES[m.settings.mode].name} on ${getMap(m.settings.map).name}, ${Math.max(0, Math.ceil((MODES[m.settings.mode].duration - m.t) / 60))} min left. You have ${m.fighters[0].kills} eliminations.`;
      show('continue');
      context.setStatus('Saved match on hold. Press Continue to jump back in.');
      const button = q<HTMLButtonElement>('.qc-resume');
      button.focus({ preventScroll: true });
      queueMicrotask(() => { if (!disposed && shown === 'continue') button.focus({ preventScroll: true }); });
      draw(0);
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      input.unlock();
      abort.abort();
      resize.disconnect();
      removeHook?.();
      scene.dispose();
      sfx.dispose();
      root.remove();
    },
  };
  return instance;
}

function ordinal(n: number) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

const game: GameModule = Object.freeze({
  id: ID,
  title: 'Quad Clash',
  cover: 'game-art/quad-clash/cover.svg',
  rules: 'Quad Clash is a first-person arena shooter on the QCC campus as egg fighters against seven bots. Pick a mode: Lunchtime Brawl (free-for-all, first to 25 eliminations), House Match (Kōwhai against Moana, first house to 40) or Hold the Quad (outnumber the other house inside the marked zone to score a point a second, first to 60; the zone moves every minute). Matches last at most five minutes. Choose one of seven primary weapons; everyone also carries the Pencil Pusher sidearm and Science Fair flask grenades. Health refills after a few seconds out of fire. Eliminated fighters drop ammo and sometimes a flask; pickups also sit around each arena. Streaks reward you: 3 eliminations restock ammo and a grenade, 5 give a 15-second Prefect Shield that halves damage, 8 give the Principal’s Pass for faster movement and reloads. Points: 100 per elimination, 25 more for a headshot, 50 per streak reward, 5 per second holding the zone, 100 for finishing and 500 for winning. Desktop: W A S D move, mouse looks (arrow keys also look), click or F fires, right-click or Shift aims, Space jumps, R reloads, Q, 1, 2 or the wheel swaps, G or E throws a grenade, Tab shows the scoreboard, Esc or P pauses. Touch: left thumb moves, drag on the right to look, and use the on-screen buttons.',
  mount,
});
export default game;
