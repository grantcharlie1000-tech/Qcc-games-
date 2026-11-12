/** The heads-up display: score and clock, who is alive, the objective, ammunition and gadgets, prompts, the kill
 * feed, hit and damage feedback, the preparation screen with kits and a floor plan, and the scoreboard. Plain DOM
 * over the canvas; text is only touched when it changes. */
import { ATK, CELL, KITS, ROLE_NAMES, SQUADS, WEAPONS, type Role } from './config';
import { MAP } from './map';
import { kitOf, roleOf, weaponOf, type Match } from './state';

export interface Marker { x: number; y: number; front: boolean; label: string; kind: 'site' | 'device' | 'mate'; sub?: string }
export interface HudView {
  m: Match; self: number; watch: number;
  /** Crosshair gap in pixels, and how far the sights are raised (0 to 1). */
  gap: number; ads: number; scoped: boolean;
  prompt: string; progress: number;
  room: string; board: boolean; markers: Marker[]; touch: boolean; waiting: string; dt: number;
}
export interface Hud {
  update(v: HudView): void;
  kill(by: string, on: string, weapon: string, head: boolean, bySquad: number, onSquad: number, mine: boolean): void;
  note(text: string): void;
  hitmarker(kill: boolean, head: boolean): void;
  hurt(angle: number, amount: number): void;
  toast(title: string, sub?: string): void;
  banner(title: string, sub: string, tone: 'good' | 'bad' | 'plain', seconds: number): void;
  reset(): void;
  onKit(cb: (kit: number) => void): void;
  /** The performance readout in the corner: its lines, or null to hide it; `software` flags a CPU rasteriser. */
  perf(lines: string[] | null, software: boolean): void;
  readonly root: HTMLElement;
}

const TEMPLATE = `
<div class="bl-top">
  <div class="bl-squad bl-s0"><span class="bl-pips"></span><b class="bl-wins">0</b></div>
  <div class="bl-clock"><span class="bl-phase"></span><b class="bl-time">0:00</b><span class="bl-round"></span></div>
  <div class="bl-squad bl-s1"><b class="bl-wins">0</b><span class="bl-pips"></span></div>
</div>
<div class="bl-objective" hidden><span></span><i><b></b></i></div>
<div class="bl-feed" aria-hidden="true"></div>
<div class="bl-cross" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></div>
<div class="bl-hit" aria-hidden="true"></div>
<div class="bl-scope" hidden aria-hidden="true"><i></i></div>
<div class="bl-prompt" hidden><span class="bl-prompt-text"></span><i><b></b></i></div>
<div class="bl-vitals"><span class="bl-role"></span><div class="bl-hp"><i></i><b>100</b></div><span class="bl-room"></span></div>
<div class="bl-gear"><span class="bl-gun"></span><span class="bl-ammo"><b>0</b><i>/ 0</i></span><div class="bl-gadgets"></div></div>
<div class="bl-markers" aria-hidden="true"></div>
<div class="bl-hurt" aria-hidden="true"></div><div class="bl-dir" aria-hidden="true"><i></i></div>
<div class="bl-watch" hidden></div>
<div class="bl-toast" role="status"></div>
<div class="bl-banner" hidden><b></b><span></span></div>
<div class="bl-prep" hidden>
  <div class="bl-prep-head"><b class="bl-prep-role"></b><span class="bl-prep-task"></span></div>
  <div class="bl-kits" role="group" aria-label="Choose a kit"></div>
  <div class="bl-plan" aria-hidden="true"></div>
</div>
<div class="bl-board" hidden><table><thead><tr><th>Fighter</th><th>Kit</th><th>Elims</th><th>Falls</th><th>Points</th></tr></thead><tbody></tbody></table></div>`;

