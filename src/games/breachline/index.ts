/** Breachline: an original five-a-side tactical shooter. Attackers breach a research annex to plant an uplink;
 * defenders fortify it. This file is the shell contract: menu and lobby, online rooms, the fixed-step loop, and the
 * wiring from match events to picture, sound, HUD and announcements. */
import type { GameContext, GameInstance, GameModule } from '../../core/types';
import * as store from '../../core/storage';
import { RoomDialog, inviteCodeFromHash, relayOnlyFromHash } from '../../multiplayer/panel';
import type { Room } from '../../multiplayer/room';
import { ATK, BOT_SKILL, CELL, CHARGE, KITS, ROUND, SKILLS, SQUADS, TICK, WEAPONS, type SkillId } from './config';
import { createSfx, type At } from './audio';
import { createHud, type HudView, type Marker } from './hud';
import { createInput } from './input';
import { MAP, inRect, roomAt, type FloorMat } from './map';
import { GuestSession, HostSession, MAX_PLAYERS, NET_VERSION, type Session } from './net';
import { QUALITIES, createScene, isQuality, type BreachScene, type QualityId, type SceneView } from './scene';
import { actDuration, aimedPanel, interaction } from './sim';
import { ACT, aimOf, kitOf, roleOf, weaponOf, type Intent, type Match, type Player, type SimEvent } from './state';
import { cellCenter, obstruction, panelCenter } from './world';
import './style.css';

const ID = 'breachline' as const;
const SNAPSHOT_VERSION = 1;
interface Prefs { teamSize: number; bots: boolean; skill: SkillId; sens: number; quality: QualityId; sound: boolean }
// Sound is on by default here, whatever the arcade's own Sound setting: it matters in this game.
const DEFAULT_PREFS: Prefs = { teamSize: 5, bots: true, skill: 'regular', sens: 1, quality: 'auto', sound: true };
type Layer = 'menu' | 'over' | 'wait' | 'lost' | null;

const TEMPLATE = `<canvas class="bl-canvas" tabindex="0" aria-label="Breachline. W A S D move, mouse looks, click fires, right-click or Space aims, Shift sprints, C crouches, Q and E lean, F uses, G throws a grenade, B places or sets off a breach charge, V strikes, R reloads."></canvas>
<div class="bl-click" hidden><button type="button" class="game-button bl-click-btn">Click to play</button><p>The mouse aims. Esc frees it.</p></div>
<div class="bl-layer">
  <section class="bl-card bl-menu" aria-labelledby="bl-menu-title">
    <header class="bl-brand"><h2 id="bl-menu-title" class="bl-title"><span class="sr-only">Breachline</span><img src="${import.meta.env.BASE_URL}game-art/breachline/title.svg" alt="" width="190" height="130"></h2></header>
    <p class="bl-mode"><b>Uplink</b> · Tidewater Annex · first to ${ROUND.toWin} rounds</p>
    <div class="bl-roster" aria-live="polite"><div class="bl-squad-list" data-squad="0"><h3></h3><ul></ul></div><div class="bl-squad-list" data-squad="1"><h3></h3><ul></ul></div></div>
    <div class="bl-settings">
      <label><span>Team size</span><select class="bl-size">${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${n} v ${n}</option>`).join('')}</select></label>
      <label><span>Bots</span><select class="bl-skill"><option value="off">No bots</option>${SKILLS.map(s => `<option value="${s}">${BOT_SKILL[s].name}</option>`).join('')}</select></label>
      <label><span>Graphics</span><select class="bl-quality">${(Object.keys(QUALITIES) as QualityId[]).map(q => `<option value="${q}">${QUALITIES[q].name}</option>`).join('')}</select></label>
      <label><span>Sound</span><select class="bl-sound"><option value="on">On</option><option value="off">Off</option></select></label>
      <label class="bl-sens"><span>Look speed</span><input type="range" min="0.4" max="2.2" step="0.1" value="1"><output>1.0×</output></label>
    </div>
    <div class="bl-actions"><button type="button" class="game-button bl-play">Play</button><button type="button" class="game-button secondary bl-swap">Switch squad</button><button type="button" class="game-button secondary bl-online">Multiplayer</button></div>
    <p class="bl-note" role="status"></p>
    <p class="bl-help"></p>
  </section>
  <section class="bl-card bl-over" aria-labelledby="bl-over-title" hidden>
    <h2 id="bl-over-title" class="bl-over-title" tabindex="-1">Match over</h2>
    <p class="bl-over-sub"></p>
    <dl class="bl-over-stats"><div><dt>Rounds</dt><dd class="bl-o-rounds">0–0</dd></div><div><dt>Elims</dt><dd class="bl-o-kills">0</dd></div><div><dt>Falls</dt><dd class="bl-o-deaths">0</dd></div><div><dt>Points</dt><dd class="bl-o-score">0</dd></div></dl>
    <div class="bl-actions"><button type="button" class="game-button bl-again">Play again</button><button type="button" class="game-button secondary bl-lobby">Back to lobby</button></div>
  </section>
  <section class="bl-card bl-wait" hidden><h2 tabindex="-1">Waiting for the host</h2><p>The host has paused the match. It carries on when they return.</p></section>
  <section class="bl-card bl-lost" hidden><h2 tabindex="-1">Graphics interrupted</h2><p>Leave and reopen Breachline to restore the graphics.</p><div class="bl-actions"><a class="game-button" href="#/collection">Back to games</a></div></section>
