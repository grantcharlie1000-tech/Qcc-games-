/** Femboy Frosthop: a pastel Christmas third-person obby. This file is the shell contract and glue: the fixed-step
 * loop, input to intents, run events to sound/HUD/announcements, campaign progress, Time Trial and saving. */
import type { GameContext, GameInstance, GameModule } from '../../core/types';
import { COURSE_VERSION, STEP } from './config';
import { buildCourse, ZONES } from './stages';
import { createRun, step, Stepper } from './sim';
import { OUTFITS, earnedUnlocks, readSnapshot, writeSnapshot, defaultProgress, type Mode, type Progress } from './progress';
import { createTrial, encodeTime, finishTrial, formatTime, markCasual, startTrial, trialCheckpoint, trialElapsed, type CasualReason, type Trial } from './trial';
import { createScene, type FrostScene } from './scene';
import { createInput, worldMove, PITCH } from './input';
import type { Run, SimEvent } from './types';
import './style.css';

const ID = 'femboy-obby';
const course = buildCourse();
const LAST = course.checkpoints.length - 1;

const REASONS: Record<CasualReason, string> = { paused: 'paused', hidden: 'tab hidden', restored: 'restored save', assist: 'gentle help on' };

const ICON = {
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M18 2.8v4.4h-4.4M6 21.2v-4.4h4.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wardrobe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5a2 2 0 1 1 2-2M12 6.5v1.3L3 15.5a1.4 1.4 0 0 0 .9 2.5h16.2a1.4 1.4 0 0 0 .9-2.5L12 7.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/></svg>',
  jump: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6 11.5 12 5.5l6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const TEMPLATE = `<canvas class="fo-canvas" tabindex="0" aria-label="Femboy Frosthop course. W A S D or arrow keys move, Space jumps, Q and E turn the camera, C recentres it, and dragging orbits the camera."></canvas>
<div class="fo-hud-src" aria-hidden="true"><span class="fo-stage">1/30</span><span class="fo-time-label">Stars</span><span class="fo-time">0/30</span></div>
<p class="fo-toast" aria-hidden="true" hidden></p>
<div class="fo-tools">
  <button type="button" class="fo-tool fo-recentre" aria-label="Recentre camera (C)" title="Recentre camera (C)">${ICON.camera}</button>
  <button type="button" class="fo-tool fo-open" aria-label="Wardrobe, help and modes" title="Wardrobe, help and modes" aria-expanded="false">${ICON.wardrobe}</button>
</div>
<div class="fo-touch" hidden><div class="fo-stick" hidden><i></i></div></div>
<button type="button" class="fo-jump" aria-label="Jump" hidden>${ICON.jump}<span>Jump</span></button>
<section class="fo-suggest ui-glass-sheet" role="status" hidden>
  <p>Tricky stage? Gentle help slows hazards and moving platforms.</p>
  <div class="fo-actions"><button type="button" class="game-button fo-help-on">Turn on gentle help</button><button type="button" class="game-button secondary fo-help-no">No thanks</button></div>
</section>
<section class="fo-panel ui-glass-sheet" aria-labelledby="fo-panel-title" hidden>
  <header><h2 id="fo-panel-title">Wardrobe &amp; help</h2><button type="button" class="game-button secondary fo-close">Done</button></header>
  <fieldset class="fo-outfits"><legend>Outfit</legend></fieldset>
  <label class="fo-check"><input type="checkbox" class="fo-bow"> <span>Ribbon bow <small class="fo-bow-note">Reach the first checkpoint</small></span></label>
  <label class="fo-check"><input type="checkbox" class="fo-help"> <span>Gentle help <small>Slows every hazard and moving platform. A Time Trial with help on is casual (not ranked).</small></span></label>
  <label class="fo-check"><input type="checkbox" class="fo-low"> <span>Low graphics <small>30 frames a second and a smaller picture. Does not change the game.</small></span></label>
  <div class="fo-modes"><h3>Play</h3>
    <label class="fo-stage-pick"><span>Go to stage</span><select class="game-select fo-stage-select"></select></label>
    <div class="fo-actions"><button type="button" class="game-button fo-trial">Start a Time Trial</button><button type="button" class="game-button secondary fo-campaign">Back to the campaign</button><button type="button" class="game-button secondary fo-fresh">Replay from stage 1</button></div>
    <p class="fo-trial-note"></p>
  </div>
</section>
<section class="fo-result ui-glass-sheet" aria-labelledby="fo-result-title" hidden>
  <h2 id="fo-result-title" tabindex="-1">Star-top finish!</h2>
  <p class="fo-result-sub"></p>
  <dl class="fo-result-stats"><div><dt>Time</dt><dd class="fo-r-time">—</dd></div><div><dt>Stars</dt><dd class="fo-r-stars">0/30</dd></div><div><dt>Run</dt><dd class="fo-r-status">—</dd></div></dl>
  <p class="fo-result-unlock" hidden></p>
  <div class="fo-actions"><button type="button" class="game-button fo-r-trial">Time Trial</button><button type="button" class="game-button secondary fo-r-more">Keep exploring</button></div>
</section>
<div class="fo-fallback" role="status" hidden><h2>Graphics interrupted</h2><p>Your progress is saved. Leave and reopen Femboy Frosthop to restore the graphics.</p><a class="game-button" href="#/collection">Back to games</a></div>`;

function mount(container: HTMLElement, context: GameContext): GameInstance {
  const root = document.createElement('div');
  root.className = 'femboy-obby';
  root.innerHTML = TEMPLATE;
  container.append(root);
  const canvas = root.querySelector<HTMLCanvasElement>('.fo-canvas')!;
  let scene: FrostScene;
  try { scene = createScene(canvas, course); }
  catch {
    root.innerHTML = '<div class="fo-fallback" role="status"><h2>3D graphics unavailable</h2><p>Femboy Frosthop needs WebGL. Turn on hardware acceleration in the browser settings, or try a recent browser.</p><a class="game-button" href="#/collection">Choose another game</a></div>';
    context.setStatus('This browser could not start the 3D graphics Femboy Frosthop needs.');
    return { pause() {}, resume() {}, restart() {}, serialize: () => undefined, restore() {}, dispose() { root.remove(); } };
  }
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const abort = new AbortController(), signal = abort.signal;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => context.settings.reducedMotion || motionQuery.matches;

  let progress: Progress = defaultProgress();
  let mode: Mode = 'campaign';
  let run: Run = createRun(course, { stars: progress.stars });
  let trial: Trial | null = null;
  let paused = false, disposed = false, lost = false, finished = false;
  let frameId = 0, last = 0, renderCarry = 0, lowQuality = false;
  const stepper = new Stepper();
  const prev = { x: 0, y: 0, z: 0 };
  let squash = 0, hudAt = 0, toastTimer = 0, suggestedFor = -1, lastStage = -1;

  const input = createInput({
    root, canvas, signal,
    active: () => !paused && !disposed && !lost && panel.hidden && result.hidden,
    onRecentre: recentre,
    onTouchMode: on => { root.dataset.touch = String(on); q('.fo-touch').hidden = !on; q('.fo-jump').hidden = !on; },
    onActivity: () => {},
  });
  if (matchMedia('(pointer: coarse)').matches) { root.dataset.touch = 'true'; q('.fo-touch').hidden = false; q('.fo-jump').hidden = false; }

  const panel = q('.fo-panel'), result = q('.fo-result'), suggest = q('.fo-suggest');

  // ---------- state helpers ----------
  const now = () => performance.now();
  const stageNo = () => Math.min(LAST, run.checkpoint + 1);
  function outfit() { return OUTFITS.find(o => o.id === progress.outfit) ?? OUTFITS[0]; }
  function applyOutfit() { scene.setOutfit(outfit(), progress.bow); }
  function persist() { context.save(instance.serialize()); }
  function snapPrev() { prev.x = run.player.x; prev.y = run.player.y; prev.z = run.player.z; }

  function newRun(at: number) {
    run = createRun(course, { checkpoint: at, stars: progress.stars, assist: progress.help });
    stepper.reset(); snapPrev();
    input.clear();
    input.setLook(course.checkpoints[at].yaw, PITCH.rest);
    scene.snapCamera();
    finished = false;
    result.hidden = true; suggest.hidden = true;
    lastStage = -1;
    hud(true);
  }

  function startCampaign(at: number) {
    mode = 'campaign'; trial = null;
    newRun(Math.max(0, Math.min(progress.checkpoint, at)));
    const st = course.stages[stageNo() - 1];
    context.setStatus(`Campaign: stage ${st.index}, ${st.name}.`);
    context.announce(`Stage ${st.index}: ${st.name}.`);
  }

  function startTrialMode() {
    if (!progress.complete) return;
    mode = 'trial';
    newRun(0);
    trial = createTrial(progress.help, LAST);
    if (paused) markCasual(trial, 'paused');
    context.setStatus('Time Trial ready. The clock starts when you cross the start line.');
    context.announce(trial.eligible ? 'Time Trial. The clock starts at the start line.' : 'Time Trial, casual because gentle help is on.');
    toast('Time Trial · cross the line to start');
  }

  function recentre() {
    input.setLook(run.player.facing, PITCH.rest);
    context.announce('Camera recentred');
  }

  function toast(text: string) {
    const t = q('.fo-toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------- HUD ----------
  function hud(force = false) {
    const n = stageNo();
    const stageText = `${n}/30`;
    if (force || q('.fo-stage').textContent !== stageText) q('.fo-stage').textContent = stageText;
    let label: string, value: string;
    if (mode === 'trial' && trial) {
      label = trial.eligible ? 'Ranked' : 'Casual';
      value = trial.started ? formatTime(trialElapsed(trial, now())) : 'Ready';
    } else { label = 'Stars'; value = `${progress.stars.length}/30`; }
    if (q('.fo-time-label').textContent !== label) q('.fo-time-label').textContent = label;
    if (q('.fo-time').textContent !== value) q('.fo-time').textContent = value;
    if (n !== lastStage) {
      lastStage = n;
      const st = course.stages[n - 1];
      context.setLevel(`Stage ${n}/30 · ${st.name}`);
      root.dataset.zone = st.zone;
      toast(`Stage ${n} · ${st.name}`);
    }
  }

  // ---------- events ----------
  function handle(events: SimEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'jump': context.sound('tap'); break;
        case 'land': squash = 1; break;
        case 'spring': squash = 1; context.sound('tap'); break;
        case 'death':
          context.sound('lose');
          if (run.stageFails >= 3 && !progress.help && suggestedFor !== stageNo()) { suggestedFor = stageNo(); suggest.hidden = false; }
          break;
        case 'respawn':
          input.setLook(course.checkpoints[run.checkpoint].yaw, PITCH.rest);
          scene.snapCamera(); snapPrev();
          break;
        case 'start-line':
          if (mode === 'trial' && trial) { startTrial(trial, now()); context.announce(trial.eligible ? 'Go! The clock is running.' : 'Go! Casual run.'); toast('Go!'); }
          break;
        case 'star': {
          if (!progress.stars.includes(e.id)) progress.stars.push(e.id);
          const p = run.player;
          scene.burst('star', p.x, p.y, p.z);
          context.sound('success');
          context.announce(`Star collected. ${progress.stars.length} of 30.`);
          const fresh = unlockCheck();
          if (fresh.length) { toast(`Unlocked: ${fresh.map(id => OUTFITS.find(o => o.id === id)?.name ?? id).join(', ')}`); context.announce('All 30 stars! Starlight outfit unlocked.'); }
          persist();
          break;
        }
        case 'checkpoint': onCheckpoint(e.index); break;
        case 'crumble': break;
      }
    }
  }

  function unlockCheck(): string[] {
    const before = new Set(earnedUnlocks({ ...progress, checkpoint: progress.checkpoint, stars: progress.stars.slice(0, -1) }));
    return earnedUnlocks(progress).filter(id => !before.has(id));
  }

  function onCheckpoint(index: number) {
    const cp = course.checkpoints[index];
    scene.burst('checkpoint', cp.x, cp.y, cp.z);
    context.sound('success');
    suggest.hidden = true;
    if (mode === 'trial' && trial) {
      trialCheckpoint(trial, index);
      if (index === LAST) return trialDone();
      context.announce(`Checkpoint ${index}.`);
      persist();
      return;
    }
    const before = new Set(earnedUnlocks(progress));
    if (index > progress.checkpoint) progress.checkpoint = index;
    if (index === LAST) progress.complete = true;
    if (index === 1 && !before.has('bow')) progress.bow = true;
    const fresh = earnedUnlocks(progress).filter(id => !before.has(id));
    const names = fresh.map(id => id === 'bow' ? 'Ribbon bow' : OUTFITS.find(o => o.id === id)?.name ?? id);
    if (fresh.includes('bow')) applyOutfit();
    if (names.length) toast(`Unlocked: ${names.join(', ')}`);
    persist();
    if (index === LAST) return campaignDone(names);
    const next = course.stages[index];
    context.announce(`Checkpoint ${index} reached.${names.length ? ` Unlocked ${names.join(' and ')}.` : ''} Stage ${index + 1}: ${next.name}.`);
  }

  function campaignDone(unlocked: string[]) {
    finished = true;
    const p = course.checkpoints[LAST];
    scene.burst('finish', p.x, p.y, p.z);
    q('#fo-result-title').textContent = 'Star-top finish!';
    q('.fo-result-sub').textContent = 'You crossed all six zones. The Time Trial is open.';
    q('.fo-r-time').textContent = `${run.deaths} falls`;
    q('.fo-r-time').previousElementSibling!.textContent = 'Retries';
    q('.fo-r-stars').textContent = `${progress.stars.length}/30`;
    q('.fo-r-status').textContent = 'Campaign';
    const un = q('.fo-result-unlock');
    un.hidden = !unlocked.length; un.textContent = unlocked.length ? `New: ${unlocked.join(', ')}` : '';
    q('.fo-r-trial').hidden = false;
    showResult();
    context.setStatus('Campaign complete! Time Trial unlocked.');
    context.announce('Campaign complete. You reached the star-top finish. Time Trial unlocked.');
  }

  function trialDone() {
    if (!trial) return;
    const r = finishTrial(trial, now());
    if (!r) return;
    finished = true;
    const p = course.checkpoints[LAST];
    scene.burst('finish', p.x, p.y, p.z);
    let sub: string;
    if (r.eligible) {
      const best = progress.bestTrialMs;
      if (best === null || r.ms < best) progress.bestTrialMs = r.ms;
      context.setScore(encodeTime(r.ms));
      sub = best === null || r.ms < best ? 'A new personal best, sent to the leaderboard.' : `Your best is ${formatTime(best)}.`;
    } else sub = `Casual run (${REASONS[trial.reason ?? 'paused']}), so this time is not ranked.`;
    q('#fo-result-title').textContent = 'Time Trial complete!';
    q('.fo-result-sub').textContent = sub;
    q('.fo-r-time').previousElementSibling!.textContent = 'Time';
    q('.fo-r-time').textContent = formatTime(r.ms);
    q('.fo-r-stars').textContent = `${progress.stars.length}/30`;
    q('.fo-r-status').textContent = r.eligible ? 'Ranked' : 'Casual';
    q('.fo-result-unlock').hidden = true;
    q('.fo-r-trial').hidden = false;
    q('.fo-r-trial').textContent = 'Try again';
    showResult();
    persist();
    context.setStatus(`Time Trial finished in ${formatTime(r.ms)}. ${r.eligible ? 'Ranked.' : 'Casual.'}`);
    context.announce(`Time Trial finished in ${formatTime(r.ms)}. ${sub}`);
  }

  function showResult() {
    result.hidden = false;
    input.clear();
    q('#fo-result-title').focus({ preventScroll: true });
  }

  // ---------- loop ----------
  function active() { return !paused && !disposed && !lost && !document.hidden; }
  function schedule() { if (!frameId && active()) frameId = requestAnimationFrame(loop); }
  function cancel() { if (frameId) cancelAnimationFrame(frameId); frameId = 0; }

  function intent() {
    if (!panel.hidden || !result.hidden || finished) return { mx: 0, mz: 0, jump: false };
    const s = input.state, m = worldMove(s.ix, s.iy, s.yaw);
    return { mx: m.mx, mz: m.mz, jump: s.jump };
  }

  function loop(t: number) {
    frameId = 0;
    if (!active()) return;
    const dt = last ? Math.min(0.25, (t - last) / 1000) : 0;
    last = t;
    input.frame(dt);
    stepper.advance(dt, () => {
      snapPrev();
      step(run, course, intent());
      if (run.events.length) handle(run.events);
    });
    squash = Math.max(0, squash - dt * 6);
    renderCarry += dt;
    const period = lowQuality ? 1 / 30 : 0;
    if (renderCarry >= period - 1e-4) { draw(renderCarry); renderCarry = 0; }
    if (t - hudAt > 100) { hudAt = t; hud(); }
    schedule();
  }

  function draw(dt: number) {
    if (disposed || lost) return;
    const a = stepper.alpha, p = run.player;
    const speedScale = run.assist ? 0.65 : 1;
    scene.render({
      x: prev.x + (p.x - prev.x) * a, y: prev.y + (p.y - prev.y) * a, z: prev.z + (p.z - prev.z) * a,
      facing: p.facing, speed: Math.hypot(p.vx, p.vz), vy: p.vy, grounded: p.grounded, squash,
      mt: run.mt - (1 - a) * STEP * speedScale, run, stage: run.checkpoint, reached: mode === 'campaign' ? Math.max(progress.checkpoint, run.checkpoint) : run.checkpoint,
      stars: new Set(progress.stars), yaw: input.state.yaw, pitch: input.state.pitch, dt, reduced: reduced(), dead: run.dead > 0,
    });
    const st = root.dataset;
    st.stage = String(stageNo()); st.mode = mode; st.checkpoint = String(run.checkpoint);
  }

  // ---------- panel ----------
  const outfitBox = q('.fo-outfits');
  for (const o of OUTFITS) {
    const label = document.createElement('label');
    label.className = 'fo-outfit';
    label.innerHTML = `<input type="radio" name="fo-outfit" value="${o.id}"><span class="fo-swatch" style="--a:#${o.jumper.toString(16).padStart(6, '0')};--b:#${o.sockA.toString(16).padStart(6, '0')};--c:#${o.hatColor.toString(16).padStart(6, '0')}"></span><span><b>${o.name}</b><small>${o.unlock}</small></span>`;
    label.querySelector('input')!.addEventListener('change', () => { progress.outfit = o.id; applyOutfit(); persist(); context.announce(`${o.name} on.`); }, { signal });
    outfitBox.append(label);
  }
  function syncPanel() {
    const earned = earnedUnlocks(progress);
    for (const label of outfitBox.querySelectorAll<HTMLLabelElement>('.fo-outfit')) {
      const radio = label.querySelector('input')!, ok = earned.includes(radio.value);
      radio.disabled = !ok; radio.checked = radio.value === progress.outfit;
      label.classList.toggle('is-locked', !ok);
    }
    const bow = q<HTMLInputElement>('.fo-bow');
    bow.disabled = !earned.includes('bow'); bow.checked = progress.bow;
    q('.fo-bow-note').textContent = earned.includes('bow') ? 'Earned at the first checkpoint' : 'Reach the first checkpoint';
    q<HTMLInputElement>('.fo-help').checked = progress.help;
    q<HTMLInputElement>('.fo-low').checked = lowQuality;
    const sel = q<HTMLSelectElement>('.fo-stage-select');
    sel.replaceChildren(...course.stages.filter(s => s.index - 1 <= progress.checkpoint).map(s => { const o = document.createElement('option'); o.value = String(s.index - 1); o.textContent = `${s.index}. ${s.name}${progress.stars.includes(course.stars[s.index - 1].id) ? ' ★' : ''}`; return o; }));
    sel.value = String(mode === 'campaign' ? run.checkpoint : 0);
    sel.disabled = mode !== 'campaign';
    q<HTMLButtonElement>('.fo-trial').disabled = !progress.complete;
    q('.fo-campaign').hidden = mode !== 'trial';
    q('.fo-trial-note').textContent = !progress.complete ? 'Finish the campaign to open the Time Trial.'
      : `Time Trial: a fresh run from the start line, with checkpoints in order and the clock running through falls. Pausing, hiding the tab, restoring a save or gentle help makes it casual.${progress.bestTrialMs ? ` Best: ${formatTime(progress.bestTrialMs)}.` : ''}`;
  }
  function openPanel() {
    if (lost) return;
    syncPanel();
    panel.hidden = false; suggest.hidden = true;
    q('.fo-open').setAttribute('aria-expanded', 'true');
    input.clear();
    q<HTMLButtonElement>('.fo-close').focus({ preventScroll: true });
  }
  function closePanel(): boolean {
    if (panel.hidden) return false;
    panel.hidden = true;
    q('.fo-open').setAttribute('aria-expanded', 'false');
    canvas.focus({ preventScroll: true });
    return true;
  }
  function setHelp(on: boolean) {
    progress.help = on;
    run.assist = on;
    if (on && trial) markCasual(trial, 'assist');
    context.announce(on ? 'Gentle help on.' : 'Gentle help off.');
    persist();
  }
  q('.fo-open').addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()), { signal });
  q('.fo-close').addEventListener('click', () => closePanel(), { signal });
  q('.fo-recentre').addEventListener('click', () => { recentre(); canvas.focus({ preventScroll: true }); }, { signal });
  q<HTMLInputElement>('.fo-bow').addEventListener('change', e => { progress.bow = (e.target as HTMLInputElement).checked; applyOutfit(); persist(); }, { signal });
  q<HTMLInputElement>('.fo-help').addEventListener('change', e => { setHelp((e.target as HTMLInputElement).checked); syncPanel(); }, { signal });
  q<HTMLInputElement>('.fo-low').addEventListener('change', e => { lowQuality = (e.target as HTMLInputElement).checked; scene.setQuality(lowQuality); resizeCanvas(); }, { signal });
  q<HTMLSelectElement>('.fo-stage-select').addEventListener('change', e => { startCampaign(Number((e.target as HTMLSelectElement).value)); closePanel(); persist(); }, { signal });
  q('.fo-trial').addEventListener('click', () => { startTrialMode(); closePanel(); persist(); }, { signal });
  q('.fo-campaign').addEventListener('click', () => { startCampaign(progress.checkpoint); closePanel(); persist(); }, { signal });
  q('.fo-fresh').addEventListener('click', () => { startCampaign(0); closePanel(); persist(); }, { signal });
  q('.fo-help-on').addEventListener('click', () => { setHelp(true); suggest.hidden = true; canvas.focus({ preventScroll: true }); }, { signal });
  q('.fo-help-no').addEventListener('click', () => { suggest.hidden = true; canvas.focus({ preventScroll: true }); }, { signal });
  q('.fo-r-trial').addEventListener('click', () => { startTrialMode(); persist(); canvas.focus({ preventScroll: true }); }, { signal });
  q('.fo-r-more').addEventListener('click', () => { result.hidden = true; finished = false; canvas.focus({ preventScroll: true }); }, { signal });

  // ---------- lifecycle plumbing ----------
  document.addEventListener('visibilitychange', () => { if (document.hidden && trial) markCasual(trial, 'hidden'); }, { signal });
  canvas.addEventListener('webglcontextlost', e => {
    if (disposed) return;
    e.preventDefault();
    lost = true; cancel(); input.clear();
    q('.fo-fallback').hidden = false;
    persist();
    context.setStatus('Graphics interrupted. Your progress is saved. Leave and reopen Femboy Frosthop.');
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

  let removeHook: (() => void) | undefined;
  if (import.meta.env.DEV) {
    let frames = 0, countId = 0;
    const count = () => { frames++; if (!disposed) countId = requestAnimationFrame(count); };
    countId = requestAnimationFrame(count);
    const api = {
      state: () => ({ mode, paused, finished, checkpoint: run.checkpoint, stage: stageNo(), deaths: run.deaths, steps: run.steps, x: run.player.x, y: run.player.y, z: run.player.z, grounded: run.player.grounded, support: run.player.support, yaw: input.state.yaw, progress: { ...progress, stars: [...progress.stars] }, trial: trial ? { ...trial } : null, panel: !panel.hidden, result: !result.hidden, suggest: !suggest.hidden }),
      /** Testing only: put the player on a checkpoint as if they had just respawned there (marks a trial casual). */
      teleport: (index: number) => { if (trial) markCasual(trial, 'restored'); progress.checkpoint = Math.max(progress.checkpoint, index); if (index >= LAST) progress.complete = true; newRun(index); },
      place: (x: number, y: number, z: number, yaw?: number) => { run.player.x = x; run.player.y = y; run.player.z = z; run.player.grounded = false; snapPrev(); if (yaw !== undefined) input.setLook(yaw, PITCH.rest); scene.snapCamera(); },
      look: (yaw: number, pitch: number = PITCH.rest) => input.setLook(yaw, pitch),
      stats: () => ({ ...scene.stats }),
      frames: () => frames,
      course: () => ({ checkpoints: course.checkpoints, stars: course.stars, stages: course.stages.map(s => ({ index: s.index, name: s.name, zone: s.zone })) }),
    };
    (window as unknown as { __frosthopTest?: typeof api }).__frosthopTest = api;
    removeHook = () => { cancelAnimationFrame(countId); delete (window as unknown as { __frosthopTest?: unknown }).__frosthopTest; };
  }

  applyOutfit();
  newRun(0);
  context.setStatus('Hop from gift to gift. Reach each checkpoint pad.');

  const instance: GameInstance = {
    openMenu() { openPanel(); },
    dismissMenu() { return closePanel(); },
    pause() {
      if (disposed || paused) return;
      paused = true;
      if (trial) markCasual(trial, document.hidden ? 'hidden' : 'paused');
      cancel(); input.clear();
    },
    resume() {
      if (disposed || lost || !paused) return;
      paused = false;
      last = 0;
      schedule();
    },
    restart() {
      if (disposed || lost) return false;
      if (mode === 'trial') startTrialMode();
      else startCampaign(run.checkpoint);
      if (paused) draw(0);
      return true;
    },
    serialize() {
      return writeSnapshot(progress, mode, mode === 'trial' && trial ? trial.checkpoint : run.checkpoint, trial, now());
    },
    restore(value) {
      if (disposed) return;
      const snap = readSnapshot(value, course);
      if (!snap) return;
      progress = snap.progress;
      applyOutfit();
      if (snap.mode === 'trial' && snap.trial) {
        mode = 'trial';
        newRun(snap.at);
        trial = snap.trial;
        trial.startAt = now();
        if (snap.at > 0) run.startCrossed = true;
      } else {
        mode = 'campaign'; trial = null;
        newRun(snap.at);
      }
      const st = course.stages[stageNo() - 1];
      context.setStatus(`Welcome back: stage ${st.index}, ${st.name}.`);
      if (!frameId) draw(0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel(); clearTimeout(toastTimer);
      abort.abort();
      resize.disconnect();
      input.dispose();
      removeHook?.();
      scene.dispose();
      root.remove();
    },
  };
  schedule();
  void COURSE_VERSION; void ZONES;
  return instance;
}

const game: GameModule = Object.freeze({
  id: ID,
  title: 'Femboy Frosthop',
  cover: 'game-art/femboy-obby/cover.svg',
  rules: 'Femboy Frosthop is a Christmas obby: a 3D obstacle course of 30 stages across six zones (Giftwrap Gardens, Candy Cane Catwalk, Cozy Knit Workshop, Peppermint Ice Rink, Ornament Skyway and North Pole Runway). Hop across gifts, beams, moving lifts and trays, conveyor belts, slippery ice, crumbling cookies and spring pads, and dodge striped sweeper arms and rolling snowballs. Each stage ends on a broad checkpoint pad with a mint emblem; landing on it saves your place, and a fall or a hazard puts you back on your last checkpoint straight away. Every stage hides one optional star; stars never block your way. The first checkpoint gives you a ribbon bow, each cleared zone unlocks a new outfit for your wardrobe, and all 30 stars unlock one more. Gentle help, in the wardrobe panel, slows every hazard and moving platform. Finish the campaign to open the Time Trial: a fresh run from the start line, timed from crossing the line to the final checkpoint, with the clock running through falls. Pausing, hiding the tab, restoring a save or using gentle help makes that run casual, and only ranked runs reach the leaderboard (faster is better). Desktop: W A S D or the arrow keys move, Space jumps, drag with the mouse or trackpad to look around, Q and E turn the camera and C recentres it. Touch: drag on the left to move, drag on the right to look, and tap Jump. Esc opens Study Mode as usual.',
  mount,
});
export default game;