/** A floor plan of the annex for the preparation screen. */
function plan(spawn: number, attacker: boolean): string {
  const b = MAP.bounds, w = b.x1 - b.x0, h = b.z1 - b.z0, B = MAP.building;
  let s = `<svg viewBox="${b.x0} ${b.z0} ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><rect x="${b.x0}" y="${b.z0}" width="${w}" height="${h}" fill="#1c2227"/>`;
  s += `<rect x="${B.x0}" y="${B.z0}" width="${B.x1 - B.x0}" height="${B.z1 - B.z0}" fill="#2d363d"/>`;
  for (const site of MAP.sites) s += `<rect x="${site.x0}" y="${site.z0}" width="${site.x1 - site.x0}" height="${site.z1 - site.z0}" fill="#e0b02033"/><text x="${(site.x0 + site.x1) / 2}" y="${(site.z0 + site.z1) / 2 + 1.2}" font-size="3.6" font-weight="700" fill="#f0c040" text-anchor="middle">${site.id}</text>`;
  for (const box of MAP.boxes) if (box.solid && box.draw && box.mat !== 'brick' && box.mat !== 'plaster' && box.mat !== 'trim' && box.y1 > 0.6 && box.x0 > b.x0 && box.x1 < b.x1 && box.z0 > b.z0 && box.z1 < b.z1) s += `<rect x="${box.x0}" y="${box.z0}" width="${box.x1 - box.x0}" height="${box.z1 - box.z0}" fill="#46525b"/>`;
  s += `<rect x="${B.x0}" y="${B.z0}" width="${B.x1 - B.x0}" height="${B.z1 - B.z0}" fill="none" stroke="#c9d2d8" stroke-width="0.45"/>`;
  for (const p of MAP.panels) {
    const a = p.u0, e = p.u0 + p.cols * CELL, color = p.kind === 'wall' ? '#8fa0ab' : p.closed ? '#d08a3c' : '#2d363d', sw = p.kind === 'wall' ? 0.22 : 0.5;
    s += p.axis === 'x' ? `<line x1="${a}" y1="${p.pos}" x2="${e}" y2="${p.pos}" stroke="${color}" stroke-width="${sw}"/>` : `<line x1="${p.pos}" y1="${a}" x2="${p.pos}" y2="${e}" stroke="${color}" stroke-width="${sw}"/>`;
  }
  for (const r of MAP.rooms.slice(0, 8)) if (r.name !== 'Lab' && r.name !== 'Archive') s += `<text x="${(r.x0 + r.x1) / 2}" y="${(r.z0 + r.z1) / 2 + 0.5}" font-size="1.5" fill="#9fb0bb" text-anchor="middle">${r.name}</text>`;
  if (attacker) { const sp = MAP.attackSpawns[spawn]?.points[2]; if (sp) s += `<circle cx="${sp.x}" cy="${sp.z}" r="1.6" fill="#ffffff"/><text x="${sp.x}" y="${sp.z - 2.4}" font-size="1.7" font-weight="700" fill="#ffffff" text-anchor="middle">YOUR SQUAD</text>`; }
  return `${s}</svg>`;
}