</div>`;

/** The floor material under a point: footsteps and falls sound of what is actually underfoot. */
function surfaceAt(x: number, z: number): FloorMat {
  for (let i = MAP.floors.length - 1; i >= 0; i--) if (inRect(MAP.floors[i], x, z)) return MAP.floors[i].mat;
  return 'asphalt';
}
const REASONS: Record<string, [string, string]> = { eliminated: ['Every defender is down.', 'Every attacker is down.'], time: ['', 'The attackers ran out of time.'], uplink: ['The uplink completed.', ''], defused: ['', 'The uplink was shut down.'], '': ['', ''] };

function mount(container: HTMLElement, context: GameContext): GameInstance {
  const root = document.createElement('div');
  root.className = 'breachline';
  root.innerHTML = TEMPLATE;
  container.append(root);
  const canvas = root.querySelector<HTMLCanvasElement>('.bl-canvas')!;
  let prefs: Prefs = { ...DEFAULT_PREFS };
  let scene: BreachScene;
  try { scene = createScene(canvas, prefs.quality); }
  catch {
    root.innerHTML = '<div class="bl-fallback" role="status"><h2>3D graphics unavailable</h2><p>Breachline needs WebGL. Turn on hardware acceleration in the browser settings, or try a recent browser.</p><a class="game-button" href="#/collection">Choose another game</a></div>';
    context.setStatus('This browser could not start the 3D graphics Breachline needs.');
    return { pause() {}, resume() {}, restart() {}, serialize: () => undefined, restore() {}, dispose() { root.remove(); } };
  }
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const abort = new AbortController(), signal = abort.signal;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => context.settings.reducedMotion || motion.matches;
  const sfx = createSfx(() => prefs.sound);
  scene.onCosmetic(e => sfx.cosmetic(e, at(e.x, e.y, e.z)));
  const hud = createHud(root, signal);
  const layer = q('.bl-layer'), clickLayer = q('.bl-click');
  const cards: Record<Exclude<Layer, null>, HTMLElement> = { menu: q('.bl-menu'), over: q('.bl-over'), wait: q('.bl-wait'), lost: q('.bl-lost') };

  const myName = () => store.read<string>('mp:name', '') || 'You';
  let host = new HostSession(myName(), { teamSize: prefs.teamSize, bots: prefs.bots, skill: prefs.skill }, (Date.now() & 0x7fffffff) || 1);
  let guest: GuestSession | null = null, room: Room | null = null, offRoom: (() => void) | null = null;
  const session = (): Session => guest ?? host;
  let paused = false, held = false, disposed = false, lost = false, frozen = false;
  let frameId = 0, last = 0, acc = 0, shown: Layer = null, watch = -1, prevX = 0, prevZ = 0, wantLock = false, renderCarry = 0;
  let promptAt = 0, prompt = '', crumbleAt = 0, beepAt = 0, levelText = '', lastPhase = '';
  const stepAcc: number[] = [], workAcc: number[] = [];

  const input = createInput({
    root, canvas, signal,
    playing: () => inMatch() && !paused && !held && !lost && shown === null,
    canLock: () => inMatch() && !paused && !held && !lost && shown === null,
    sensitivity: () => prefs.sens,
    zoomScale: () => { const s = session(), me = s.m.players[s.self]; return me && me.alive ? 1 / Math.pow(1 + (weaponOf(s.m, me).zoom - 1) * me.adsT, 0.85) : 1; },
    onPause: () => { if (context.setPaused) context.setPaused(!paused); else document.querySelector<HTMLButtonElement>('#pause-game')?.click(); },
    // Alone, Esc pauses. Online the match goes on, so it only frees the mouse.
    onUnlock: () => { if (inMatch() && !paused && !session().online && context.setPaused) context.setPaused(true); },
    onLockChange: () => updateClickLayer(),
  });
  const inMatch = () => { const p = session().m.phase; return p !== 'lobby' && p !== 'over'; };

  // ---- Menu and lobby ----
  const size = q<HTMLSelectElement>('.bl-size'), skill = q<HTMLSelectElement>('.bl-skill'), graphics = q<HTMLSelectElement>('.bl-quality'), sens = q<HTMLInputElement>('.bl-sens input'), sensOut = q<HTMLOutputElement>('.bl-sens output'), sound = q<HTMLSelectElement>('.bl-sound');
  const play = q<HTMLButtonElement>('.bl-play'), swap = q<HTMLButtonElement>('.bl-swap'), online = q<HTMLButtonElement>('.bl-online');
  const dialog = new RoomDialog({
    game: ID, title: 'Breachline', version: NET_VERSION, maxPlayers: MAX_PLAYERS, inviteCode: inviteCodeFromHash(location.hash), relayOnly: relayOnlyFromHash(location.hash),
    onOpen(r) {
      room = r;
      offRoom = r.on(e => {
        if (e.type === 'paused' && r.role === 'guest') { held = e.paused; if (held) { input.unlock(); show('wait'); } else { show(layerFor()); schedule(); } }
        if (e.type === 'players' || e.type === 'joined' || e.type === 'left') queueMicrotask(syncMenu);
      });
      if (r.role === 'host') { host.rename(r.self?.name ?? host.name); host.attach(r); if (paused) r.setPaused(true); }
      else { guest = new GuestSession(r); hud.reset(); watch = -1; }
      dialog.panel.setNote(r.role === 'host' ? 'Close this window and press Start match when everyone is in.' : 'The host starts the match.');
      syncMenu(); show(layerFor());
    },
    onClosed(message) {
      offRoom?.(); offRoom = null; room = null; held = false;
      if (guest) { guest.dispose(); guest = null; hud.reset(); input.unlock(); context.announce(message); }
      else host.attach(null);
      syncMenu(); show(layerFor()); schedule();
    },
  });
  function syncMenu() {
    const m = session().m, isHost = !guest, me = m.players[session().self];
    for (const s of [0, 1] as const) {
      const box = root.querySelector<HTMLElement>(`.bl-squad-list[data-squad="${s}"]`)!;
      box.querySelector('h3')!.textContent = `${SQUADS[s].shape} ${SQUADS[s].name} · ${s === 0 ? 'attacks first' : 'defends first'}`;
      const list = box.querySelector('ul')!; list.replaceChildren();
      for (const p of m.players.filter(v => v.squad === s)) { const li = document.createElement('li'); li.textContent = p.bot ? `${p.name} (bot)` : p.id === session().self ? `${p.name} (you)` : p.name; li.dataset.bot = String(p.bot); list.append(li); }
    }
    size.value = String(m.cfg.teamSize); skill.value = m.cfg.bots ? m.cfg.skill : 'off'; graphics.value = prefs.quality;
    sens.value = String(prefs.sens); sensOut.textContent = `${prefs.sens.toFixed(1)}×`; sound.value = prefs.sound ? 'on' : 'off';
    size.disabled = skill.disabled = !isHost;
    const people = m.players.filter(p => !p.bot), bothSides = m.players.some(p => p.squad === 0) && m.players.some(p => p.squad === 1);
    play.textContent = !isHost ? 'Waiting for the host' : room ? 'Start match' : 'Play';
    play.disabled = !isHost || !bothSides;
    swap.hidden = people.length < 1 || (!room && !m.cfg.bots);
    online.textContent = room ? `Room ${room.code}` : 'Multiplayer';
    q('.bl-note').textContent = !isHost ? `You are in ${room?.players.find(p => p.host)?.name ?? 'the host'}’s room. They choose the settings and start the match.`
      : !bothSides ? 'Both squads need at least one fighter. Turn bots on, or invite a friend with Multiplayer.'
        : room ? `${people.length} in the room${m.cfg.bots ? '; bots fill the other seats' : ''}. Share the code ${room.code}.` : me ? `You start with ${SQUADS[me.squad].name}. Bots fill every other seat.` : '';
    q('.bl-help').textContent = input.touch
      ? 'Left thumb moves, right thumb looks. Hold Fire and drag to aim while shooting. Use appears as a hand button.'
      : 'WASD move · Mouse look · Click fire · Right-click or Space aim · Shift sprint · C crouch · Q/E lean · F use · G grenade · B breach charge · V melee · R reload · X swap · Tab scores';
  }
  size.addEventListener('change', () => { prefs.teamSize = Number(size.value) || 5; host.configure({ teamSize: prefs.teamSize }); syncMenu(); }, { signal });
  skill.addEventListener('change', () => { prefs.bots = skill.value !== 'off'; if (prefs.bots) prefs.skill = skill.value as SkillId; host.configure({ bots: prefs.bots, skill: prefs.skill }); syncMenu(); }, { signal });
  graphics.addEventListener('change', () => { if (isQuality(graphics.value)) { prefs.quality = graphics.value; scene.setQuality(prefs.quality); } }, { signal });
  sound.addEventListener('change', () => { prefs.sound = sound.value !== 'off'; if (prefs.sound) sfx.resume(); else sfx.suspend(); }, { signal });
  sens.addEventListener('input', () => { prefs.sens = Number(sens.value) || 1; sensOut.textContent = `${prefs.sens.toFixed(1)}×`; }, { signal });
  play.addEventListener('click', () => { if (!guest) { sfx.ui(); if (!host.start()) syncMenu(); } }, { signal });
  swap.addEventListener('click', () => { sfx.ui(); if (guest) guest.swapSquad(); else host.swapSquad(); syncMenu(); }, { signal });
  online.addEventListener('click', () => dialog.open(), { signal });
  q('.bl-again').addEventListener('click', () => { if (!guest && !host.start()) { host.toLobby(); show('menu'); syncMenu(); } }, { signal });
  q('.bl-lobby').addEventListener('click', () => { if (!guest) { host.toLobby(); show('menu'); syncMenu(); } }, { signal });
  q('.bl-click-btn').addEventListener('click', () => { input.lock(); canvas.focus({ preventScroll: true }); }, { signal });
  hud.onKit(kit => session().kit(kit));

  // ---- Lifecycle ----
  const active = () => !paused && !disposed && !lost;
  function schedule() { if (!frameId && active()) { last = 0; frameId = requestAnimationFrame(loop); } }
  function cancel() { if (frameId) cancelAnimationFrame(frameId); frameId = 0; }
  function layerFor(): Layer { const p = session().m.phase; return lost ? 'lost' : held ? 'wait' : p === 'lobby' ? 'menu' : p === 'over' ? 'over' : null; }
  function show(next: Layer) {
    shown = next;
    layer.hidden = next === null;
    for (const [name, card] of Object.entries(cards)) card.hidden = name !== next;
    canvas.tabIndex = next === null ? 0 : -1;
    root.dataset.layer = next ?? '';
    if (next !== null) input.unlock();
    updateClickLayer();
  }
  function updateClickLayer() { clickLayer.hidden = !(inMatch() && shown === null && !paused && !input.touch && !input.locked && input.lockable && wantLock); }
  function enterPlay() {
    show(null);
    canvas.focus({ preventScroll: true });
    if (!input.touch) { wantLock = true; if (!paused) input.lock(); }
    updateClickLayer();
  }

  // ---- Per-step input ----
  const NONE = { reload: false, swap: false, melee: false, grenade: false, breach: false, digit: 0 as const, next: false };
  /** Testing only: held controls, and one-step edges, laid over the real input. */
  let forced: Partial<Intent> | null = null, forcedOnce: Partial<Intent> | null = null;
  function intent(first: boolean): Intent {
    const s = input.state, e = first ? input.take() : NONE, ses = session(), m = ses.m, me = m.players[ses.self];
    let slot: -1 | 0 | 1 = -1;
    if (e.digit) { if (m.phase === 'prep') ses.kit(e.digit - 1); else if (e.digit <= 2) slot = (e.digit - 1) as 0 | 1; }
    if (e.next && (!me || !me.alive)) nextWatch(1);
    const out: Intent = { mx: s.mx, mz: s.mz, yaw: s.yaw, pitch: s.pitch, fire: s.fire, ads: s.ads, crouch: s.crouch, sprint: s.sprint, lean: s.lean, use: s.use, reload: e.reload, swap: e.swap, slot, melee: e.melee, grenade: e.grenade, breach: e.breach };
    return forced ? { ...out, ...forced, ...(first ? forcedOnce : null) } : out;
  }
  function nextWatch(step: number) {
    const ses = session(), m = ses.m, me = m.players[ses.self];
    const pool = m.players.filter(p => p.alive && (!me || p.squad === me.squad));
    if (!pool.length) { watch = -1; return; }
    const i = pool.findIndex(p => p.id === watch);
    watch = pool[(i + step + pool.length) % pool.length].id;
  }

  // ---- Performance readout (?perf=1, or F3 in a match): fps, frame and script time, draws, size, quality, GPU ----
  let perfOn = /[?&]perf=1\b/.test(location.search + location.hash), perfAt = 0, perfFrames: number[] = [], perfScript = 0, perfLast = 0;
  window.addEventListener('keydown', e => { if (e.key === 'F3') { e.preventDefault(); perfOn = !perfOn; if (!perfOn) hud.perf(null, false); } }, { signal });
  function perfTick(now: number, drew: boolean, scriptMs: number) {
    if (!perfOn) return;
    perfScript += scriptMs;
    if (drew) { if (perfLast) perfFrames.push(now - perfLast); perfLast = now; }
    if (now - perfAt < 1000) return;
    const n = perfFrames.length, avg = n ? perfFrames.reduce((a, b) => a + b, 0) / n : 0, worst = n ? Math.max(...perfFrames) : 0, st = scene.stats;
    hud.perf([
      `${Math.round(n * 1000 / Math.max(1, now - perfAt))} fps  ${avg.toFixed(1)} ms  worst ${worst.toFixed(1)} ms`,
      `script ${(perfScript / Math.max(1, n)).toFixed(1)} ms  ${st.calls} draws  ${Math.round(st.triangles / 1000)}k tris`,
      `${st.size ?? ''}  ${QUALITIES[prefs.quality].name}  post ${st.post ?? 'off'}  art ${st.artTier ?? ''}${st.auto ? `  ${st.auto}` : ''}`,
      (st.gpu ?? '').length > 56 ? `${(st.gpu ?? '').slice(0, 55)}...` : st.gpu ?? '',
    ], !!st.software);
    perfAt = now; perfFrames = []; perfScript = 0;
  }
  function loop(now: number) {
    frameId = 0;
    if (!active()) return;
    const perfStart = performance.now(); let drew = false;
    const interval = last ? (now - last) / 1000 : 0, dt = Math.min(interval, 0.1);
    last = now;
    input.frame(dt);
    if (!held && !frozen) advance(dt);
    // The performance preset draws every other frame on a 60 Hz screen; the simulation and input do not slow down.
    const period = 1 / QUALITIES[prefs.quality].fps;
    renderCarry += interval;
    if (renderCarry >= period - 0.002 || shown !== null) { draw(Math.min(0.1, renderCarry)); drew = true; renderCarry = renderCarry >= period * 2 ? 0 : Math.max(0, renderCarry - period); }
    perfTick(now, drew, performance.now() - perfStart);
    if (active()) frameId = requestAnimationFrame(loop);
  }
  function advance(seconds: number) {
    acc += seconds;
    let first = true;
    while (acc >= TICK - 1e-9) {
      acc -= TICK;
      const ses = session(), me = ses.m.players[ses.self];
      if (me) { prevX = me.x; prevZ = me.z; }
      ses.step(intent(first), TICK);
      first = false;
      const events = ses.drain();
      if (events.length) onEvents(events);
    }
  }

  // ---- Events to picture, sound and words ----
  const at = (x: number, y: number, z: number): At => { const e = scene.ear; return { x, y, z, block: obstruction(session().m.world, e.x, e.y, e.z, x, y, z) }; };
  function onEvents(events: SimEvent[]) {
    const ses = session(), m = ses.m, self = ses.self, me = m.players[self] as Player | undefined;
    scene.handle(events, m, self);
    for (const e of events) {
      switch (e.e) {
        case 'shot': {
          const mine = e.id === self;
          sfx.shot(e.w, mine ? null : at(e.x, e.y, e.z));
          if (mine && me) { const w = WEAPONS[e.w], k = (me.ads ? 0.62 : 1) * (me.crouching ? 0.85 : 1) * (0.8 + Math.random() * 0.4); input.state.pitch = Math.min(1.45, input.state.pitch + w.recoil * k); input.state.yaw += (Math.random() - 0.5) * 2 * w.recoilSide * k; }
          break;
        }
        case 'reload': { const p = m.players[e.id]; if (p) { const w = weaponOf(m, p); sfx.reload(w.reload, e.id === self ? null : at(p.x, 1.2, p.z), w.id, p.mag[p.slot] === 0); } break; }
        case 'melee': { const p = m.players[e.id]; if (p) sfx.melee(e.id === self ? null : at(p.x, 1.2, p.z)); break; }
        case 'cells': {
          const panel = m.world.panels[e.p];
          if (!panel || performance.now() - crumbleAt < 45) break;
          crumbleAt = performance.now();
          const c = cellCenter(panel, e.c[0]);
          sfx.crumble(panel.kind !== 'wall', e.cause === 1 || e.c.length > 8, at(c.x, c.y, c.z));
          break;
        }
        case 'panel': {
          const panel = m.world.panels[e.p];
          if (!panel) break;
          const c = panelCenter(panel);
          sfx.build(e.s === 2, at(c.x, c.y, c.z));
          if (e.by === self) context.announce(e.s === 2 ? 'Wall reinforced.' : 'Barricade up.');
          break;
        }
        case 'hit':
          if (e.by === self && e.on !== self) { hud.hitmarker(false, e.head); sfx.hit(e.head); }
          { const on = m.players[e.on]; if (on && e.on !== self) sfx.flesh(at(on.x, e.head ? 1.6 : 1.2, on.z), !e.head && Math.random() < 0.5); }
          if (e.on === self && me) {
            const a = m.players[e.by];
            if (a && a !== me) { const bearing = Math.atan2(-(a.x - me.x), -(a.z - me.z)) - input.state.yaw; hud.hurt(-bearing, e.dmg); } else hud.hurt(0, e.dmg);
            sfx.hurt();
          }
          break;
        case 'kill': {
          const by = m.players[e.by], on = m.players[e.on];
          if (!by || !on) break;
          hud.kill(by === on ? '' : by.name, on.name, e.w, e.head, by.squad, on.squad, e.by === self || e.on === self);
          if (e.by === self && e.on !== self) { hud.hitmarker(true, e.head); sfx.kill(); context.announce(`You eliminated ${on.name}${e.head ? ' with a headshot' : ''}.`); }
          if (e.on !== self) { const p = at(on.x, 0.3, on.z); sfx.body(p, false, surfaceAt(on.x, on.z)); sfx.dropWeapon(p); }
          if (e.on === self) { context.announce(by === on ? 'You are down.' : `Eliminated by ${by.name}. Watching your squad; click to change view.`); nextWatch(0); }
          break;
        }
        case 'throw': { const p = m.players[e.id]; if (p) sfx.throwIt(e.id === self ? null : at(p.x, 1.4, p.z)); break; }
        case 'bounce': sfx.bounce(at(e.x, e.y, e.z)); break;
        case 'boom': sfx.boom(at(e.x, e.y, e.z), e.kind === 'impact' ? 0.7 : 1); break;
        case 'charge': { const panel = m.world.panels[e.p]; if (panel) { const c = panelCenter(panel); sfx.chargeSet(at(c.x, e.y, c.z)); } if (e.by === self) hud.toast('Charge set', input.touch ? 'Press Breach again to set it off' : 'Press B again to set it off'); break; }
        case 'plant': {
          const site = MAP.sites[e.site], mine = me ? roleOf(m, me) === ATK : true;
          sfx.round('planted');
          hud.banner('Uplink armed', `${site.name} (${site.id}) · ${mine ? `hold for ${ROUND.fuse} seconds` : 'reach it and shut it down'}`, mine ? 'good' : 'bad', 3.5);
          context.announce(`Uplink armed in the ${site.name}. ${ROUND.fuse} seconds.`);
          break;
        }
        case 'defused': hud.note(`${m.players[e.by]?.name ?? 'A defender'} shut down the uplink`); break;
        case 'kit': if (e.id === self && me) { const k = KITS[roleOf(m, me)][e.kit]; if (k) hud.toast(k.name, `${WEAPONS[k.primary].name} · ${k.blurb}`); } break;
        case 'spawn': {
          const mine = e.at.find(a => a[0] === self);
          if (mine) { input.setLook(mine[3], 0); input.clear(); prevX = mine[1]; prevZ = mine[2]; watch = self; }
          break;
        }
        case 'fix': if (e.id === self && me) { prevX = me.x; prevZ = me.z; } break;
        case 'phase': onPhase(e, m, me); break;
      }
    }
  }
  function onPhase(e: Extract<SimEvent, { e: 'phase' }>, m: Match, me: Player | undefined) {
    const role = me ? roleOf(m, me) : ATK;
    if (e.phase === 'prep') {
      hud.reset();
      hud.banner(`Round ${e.round}`, me ? `${SQUADS[me.squad].name} · you ${role === ATK ? 'attack' : 'defend'}` : 'Watching', 'plain', 3);
      sfx.round('start');
      context.announce(`Round ${e.round}. You ${role === ATK ? 'attack' : 'defend'}. ${ROUND.prep} seconds to prepare.`);
      watch = me ? me.id : -1;
      if (!me) nextWatch(0);
      if (shown !== null || lastPhase === 'lobby' || lastPhase === 'over' || lastPhase === '') enterPlay();
    } else if (e.phase === 'action') {
      sfx.round('go');
      hud.toast(role === ATK ? 'Go' : 'They are coming', role === ATK ? 'Plant the uplink in A or B' : 'Hold the Lab (A) and the Archive (B)');
      context.announce(role === ATK ? 'Action phase. Plant the uplink.' : 'Action phase. The attackers are moving.');
    } else if (e.phase === 'end') {
      const won = !!me && e.winner === me.squad, attackersWon = e.winner === e.attackers, text = REASONS[e.reason]?.[attackersWon ? 0 : 1] ?? '';
      hud.banner(me ? (won ? 'Round won' : 'Round lost') : `${SQUADS[e.winner === 1 ? 1 : 0].name} take the round`, `${text} ${SQUADS[0].name} ${e.wins[0]} – ${e.wins[1]} ${SQUADS[1].name}`, me ? (won ? 'good' : 'bad') : 'plain', ROUND.end - 0.5);
      sfx.round(won || !me ? 'win' : 'lose');
      context.announce(`${won ? 'Round won' : 'Round lost'}. ${text} ${e.wins[0]} to ${e.wins[1]}.`);
    } else if (e.phase === 'over') {
      const won = !!me && e.winner === me.squad, title = !me ? `${SQUADS[e.winner === 1 ? 1 : 0].name} win` : won ? 'Victory' : 'Defeat';
      const sub = `${SQUADS[0].name} ${e.wins[0]} – ${e.wins[1]} ${SQUADS[1].name}`;
      q('.bl-over-title').textContent = title; q('.bl-over-sub').textContent = sub;
      q('.bl-o-rounds').textContent = `${e.wins[0]}–${e.wins[1]}`; q('.bl-o-kills').textContent = String(me?.kills ?? 0); q('.bl-o-deaths').textContent = String(me?.deaths ?? 0); q('.bl-o-score').textContent = String(me?.score ?? 0);
      q<HTMLButtonElement>('.bl-again').hidden = q<HTMLButtonElement>('.bl-lobby').hidden = !!guest;
      sfx.round(won ? 'matchWin' : 'matchLose');
      if (me) context.setScore(me.score);
      context.setStatus(`${title}. ${sub}.`); context.announce(`${title}. ${sub}.`);
      show('over');
      q('.bl-over-title').focus({ preventScroll: true });
    } else if (e.phase === 'lobby') { show('menu'); syncMenu(); }
    lastPhase = e.phase;
  }

  /** Brings the screen in line with the match after events were skipped (a guest returning from a pause). */
  function reconcile() {
    const ses = session(), m = ses.m, me = m.players[ses.self] as Player | undefined;
    if (m.phase === 'over') { lastPhase = 'end'; onPhase({ e: 'phase', phase: 'over', round: m.round, attackers: m.attackers, wins: [m.wins[0], m.wins[1]], spawn: m.spawn, winner: m.winner, reason: m.reason }, m, me); return; }
    lastPhase = m.phase;
    if (m.phase === 'lobby') { show('menu'); syncMenu(); return; }
    if (me) { input.setLook(me.yaw, 0); input.clear(); prevX = me.x; prevZ = me.z; }
    watch = me && me.alive ? me.id : -1;
    if (!held) enterPlay();
  }

  // ---- Per-frame sound that follows state rather than events ----
  function ambient(m: Match, self: number, dt: number) {
    const e = scene.ear;
    sfx.listen(e.x, e.y, e.z, e.yaw, inRect(MAP.building, e.x, e.z));
    if (!inMatch()) return;
    for (const p of m.players) {
      if (!p.alive) continue;
      const i = p.id;
      stepAcc[i] = (stepAcc[i] ?? 0) + Math.min(1.6, p.pace) * dt;
      if (stepAcc[i] > 0.42 && p.pace > 0.25) { stepAcc[i] = 0; sfx.step(surfaceAt(p.x, p.z), p.crouching ? 0.3 : p.sprint ? 1.35 : 0.8, i === self && watch === self ? null : at(p.x, 0.1, p.z)); }
      if (p.act !== ACT.none) {
        workAcc[i] = (workAcc[i] ?? 0) + dt;
        if (workAcc[i] > 0.26) { workAcc[i] = 0; sfx.work(p.act === ACT.plant ? 'plant' : p.act === ACT.defuse ? 'defuse' : p.act === ACT.reinforce ? 'reinforce' : p.act === ACT.barricade ? 'barricade' : 'charge', i === self ? null : at(p.x, 1, p.z)); }
      }
    }
    if (m.phase === 'planted' && m.device) { beepAt -= dt; if (beepAt <= 0) { beepAt = m.t < 10 ? 0.25 : m.t < 20 ? 0.5 : 1; sfx.beep(at(m.device.x, 0.3, m.device.z), m.t < 10); } }
  }

  function promptFor(m: Match, me: Player): string {
    const use = input.touch ? 'Hold Use' : 'Hold F', role = roleOf(m, me);
    if (me.act !== ACT.none) return me.act === ACT.plant ? 'Arming the uplink…' : me.act === ACT.defuse ? 'Shutting it down…' : me.act === ACT.reinforce ? 'Reinforcing…' : me.act === ACT.barricade ? 'Barricading…' : 'Placing charge…';
    if (m.phase === 'end' || m.phase === 'over') return '';
    const what = interaction(m, me, aimOf(me));
    if (what) return what.act === ACT.plant ? `${use} to plant the uplink` : what.act === ACT.defuse ? `${use} to shut down the uplink` : what.act === ACT.reinforce ? `${use} to reinforce this wall (${me.reinforcements} left)` : `${use} to barricade`;
    if (role === ATK && m.phase !== 'prep') {
      const key = input.touch ? 'Breach' : 'B';
      if (m.charges.some(c => c.by === me.id)) return `${key}: set off the charge`;
      if (me.charges > 0) { const hit = aimedPanel(m.world, aimOf(me), CHARGE.reach); if (hit && !hit.panel.reinforced && hit.panel.cells[Math.floor((hit.y - hit.panel.y0) / CELL) * hit.panel.cols + Math.floor((hit.u - hit.panel.u0) / CELL)]) return `${key}: place a breach charge`; }
      if (m.phase === 'action' && !m.device) return '';
    }
    return '';
  }

  // Reused every frame: the view, the markers and the HUD's input (no objects or strings made per frame unless a
  // shown value changed).
  const markers: Marker[] = [], markerPool: Marker[] = [];
  const view = { m: null, self: 0, watch: -1, yaw: 0, pitch: 0, px: 0, pz: 0, alpha: 0, dt: 0, reduced: false, menu: false } as unknown as SceneView;
  const hv = { markers } as HudView;
  let devSec = -1, devText = '', waitCase = -1, waitName = '', waitTouch = false, waitText = '', levelKey = -1, useNow = '', roleNow = '', phaseNow = '';
  const siteDist: number[] = [], siteText: string[] = [];
  function mark(x: number, y: number, z: number, label: string, kind: Marker['kind'], sub?: string) {
    const p = scene.project(x, y, z), mk = markerPool[markers.length] ??= { x: 0, y: 0, front: false, label: '', kind: 'mate' };
    mk.x = p.x; mk.y = p.y; mk.front = p.front; mk.label = label; mk.kind = kind; mk.sub = sub;
    markers.push(mk);
  }
  function draw(dt: number) {
    if (disposed || lost) return;
    const ses = session(), m = ses.m, self = ses.self, me = m.players[self] as Player | undefined;
    if (me && me.alive) watch = self; else if (watch < 0 || !m.players[watch]?.alive || (me && m.players[watch].squad !== me.squad)) nextWatch(0);
    const menu = shown === 'menu';
    view.m = m; view.self = self; view.watch = inMatch() || m.phase === 'over' ? watch : -1; view.yaw = input.state.yaw; view.pitch = input.state.pitch;
    view.px = prevX; view.pz = prevZ; view.alpha = Math.min(1, acc / TICK); view.dt = dt; view.reduced = reduced(); view.menu = menu;
    scene.render(view);
    ambient(m, self, dt);
    // HUD.
    markers.length = 0;
    const seen = m.players[watch];
    if (inMatch() && seen) {
      // The uplink's marker and countdown only while it is armed (not under the round's end banner).
      if (m.device && m.phase === 'planted') { const sec = Math.ceil(m.t); if (sec !== devSec) { devSec = sec; devText = `${sec}s`; } mark(m.device.x, 0.9, m.device.z, 'UPLINK', 'device', devText); }
      else if (m.phase !== 'end' && m.phase !== 'over' && !m.device) for (let i = 0; i < MAP.sites.length; i++) {
        const s = MAP.sites[i], cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
        if (inRect(s, seen.x, seen.z)) continue;
        const d = Math.round(Math.hypot(cx - seen.x, cz - seen.z));
        if (d !== siteDist[i]) { siteDist[i] = d; siteText[i] = `${d} m`; }
        mark(cx, 1.7, cz, s.id, 'site', siteText[i]);
      }
      for (const p of m.players) if (p.alive && p.id !== watch && p.squad === seen.squad && markers.length < 10) mark(p.x, 1.95 - p.crouch * 0.55, p.z, p.name, 'mate');
    }
    promptAt -= dt;
    if (promptAt <= 0) { promptAt = 0.1; prompt = me && me.alive && inMatch() ? promptFor(m, me) : ''; }
    let gap = 8;
    if (me && me.alive) {
      const d = weaponOf(m, me), spread = d.hip + (d.ads - d.hip) * me.adsT + d.moveSpread * Math.min(1, me.pace) * (1 - 0.5 * me.adsT) + me.bloom * (1 - 0.6 * me.adsT) - (me.crouching ? d.hip * 0.2 * (1 - me.adsT) : 0);
      gap = Math.tan(Math.max(0, spread)) / Math.tan(32 * Math.PI / 180) * canvas.clientHeight / 2 + 3;
    }
    let mates = !me;
    if (me) for (const p of m.players) if (p.alive && p.squad === me.squad) { mates = true; break; }
    // The waiting line: which case it is and who is watched, built again only when that changes.
    const wcase = !inMatch() ? 0 : me && !me.alive ? (seen && seen.alive ? 1 : mates ? 0 : 2) : !me ? (seen ? 3 : 4) : m.phase === 'prep' && roleOf(m, me) === ATK ? 5 : 0;
    const wname = (wcase === 1 || wcase === 3) && seen ? seen.name : '';
    if (wcase !== waitCase || wname !== waitName || input.touch !== waitTouch) {
      waitCase = wcase; waitName = wname; waitTouch = input.touch;
      waitText = wcase === 1 ? `Watching ${wname} · ${input.touch ? 'tap' : 'click'} for the next squadmate` : wcase === 2 ? 'Your squad is down' : wcase === 3 ? `Watching ${wname}` : wcase === 4 ? 'Watching' : wcase === 5 ? `Waiting to go in · pick a kit${input.touch ? '' : ' with 1, 2 or 3'}` : '';
    }
    hv.m = m; hv.self = self; hv.watch = watch; hv.gap = gap; hv.ads = me ? me.adsT : 0; hv.scoped = !!me && me.alive && me.slot === 0 && kitOf(m, me).primary === 'dmr' && me.adsT > 0.9;
    hv.prompt = prompt; hv.progress = me && me.act !== ACT.none ? me.actT / actDuration(me.act) : -1; hv.room = seen ? roomAt(seen.x, seen.z) : '';
    hv.board = input.state.board; hv.touch = input.touch; hv.waiting = waitText; hv.dt = dt;
    hud.update(hv);
    const use = !!prompt && prompt.startsWith('Hold') ? 'true' : 'false', role = me ? (roleOf(m, me) === ATK ? 'atk' : 'def') : '';
    if (use !== useNow) root.dataset.use = useNow = use;
    if (role !== roleNow) root.dataset.role = roleNow = role;
    const lk = m.phase === 'lobby' ? -1 : m.round * 10000 + m.wins[0] * 100 + m.wins[1];
    if (lk !== levelKey || !levelText) { levelKey = lk; const level = lk < 0 ? 'Lobby' : `Round ${m.round} · ${m.wins[0]}–${m.wins[1]}`; if (level !== levelText) { levelText = level; context.setLevel(level); } }
    if (m.phase !== phaseNow) root.dataset.phase = phaseNow = m.phase;
    if (m.phase === 'lobby' && shown === null && !held) { show('menu'); syncMenu(); }
  }

  canvas.addEventListener('webglcontextlost', event => {
    if (disposed) return;
    event.preventDefault();
    lost = true; cancel(); input.unlock(); show('lost');
    // A host that cannot draw cannot run the match either: hold the room rather than freeze it silently.
    if (room?.role === 'host') room.setPaused(true);
    q('.bl-lost h2').focus({ preventScroll: true });
    context.setStatus('Graphics interrupted. Leave and reopen Breachline.');
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
  if (import.meta.env.DEV || import.meta.env.VITE_BREACHLINE_TEST === '1') {
    let frames = 0;
    const count = () => { frames++; if (!disposed) countId = requestAnimationFrame(count); };
    let countId = requestAnimationFrame(count);
    const api = {
      state: () => { const s = session(), m = s.m, me = m.players[s.self]; return { phase: m.phase, t: m.t, round: m.round, wins: [...m.wins], attackers: m.attackers, self: s.self, watch, online: s.online, host: s.host, shown, paused, held, me: me ? { x: me.x, z: me.z, yaw: input.state.yaw, pitch: input.state.pitch, hp: me.hp, alive: me.alive, squad: me.squad, role: roleOf(m, me), kit: me.kit, mag: [...me.mag], charges: me.charges, grenades: me.grenades, reinforcements: me.reinforcements, act: me.act, kills: me.kills, score: me.score } : null, players: m.players.map(p => ({ id: p.id, name: p.name, squad: p.squad, bot: p.bot, alive: p.alive, hp: p.hp, x: p.x, z: p.z })), holes: m.world.panels.reduce((n, p) => n + (p.kind === 'wall' ? p.cells.length - p.intact : 0), 0), reinforced: m.world.panels.filter(p => p.reinforced).length, device: m.device }; },
      start: (o: Partial<Prefs> & { seed?: number } = {}) => { if (guest) return; prefs = { ...prefs, ...o }; if (o.seed) { host.dispose(); host = new HostSession(host.name, { teamSize: prefs.teamSize, bots: prefs.bots, skill: prefs.skill }, o.seed); } else { if (host.m.phase !== 'lobby') host.toLobby(); host.configure({ teamSize: prefs.teamSize, bots: prefs.bots, skill: prefs.skill }); } if (room) host.attach(room); scene.setQuality(prefs.quality); host.start(); },
      freeze: (on: boolean) => { frozen = on; acc = 0; },
      advance: (seconds: number) => { if (disposed) return; input.frame(seconds); const steps = Math.round(seconds / TICK); for (let i = 0; i < steps; i++) { acc = TICK; advance(0); } draw(0); },
      look: (yaw: number, pitch: number) => input.setLook(yaw, pitch),
      /** Holds controls for a while as if pressed (testing only); `once` are single-step presses at the start. */
      hold: (patch: Partial<Intent>, seconds: number, once: Partial<Intent> | null = null) => { forced = patch; forcedOnce = once; const steps = Math.round(seconds / TICK); for (let i = 0; i < steps; i++) { acc = TICK; advance(0); forcedOnce = null; } forced = null; draw(0); },
      /** Moves your fighter (testing only; host or solo). */
      place: (x: number, z: number, yaw?: number, pitch = 0) => { const s = session(), me = s.m.players[s.self]; if (!me) return; me.x = prevX = x; me.z = prevZ = z; if (yaw !== undefined) input.setLook(yaw, pitch); },
      /** Jumps the phase clock (testing only; host or solo). */
      skip: (seconds: number) => { if (!guest) host.m.t = Math.max(0.05, host.m.t - seconds); },
      /** Stops every bot thinking by parking them (testing only). */
      still: () => { if (!guest) for (const p of host.m.players) if (p.bot) { p.bot = false; p.owner = 'parked'; } },
      stats: () => ({ ...scene.stats }),
      frames: () => frames,
      draw: () => draw(0.016),
    };
    (window as unknown as { __breachlineTest?: typeof api }).__breachlineTest = api;
    removeHook = () => { cancelAnimationFrame(countId); delete (window as unknown as { __breachlineTest?: unknown }).__breachlineTest; };
  }

  syncMenu();
  show('menu');
  context.setStatus('Choose the team size and bots, then press Play, or open Multiplayer to play with friends.');
  context.setLevel('Lobby');
  if (inviteCodeFromHash(location.hash)) queueMicrotask(() => { if (!disposed) dialog.open(); });
  schedule();

  const instance: GameInstance = {
    pause() {
      if (disposed || paused) return;
      paused = true; cancel(); input.unlock(); input.clear(); sfx.suspend(); updateClickLayer();
      if (room?.role === 'host') room.setPaused(true);
      if (inMatch()) context.announce('Breachline paused');
    },
    resume() {
      if (disposed || lost || !paused) return;
      paused = false; sfx.resume();
      if (room?.role === 'host') room.setPaused(false);
      // Whatever happened while this device was away has already been applied; skip its effects and catch up
      // from the state instead.
      if (guest) { guest.drain(); reconcile(); }
      updateClickLayer();
      if (inMatch()) context.announce('Breachline resumed');
      schedule();
    },
    restart() {
      if (disposed || lost || guest) return false;
      if (host.m.phase === 'lobby') return true;
      host.toLobby();
      if (!host.start()) { show('menu'); syncMenu(); }
      return true;
    },
    serialize() { return { v: SNAPSHOT_VERSION, prefs: { ...prefs } }; },
    restore(value) {
      if (!value || typeof value !== 'object' || disposed) return;
      const v = value as { v?: unknown; prefs?: Partial<Prefs> };
      if (v.v !== SNAPSHOT_VERSION) return;
      const p = v.prefs ?? {};
      prefs = {
        teamSize: typeof p.teamSize === 'number' && p.teamSize >= 1 && p.teamSize <= ROUND.maxTeam ? Math.floor(p.teamSize) : DEFAULT_PREFS.teamSize,
        bots: typeof p.bots === 'boolean' ? p.bots : DEFAULT_PREFS.bots,
        skill: SKILLS.includes(p.skill as SkillId) ? p.skill as SkillId : DEFAULT_PREFS.skill,
        sens: typeof p.sens === 'number' && Number.isFinite(p.sens) ? Math.max(0.4, Math.min(2.2, p.sens)) : 1,
        quality: isQuality(p.quality) ? p.quality : DEFAULT_PREFS.quality,
        sound: typeof p.sound === 'boolean' ? p.sound : DEFAULT_PREFS.sound,
      };
      scene.setQuality(prefs.quality);
      if (!guest) host.configure({ teamSize: prefs.teamSize, bots: prefs.bots, skill: prefs.skill });
      syncMenu();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel(); input.unlock(); abort.abort(); resize.disconnect(); removeHook?.();
      offRoom?.(); dialog.dispose(); guest?.dispose(); host.dispose();
      scene.dispose(); sfx.dispose(); root.remove();
    },
  };
  return instance;
}

const game: GameModule = Object.freeze({
  id: ID,
  title: 'Breachline',
  cover: 'game-art/breachline/cover.svg',
  rules: `Breachline is a five-a-side tactical shooter with one mode, Uplink, on one map, the Tidewater Annex. Play alone with bots or online with up to ${MAX_PLAYERS} people: open Multiplayer, create a room and share the code. Attackers must plant the uplink in the Lab (site A) or the Archive (site B) and protect it for ${ROUND.fuse} seconds; defenders win by shutting it down, running out the clock, or eliminating the attackers. Eliminating the other squad also wins the round, and there are no respawns within a round. Each round starts with ${ROUND.prep} seconds of preparation: defenders reinforce walls and barricade doorways while attackers pick a kit. The first squad to ${ROUND.toWin} rounds wins, and the squads swap roles after ${ROUND.swapAfter} rounds. Most inner walls are destructible: bullets punch holes you can see and shoot through, shotguns and melee strikes open them up, and breach charges blow a doorway. Reinforced walls stop everything. Attackers choose Breacher, Assault or Marksman; defenders choose Anchor, Roamer or Warden. Desktop and Chromebook: W A S D move, mouse or trackpad looks (arrow keys also look), click fires, right-click or Space aims, Shift sprints, C crouches, Q and E lean, F is held to plant, shut down, reinforce or barricade, G throws a grenade, B places a breach charge and sets it off, V strikes, R reloads, X or the wheel swaps weapons, 1 to 3 pick a kit during preparation, Tab shows the scoreboard, Esc frees the mouse. Touch: left thumb moves, drag on the right to look, and use the on-screen buttons. Sound follows the arcade's sound setting.`,
  mount,
});
export default game;
