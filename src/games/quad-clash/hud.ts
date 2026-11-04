/** DOM heads-up display for Quad Clash: crosshair, health, ammo, grenades, streaks, timer and scores, kill feed,
 * hit markers, damage direction, scope, name tag, toasts, the scoreboard and the respawn panel with loadout swap.
 * It writes text only when it changes. */
import { BODY, HOUSES, MAX_GRENADES, PRIMARIES, STREAKS, WEAPONS, type PrimaryId } from './config';
import { modeOf, mapOf, standings } from './sim';
import { weaponOf, type Fighter, type Match } from './state';

export interface Hud {
  readonly root: HTMLElement;
  update(m: Match, o: { spread: number; ads: number; scoped: boolean; aimName: string; aimFriendly: boolean; damageDir: number | null; board: boolean; dt: number; reduced: boolean }): void;
  hitmarker(kill: boolean, head: boolean): void;
  hurt(angle: number, amount: number): void;
  feed(text: string, mine: boolean): void;
  toast(title: string, sub?: string): void;
  reset(): void;
  onLoadout(handler: (id: PrimaryId) => void): void;
}

const FEED_LIMIT = 5;
const fmtTime = (s: number) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function createHud(parent: HTMLElement, signal: AbortSignal): Hud {
  const root = document.createElement('div');
  root.className = 'qc-hud';
  root.innerHTML = `
  <div class="qc-status" aria-hidden="true">
    <div class="qc-mode"><span class="qc-mode-name"></span><span class="qc-timer">5:00</span></div>
    <div class="qc-scores"></div>
    <div class="qc-zone" hidden></div>
  </div>
  <ol class="qc-feed" aria-hidden="true"></ol>
  <div class="qc-damage" aria-hidden="true"><div class="qc-vignette"></div><div class="qc-arc"></div></div>
  <div class="qc-scope" aria-hidden="true" hidden><div class="qc-scope-ring"></div></div>
  <div class="qc-cross" aria-hidden="true"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div>
  <div class="qc-hit" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
  <div class="qc-name" aria-hidden="true"></div>
  <div class="qc-toast" aria-hidden="true"><strong></strong><span></span></div>
  <div class="qc-vitals" aria-hidden="true">
    <div class="qc-health"><div class="qc-health-fill"></div><span class="qc-health-num">100</span></div>
    <div class="qc-streak"></div>
    <div class="qc-buffs"></div>
  </div>
  <div class="qc-weapon" aria-hidden="true">
    <div class="qc-weapon-name"></div>
    <div class="qc-ammo"><span class="qc-mag">30</span><span class="qc-reserve">/ 120</span></div>
    <div class="qc-reload"><i></i></div>
    <div class="qc-nades"></div>
  </div>
  <div class="qc-board" hidden><table><thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col">Elims</th><th scope="col">Falls</th><th scope="col">Points</th></tr></thead><tbody></tbody></table></div>
  <div class="qc-dead" hidden>
    <p class="qc-dead-title">Eliminated</p>
    <p class="qc-dead-by"></p>
    <p class="qc-dead-count">Back in <span>3</span></p>
    <p class="qc-dead-pick">Next life (keys 1–7):</p>
    <div class="qc-dead-guns" role="group" aria-label="Weapon for your next life"></div>
  </div>`;
  parent.append(root);
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const el = {
    mode: q('.qc-mode-name'), timer: q('.qc-timer'), scores: q('.qc-scores'), zone: q('.qc-zone'), feed: q('.qc-feed'),
    vignette: q('.qc-vignette'), arc: q('.qc-arc'), scope: q('.qc-scope'), cross: q('.qc-cross'), hit: q('.qc-hit'), name: q('.qc-name'),
    toast: q('.qc-toast'), toastTitle: q('.qc-toast strong'), toastSub: q('.qc-toast span'),
    healthFill: q('.qc-health-fill'), healthNum: q('.qc-health-num'), health: q('.qc-health'), streak: q('.qc-streak'), buffs: q('.qc-buffs'),
    weaponName: q('.qc-weapon-name'), mag: q('.qc-mag'), reserve: q('.qc-reserve'), reload: q('.qc-reload'), reloadBar: q('.qc-reload i'), nades: q('.qc-nades'),
    board: q('.qc-board'), boardBody: q('.qc-board tbody'), dead: q('.qc-dead'), deadBy: q('.qc-dead-by'), deadCount: q('.qc-dead-count span'), deadGuns: q('.qc-dead-guns'),
  };
  const cache = new Map<string, string>();
  const set = (key: string, node: HTMLElement, text: string) => { if (cache.get(key) !== text) { cache.set(key, text); node.textContent = text; } };
  const html = (key: string, node: HTMLElement, value: string) => { if (cache.get(key) !== value) { cache.set(key, value); node.innerHTML = value; } };
  const style = (key: string, node: HTMLElement, prop: string, value: string) => { if (cache.get(key) !== value) { cache.set(key, value); node.style.setProperty(prop, value); } };
  const flag = (key: string, node: HTMLElement, hidden: boolean) => { const v = String(hidden); if (cache.get(key) !== v) { cache.set(key, v); node.hidden = hidden; } };

  let hitT = 0, hurtT = 0, toastT = 0, loadout: (id: PrimaryId) => void = () => {};
  let deadPrimary: PrimaryId | null = null;
  let clock = 0;
  const feedItems: { li: HTMLLIElement; t: number }[] = [];

  for (const id of PRIMARIES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'qc-gun-chip'; b.dataset.weapon = id;
    b.innerHTML = `<span>${WEAPONS[id].name}</span><small>${WEAPONS[id].role}</small>`;
    b.addEventListener('click', () => loadout(id), { signal });
    el.deadGuns.append(b);
  }

  function scoreLine(m: Match, you: Fighter) {
    const mode = modeOf(m);
    if (mode.teams) {
      const yours = you.team;
      return HOUSES.map((h, i) => `<span class="qc-team qc-team-${i}${i === yours ? ' qc-yours' : ''}"><b>${h.mark}</b>${h.name} <strong>${m.teamScores[i]}</strong></span>`).join('') + `<span class="qc-goal">to ${mode.limit}</span>`;
    }
    const top = standings(m)[0];
    const lead = top.id === 0 ? 'You lead' : `${escape(top.name)} ${top.kills}`;
    return `<span class="qc-team qc-yours">You <strong>${you.kills}</strong></span><span class="qc-team">${lead}</span><span class="qc-goal">to ${mode.limit}</span>`;
  }

  const hud: Hud = {
    root,
    update(m, o) {
      const you = m.fighters[0], mode = modeOf(m), wpn = weaponOf(you);
      set('mode', el.mode, mode.name);
      set('timer', el.timer, fmtTime(mode.duration - m.t));
      html('scores', el.scores, scoreLine(m, you));
      if (m.settings.mode === 'quad') {
        const z = mapOf(m).zones[m.zoneIndex];
        const owner = m.zoneOwner >= 0 ? `${HOUSES[m.zoneOwner].mark} ${HOUSES[m.zoneOwner].name} holds it` : m.zoneOwner === -2 ? 'Contested!' : 'Unclaimed';
        set('zone', el.zone, `${z.name} · ${owner} · moves in ${fmtTime(m.zoneNext - m.t)}`);
        el.zone.dataset.owner = String(m.zoneOwner);
        flag('zoneh', el.zone, false);
      } else flag('zoneh', el.zone, true);
      // Vitals.
      const hp = Math.max(0, Math.ceil(you.health));
      set('hp', el.healthNum, String(hp));
      style('hpw', el.healthFill, 'width', `${(hp / BODY.maxHealth) * 100}%`);
      el.health.dataset.low = String(hp <= 35);
      html('streak', el.streak, STREAKS.map(s => `<i class="${you.streak >= s.kills ? 'on' : ''}" title="${s.name}"></i>`).join('') + `<span>${you.streak} streak</span>`);
      const buffs = [m.t < you.shieldUntil ? `<span class="qc-buff qc-shield">Shield ${Math.ceil(you.shieldUntil - m.t)}</span>` : '', m.t < you.boostUntil ? `<span class="qc-buff qc-boost">Pass ${Math.ceil(you.boostUntil - m.t)}</span>` : '', m.t < you.protectUntil ? '<span class="qc-buff">Spawn shield</span>' : ''].join('');
      html('buffs', el.buffs, buffs);
      // Weapon.
      set('wname', el.weaponName, wpn.name);
      set('mag', el.mag, String(you.mag[you.slot]));
      set('res', el.reserve, you.slot === 1 ? '/ ∞' : `/ ${you.reserve}`);
      el.mag.dataset.low = String(you.mag[you.slot] <= Math.ceil(wpn.mag * 0.25));
      const reloading = you.reloadEnd > 0;
      flag('rel', el.reload, !reloading);
      if (reloading) style('relw', el.reloadBar, 'width', `${Math.min(100, ((m.t - you.reloadStart) / Math.max(0.01, you.reloadEnd - you.reloadStart)) * 100)}%`);
      html('nades', el.nades, Array.from({ length: MAX_GRENADES }, (_, i) => `<i class="${i < you.grenades ? 'on' : ''}"></i>`).join(''));
      // Crosshair and scope.
      const gap = Math.round(6 + o.spread * 420);
      style('gap', el.cross, '--gap', `${gap}px`);
      flag('crossh', el.cross, !you.alive || o.scoped);
      flag('scope', el.scope, !o.scoped);
      set('name', el.name, o.aimName);
      el.name.dataset.friendly = String(o.aimFriendly);
      // Timed flashes and the kill feed's fade.
      clock += o.dt;
      for (let i = feedItems.length - 1; i >= 0; i--) {
        const age = clock - feedItems[i].t;
        if (age > 5.2 || !feedItems[i].li.isConnected) { feedItems[i].li.remove(); feedItems.splice(i, 1); }
        else if (age > 4.5) feedItems[i].li.classList.add('qc-fade');
      }
      hitT = Math.max(0, hitT - o.dt); hurtT = Math.max(0, hurtT - o.dt); toastT = Math.max(0, toastT - o.dt);
      style('hit', el.hit, 'opacity', hitT > 0 ? String(Math.min(1, hitT * 6)) : '0');
      style('vig', el.vignette, 'opacity', String(Math.max(hurtT * 1.6, you.alive ? Math.max(0, (40 - you.health) / 60) : 0)));
      style('arc', el.arc, 'opacity', String(Math.min(1, hurtT * 2)));
      style('toast', el.toast, 'opacity', toastT > 0 ? String(Math.min(1, toastT * 3)) : '0');
      // Scoreboard.
      const showBoard = o.board || m.over;
      flag('board', el.board, !showBoard);
      if (showBoard) {
        const rows = standings(m).map((f, i) => {
          const tag = modeOf(m).teams ? `<b class="qc-mark qc-team-${f.team}">${HOUSES[f.team].mark}</b>` : '';
          return `<tr class="${f.id === 0 ? 'qc-me' : ''}"><td>${i + 1}</td><td>${tag}${escape(f.name)}</td><td>${f.kills}</td><td>${f.deaths}</td><td>${f.score}</td></tr>`;
        }).join('');
        html('rows', el.boardBody, rows);
      }
      // Respawn panel.
      const dead = !you.alive && !m.over;
      flag('dead', el.dead, !dead);
      if (dead) {
        set('dcount', el.deadCount, String(Math.max(1, Math.ceil(you.respawnAt - m.t))));
        const killer = m.fighters[you.lastAttacker];
        set('dby', el.deadBy, killer && killer.id !== 0 ? `by ${killer.name} (${WEAPONS[killer.slot === 0 ? killer.primary : 'pencil'].name})` : 'Watch your step!');
        if (deadPrimary !== you.nextPrimary) {
          deadPrimary = you.nextPrimary;
          for (const b of el.deadGuns.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.weapon === you.nextPrimary));
        }
      }
    },
    hitmarker(kill, head) {
      hitT = kill ? 0.35 : 0.18;
      el.hit.dataset.kind = kill ? 'kill' : head ? 'head' : 'body';
    },
    hurt(angle, amount) {
      hurtT = Math.min(0.9, hurtT + 0.25 + amount / 120);
      style('arcr', el.arc, 'transform', `translate(-50%,-50%) rotate(${angle}rad)`);
    },
    feed(text, mine) {
      const li = document.createElement('li');
      li.textContent = text;
      if (mine) li.className = 'qc-mine';
      el.feed.prepend(li);
      while (el.feed.children.length > FEED_LIMIT) el.feed.lastElementChild!.remove();
      feedItems.push({ li, t: clock });
    },
    toast(title, sub = '') {
      el.toastTitle.textContent = title;
      el.toastSub.textContent = sub;
      toastT = 2.4;
    },
    reset() {
      el.feed.textContent = '';
      feedItems.length = 0;
      hitT = hurtT = toastT = 0;
      cache.clear();
      deadPrimary = null;
    },
    onLoadout(handler) { loadout = handler; },
  };
  return hud;
}

function escape(s: string) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