const clock = (t: number) => { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function createHud(parent: HTMLElement, signal: AbortSignal): Hud {
  const root = document.createElement('div');
  root.className = 'bl-hud'; root.hidden = true; root.innerHTML = TEMPLATE;
  parent.append(root);
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const cache = new Map<HTMLElement, string | number>();
  /** Numbers shown as text, and keys of composed values: compared as numbers, so no string is built unless it changed. */
  const num = (el: HTMLElement, n: number) => { if (cache.get(el) !== n) { cache.set(el, n); el.textContent = String(n); } };
  const keys = new Map<unknown, number>();
  const changed = (what: unknown, k: number) => { if (keys.get(what) === k) return false; keys.set(what, k); return true; };
  const attrs = new Map<HTMLElement, Record<string, string>>();
  const text = (el: HTMLElement, v: string) => { if (cache.get(el) !== v) { cache.set(el, v); el.textContent = v; } };
  const attr = (el: HTMLElement, k: string, v: string) => { let a = attrs.get(el); if (!a) attrs.set(el, a = {}); if (a[k] !== v) { a[k] = v; el.dataset[k] = v; } };
  const show = (el: HTMLElement, on: boolean) => { if (el.hidden === on) el.hidden = !on; };
  const el = {
    wins: [q('.bl-s0 .bl-wins'), q('.bl-s1 .bl-wins')], pips: [q('.bl-s0 .bl-pips'), q('.bl-s1 .bl-pips')], squads: [q('.bl-s0'), q('.bl-s1')],
    phase: q('.bl-phase'), time: q('.bl-time'), round: q('.bl-round'), objective: q('.bl-objective'), objText: q('.bl-objective span'), objBar: q('.bl-objective b'),
    feed: q('.bl-feed'), cross: q('.bl-cross'), hit: q('.bl-hit'), scope: q('.bl-scope'), prompt: q('.bl-prompt'), promptText: q('.bl-prompt-text'), promptBar: q('.bl-prompt b'),
    role: q('.bl-role'), hpBar: q('.bl-hp i'), hp: q('.bl-hp b'), room: q('.bl-room'), gun: q('.bl-gun'), mag: q('.bl-ammo b'), reserve: q('.bl-ammo i'), gadgets: q('.bl-gadgets'),
    markers: q('.bl-markers'), hurt: q('.bl-hurt'), dir: q('.bl-dir'), watch: q('.bl-watch'), toast: q('.bl-toast'), banner: q('.bl-banner'),
    prep: q('.bl-prep'), prepRole: q('.bl-prep-role'), prepTask: q('.bl-prep-task'), kits: q('.bl-kits'), plan: q('.bl-plan'), board: q('.bl-board'), rows: q('.bl-board tbody'),
    vitals: q('.bl-vitals'), gear: q('.bl-gear'),
  };
  const markerEls: HTMLElement[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  signal.addEventListener('abort', () => { for (const id of timers) clearTimeout(id); timers.clear(); });
  let kitCb: (kit: number) => void = () => {}, hurtLevel = 0, dirLife = 0, hitLife = 0, toastLife = 0, bannerLife = 0, boardAt = 0;
  el.kits.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-kit]'); if (b) kitCb(Number(b.dataset.kit)); }, { signal });

  function gadgets(role: Role, charges: number, grenades: number, reinforcements: number, touch: boolean) {
    if (!changed(el.gadgets, (((role * 64 + charges) * 64 + grenades) * 64 + reinforcements) * 2 + (touch ? 1 : 0))) return;
    const item = (k: string, name: string, n: number) => `<span class="bl-gadget" data-empty="${n <= 0}">${touch ? '' : `<kbd>${k}</kbd>`}${name}<b>${n}</b></span>`;
    el.gadgets.innerHTML = role === ATK ? item('B', 'Breach', charges) + item('G', 'Frag', grenades) : item('F', 'Reinforce', reinforcements) + item('G', 'Impact', grenades);
  }

  // The performance readout: small text in the top left corner, over everything.
  let perfEl: HTMLElement | null = null;
  return {
    root,
    onKit(cb) { kitCb = cb; },
    perf(lines, software) {
      if (!lines) { if (perfEl) perfEl.hidden = true; return; }
      if (!perfEl) {
        perfEl = document.createElement('div'); perfEl.className = 'bl-perf';
        perfEl.style.cssText = 'position:absolute;left:8px;top:8px;z-index:50;padding:4px 6px;border-radius:4px;background:rgba(0,0,0,0.6);color:#e8e8e8;font:11px/1.35 ui-monospace,monospace;white-space:pre;pointer-events:none';
        parent.append(perfEl);
      }
      perfEl.hidden = false;
      perfEl.innerHTML = lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('\n') + (software ? '\n<b style="color:#ff5a4f">software</b>' : '');
    },
    update(v) {
      const { m } = v, me = m.players[v.self], seen = m.players[v.watch] ?? me, live = m.phase !== 'lobby';
      show(root, live);
      if (!live) return;
      // Score, clock and who is alive.
      const mySquad = me ? me.squad : 0;
      for (let s = 0 as 0 | 1; s < 2; s++) { num(el.wins[s], m.wins[s]); attr(el.squads[s], 'role', s === m.attackers ? 'atk' : 'def'); attr(el.squads[s], 'mine', String(!!me && s === mySquad)); }
      let pk = m.attackers + 2;
      for (const p of m.players) pk = pk * 2 + (p.alive ? 1 : 0);
      if (changed(el.pips, pk + m.players.length * 1e6)) { for (const s of [0, 1] as const) el.pips[s].innerHTML = m.players.filter(p => p.squad === s).map(p => `<i data-alive="${p.alive}"></i>`).join(''); }
      text(el.phase, m.phase === 'prep' ? 'Preparation' : m.phase === 'action' ? 'Action' : m.phase === 'planted' ? 'Uplink armed' : m.phase === 'end' ? 'Round over' : 'Match over');
      if (changed(el.time, m.phase === 'over' ? -1 : Math.max(0, Math.ceil(m.t)))) text(el.time, m.phase === 'over' ? '–' : clock(m.t));
      attr(el.time, 'urgent', String((m.phase === 'action' && m.t < 30) || m.phase === 'planted'));
      if (changed(el.round, m.round)) text(el.round, `Round ${m.round} · first to 4`);
      const planted = m.phase === 'planted' && !!m.device;
      show(el.objective, planted);
      if (planted && m.device) {
        if (changed(el.objText, m.device.site)) text(el.objText, `Uplink armed in ${MAP.sites[m.device.site].name} (${MAP.sites[m.device.site].id})`);
        if (changed(el.objBar, m.t)) el.objBar.style.transform = `scaleX(${Math.max(0, Math.min(1, m.t / 40))})`;
      }
      // Own fighter (or the one being watched).
      const alive = !!seen && seen.alive, first = v.watch === v.self && alive;
      show(el.vitals, alive); show(el.gear, first);
      attr(el.cross, 'show', String(first && !v.scoped && m.phase !== 'end' && m.phase !== 'over'));
      show(el.scope, first && v.scoped);
      if (alive && seen) {
        const role = roleOf(m, seen);
        if (changed(el.role, (seen.squad * 8 + role) * 64 + seen.kit)) text(el.role, `${SQUADS[seen.squad].shape} ${ROLE_NAMES[role]} · ${kitOf(m, seen).name}`);
        attr(el.vitals, 'squad', seen.squad ? '1' : '0');
        num(el.hp, Math.ceil(seen.hp)); if (changed(el.hpBar, seen.hp)) el.hpBar.style.transform = `scaleX(${Math.max(0, seen.hp / 100)})`; attr(el.vitals, 'low', String(seen.hp <= 35));
        text(el.room, v.room);
        if (first) {
          const def = weaponOf(m, seen);
          text(el.gun, def.name);
          if (seen.reload > 0) text(el.mag, '··'); else num(el.mag, seen.mag[seen.slot]);
          if (changed(el.reserve, seen.reserve[seen.slot])) text(el.reserve, `/ ${seen.reserve[seen.slot]}`);
          attr(el.gear, 'low', String(seen.mag[seen.slot] <= def.mag * 0.25));
          gadgets(role, seen.charges, seen.grenades, seen.reinforcements, v.touch);
          const g = Math.round(Math.max(3, v.gap)), fade = Math.max(0, 1 - v.ads * 1.6);
          if (changed('gap', g)) el.cross.style.setProperty('--gap', `${g}px`);
          if (changed('fade', fade)) el.cross.style.setProperty('--fade', String(fade));
        }
      }
      show(el.prompt, !!v.prompt && first);
      if (v.prompt && first) { text(el.promptText, v.prompt); attr(el.prompt, 'busy', String(v.progress >= 0)); if (changed(el.promptBar, v.progress)) el.promptBar.style.transform = `scaleX(${Math.max(0, Math.min(1, v.progress))})`; }
      show(el.watch, !!v.waiting);
      if (v.waiting) text(el.watch, v.waiting);
      // Markers in the world.
      for (let i = 0; i < Math.max(markerEls.length, v.markers.length); i++) {
        let e = markerEls[i];
        const mk = v.markers[i];
        if (!e) { e = document.createElement('div'); e.className = 'bl-marker'; e.innerHTML = '<b></b><span></span>'; el.markers.append(e); markerEls[i] = e; }
        const on = !!mk && mk.front && mk.x > -0.05 && mk.x < 1.05 && mk.y > -0.05 && mk.y < 1.05;
        show(e, on);
        if (!on || !mk) continue;
        // Moved by at least what the transform shows (a hundredth of a percent).
        if (changed(e, Math.round(mk.x * 10000) * 100000 + Math.round(mk.y * 10000))) e.style.transform = `translate(${(mk.x * 100).toFixed(2)}cqw, ${(mk.y * 100).toFixed(2)}cqh)`;
        attr(e, 'kind', mk.kind); text(e.firstElementChild as HTMLElement, mk.label); text(e.lastElementChild as HTMLElement, mk.sub ?? '');
      }
      // Preparation screen.
      const prep = m.phase === 'prep' && !!me && me.alive;
      show(el.prep, prep);
      if (prep && me) {
        const role = roleOf(m, me);
        if (changed(el.prepRole, me.squad * 8 + role)) text(el.prepRole, `${SQUADS[me.squad].shape} ${SQUADS[me.squad].name} · ${ROLE_NAMES[role]}`);
        if (changed(el.prepTask, m.spawn * 8 + role)) text(el.prepTask, role === ATK ? `Plant the uplink in the Lab (A) or the Archive (B). You enter from the ${MAP.attackSpawns[m.spawn]?.name ?? 'yard'}.` : 'Reinforce walls, barricade doorways and take positions. Stop the uplink.');
        if (changed(el.kits, (role * 64 + me.kit) * 2 + (v.touch ? 1 : 0))) { el.kits.innerHTML = KITS[role].map((k, i) => `<button type="button" data-kit="${i}" aria-pressed="${i === me.kit}">${v.touch ? '' : `<kbd>${i + 1}</kbd>`}<b>${k.name}</b><span>${WEAPONS[k.primary].name} · ${WEAPONS[k.primary].cls}</span><small>${k.blurb}</small></button>`).join(''); }
        if (changed(el.plan, m.spawn * 8 + role)) { el.plan.innerHTML = plan(m.spawn, role === ATK); }
        attr(el.prep, 'role', role === ATK ? 'atk' : 'def');
      }
      // Scoreboard.
      show(el.board, v.board || m.phase === 'over');
      boardAt -= v.dt;
      if ((v.board || m.phase === 'over') && boardAt <= 0) {
        boardAt = 0.3;
        const rows = [...m.players].sort((a, b) => a.squad - b.squad || b.score - a.score);
        el.rows.innerHTML = rows.map(p => `<tr data-squad="${p.squad}" data-alive="${p.alive}" data-me="${p.id === v.self}"><td>${SQUADS[p.squad].shape} ${escape(p.name)}${p.bot ? ' <small>bot</small>' : ''}</td><td>${kitOf(m, p).name}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.score}</td></tr>`).join('');
      }
      // Fading feedback.
      if (hurtLevel > 0) { hurtLevel = Math.max(0, hurtLevel - v.dt * 0.9); keys.delete(el.hurt); el.hurt.style.opacity = String(Math.min(0.85, hurtLevel)); }
      if (dirLife > 0) { dirLife -= v.dt; el.dir.style.opacity = String(Math.max(0, Math.min(1, dirLife * 1.5))); }
      if (hitLife > 0) { hitLife -= v.dt; if (hitLife <= 0) attr(el.hit, 'on', 'false'); }
      if (toastLife > 0) { toastLife -= v.dt; if (toastLife <= 0) attr(el.toast, 'on', 'false'); }
      if (bannerLife > 0) { bannerLife -= v.dt; if (bannerLife <= 0) show(el.banner, false); }
      const lowHp = alive && seen && seen.hp <= 35 && v.watch === v.self ? 0.35 : 0;
      if (hurtLevel < lowHp && changed(el.hurt, lowHp)) el.hurt.style.opacity = String(lowHp);
    },
    kill(by, on, weapon, head, bySquad, onSquad, mine) {
      const row = document.createElement('div');
      row.className = 'bl-kill'; row.dataset.mine = String(mine);
      row.innerHTML = `<b data-squad="${bySquad}">${escape(by)}</b><span>${escape(weapon)}${head ? ' · head' : ''}</span><b data-squad="${onSquad}">${escape(on)}</b>`;
      el.feed.prepend(row);
      while (el.feed.children.length > 5) el.feed.lastElementChild!.remove();
      later(() => row.remove(), 6500);
    },
    note(t) {
      const row = document.createElement('div'); row.className = 'bl-kill bl-note'; row.textContent = t;
      el.feed.prepend(row);
      while (el.feed.children.length > 5) el.feed.lastElementChild!.remove();
      later(() => row.remove(), 6500);
    },
    hitmarker(kill, head) { el.hit.dataset.on = 'true'; el.hit.dataset.kill = String(kill); el.hit.dataset.head = String(head); hitLife = kill ? 0.4 : 0.16; },
    hurt(angle, amount) { hurtLevel = Math.min(1, hurtLevel + amount / 60 + 0.25); el.dir.style.transform = `rotate(${angle}rad)`; dirLife = 1.1; },
    toast(title, sub = '') { el.toast.innerHTML = `<b>${escape(title)}</b>${sub ? `<span>${escape(sub)}</span>` : ''}`; el.toast.dataset.on = 'true'; toastLife = 2.6; },
    banner(title, sub, tone, seconds) { el.banner.hidden = false; el.banner.dataset.tone = tone; (el.banner.firstElementChild as HTMLElement).textContent = title; (el.banner.lastElementChild as HTMLElement).textContent = sub; bannerLife = seconds; },
    reset() { el.feed.replaceChildren(); hurtLevel = dirLife = hitLife = toastLife = bannerLife = 0; el.hurt.style.opacity = '0'; el.dir.style.opacity = '0'; el.banner.hidden = true; el.toast.dataset.on = 'false'; el.hit.dataset.on = 'false'; keys.clear(); },
  };
}
function escape(s: string) { return s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); }
