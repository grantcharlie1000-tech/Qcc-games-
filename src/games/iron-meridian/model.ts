import { BUILDINGS, EQUIPMENT, FOCUSES, TECHS, TEMPLATES } from './content';
import { NATIONS, PROVINCES, SEA_LINKS } from './map-data';
import type { Building, Campaign, Command, CommandResult, Division, Equipment, NationId, NationState, UnitType } from './types';

const EQUIPMENT_IDS = Object.keys(EQUIPMENT) as Equipment[];
const UNIT_IDS = Object.keys(TEMPLATES) as UnitType[];
const BUILDING_IDS = Object.keys(BUILDINGS) as Building[];
const MAX_STOCK = 1_000_000;
const MAX_UNITS = 360;
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const nationId = (n: unknown): n is NationId => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 6;
const provinceId = (n: unknown): n is number => Number.isInteger(n) && Number(n) >= 0 && Number(n) < PROVINCES.length;
const has = (n: NationState, tech: string) => n.techs.includes(tech);
const focused = (n: NationState, focus: string) => n.focuses.includes(focus);
const seaKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
const SEA = new Set(SEA_LINKS.map(([a, b]) => seaKey(a, b)));
const seaNeighbors = PROVINCES.map(p => SEA_LINKS.flatMap(([a, b]) => a === p.id ? [b] : b === p.id ? [a] : []));
const adjacent = (a: number, b: number) => PROVINCES[a].neighbors.includes(b) || SEA.has(seaKey(a, b));
const links = (p: number) => [...PROVINCES[p].neighbors, ...seaNeighbors[p]];
const terrainSpeed = { plains: 1, forest: 0.72, hills: 0.7, mountain: 0.45, city: 0.8 };
const terrainDefense = { plains: 1, forest: 1.25, hills: 1.3, mountain: 1.65, city: 1.45 };

function random(c: Campaign): number {
  c.seed = (Math.imul(c.seed, 1664525) + 1013904223) >>> 0;
  return c.seed / 4294967296;
}

function dispatch(c: Campaign, text: string, kind: Campaign['dispatches'][number]['kind'] = 'info'): void {
  c.dispatches.unshift({ day: c.day, text, kind });
  if (c.dispatches.length > 80) c.dispatches.length = 80;
}

export function atWar(c: Campaign, a: NationId, b: NationId): boolean {
  return c.wars.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function friendly(c: Campaign, a: NationId, b: NationId): boolean {
  return a === b || c.nations[a].allies.includes(b);
}

export function industry(c: Campaign, id: NationId): { civilian: number; military: number; dockyard: number; steel: number; oil: number } {
  const result = { civilian: 0, military: 0, dockyard: 0, steel: 0, oil: 0 };
  for (const p of PROVINCES) {
    const state = c.provinces[p.id];
    if (state.owner !== id) continue;
    result.civilian += state.civilian;
    result.military += state.military;
    result.dockyard += state.dockyard;
    result.steel += p.steel;
    result.oil += p.oil;
  }
  const partner = c.nations[id].trade;
  if (partner !== null && !c.nations[partner].capitulated && !atWar(c, id, partner)) {
    result.civilian = Math.max(0, result.civilian - 1);
    result.steel += 6;
    result.oil += 3;
  }
  return result;
}

export function availableFactories(c: Campaign, id: NationId): number {
  const n = c.nations[id];
  return Math.max(0, industry(c, id).military - n.allocation.rifles - n.allocation.artillery - n.allocation.tanks - n.allocation.aircraft);
}

export function capitalOf(c: Campaign, id: NationId): number | null {
  const homeCapital = PROVINCES.find(p => p.home === id && p.capital);
  if (homeCapital && c.provinces[homeCapital.id].owner === id) return homeCapital.id;
  let candidate: number | null = null;
  for (const p of PROVINCES) {
    if (c.provinces[p.id].owner === id && (candidate === null || p.vp > PROVINCES[candidate].vp)) candidate = p.id;
  }
  return candidate;
}

function navalStrength(c: Campaign, id: NationId): number {
  const n = c.nations[id];
  if (n.capitulated || n.navalMission === 'reserve' || n.fuel < 0.5) return 0;
  return n.stock.ships * (has(n, 'hull-design') ? 1.25 : 1) * (focused(n, 'sea-lanes') ? 1.2 : 1);
}

function convoyFactor(c: Campaign, id: NationId): number {
  const n = c.nations[id];
  let raiders = 0;
  let escorts = navalStrength(c, id);
  for (const other of c.nations) {
    if (other.id !== id && friendly(c, id, other.id)) escorts += navalStrength(c, other.id) * 0.5;
    if (atWar(c, id, other.id) && other.navalMission === 'raiding') raiders += navalStrength(c, other.id);
  }
  const disruption = raiders / (escorts + raiders + 1);
  return clamp(1 - disruption * (has(n, 'convoy-escorts') ? 0.4 : 0.8), 0.2, 1);
}

function canSail(c: Campaign, id: NationId, from: number, to: number): boolean {
  const n = c.nations[id];
  return PROVINCES[from].port && PROVINCES[to].port && n.navalMission === 'patrol' && n.stock.ships >= 1 && n.fuel >= 1
    && friendly(c, id, c.provinces[from].owner) && convoyFactor(c, id) >= 0.35;
}

function supplyMap(c: Campaign, id: NationId): number[] {
  const values = PROVINCES.map(() => 0.08);
  const capital = capitalOf(c, id);
  if (capital === null || c.nations[id].capitulated) return values.map(() => 0);
  const distance = PROVINCES.map(() => Infinity);
  distance[capital] = 0;
  const queue = [capital];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const here = queue[cursor];
    for (const next of links(here)) {
      if (!friendly(c, id, c.provinces[next].owner)) continue;
      const sea = SEA.has(seaKey(here, next));
      if (sea && (!canSail(c, id, here, next) || !friendly(c, id, c.provinces[next].owner))) continue;
      const step = sea ? 5 / convoyFactor(c, id) : 1;
      if (distance[next] <= distance[here] + step) continue;
      distance[next] = distance[here] + step;
      queue.push(next);
    }
  }
  const demand = PROVINCES.map(() => 0);
  for (const d of c.divisions) if (friendly(c, id, d.nation)) demand[d.province] += TEMPLATES[d.type].supply;
  const n = c.nations[id];
  for (const p of PROVINCES) {
    if (!friendly(c, id, c.provinces[p.id].owner)) { values[p.id] = 0; continue; }
    if (!Number.isFinite(distance[p.id])) continue;
    const throughput = (1 - distance[p.id] * 0.045 + c.provinces[p.id].infrastructure * 0.055)
      * (has(n, 'logistics') ? 1.2 : 1) * (focused(n, 'sea-lanes') && seaNeighbors[p.id].length ? 1.1 : 1);
    values[p.id] = clamp(throughput / (1 + Math.max(0, demand[p.id] - 3) * 0.2), 0.08, 1);
  }
  return values;
}

export function supplyAt(c: Campaign, nation: NationId, province: number): number {
  return nationId(nation) && provinceId(province) ? supplyMap(c, nation)[province] : 0;
}

export function supplyLevels(c: Campaign, nation: NationId): number[] {
  return nationId(nation) ? supplyMap(c, nation) : PROVINCES.map(() => 0);
}

function routeTree(c: Campaign, id: NationId, from: number): { previous: number[]; distance: number[] } {
  const previous = PROVINCES.map(() => -1);
  const distance = PROVINCES.map(() => Infinity);
  previous[from] = from;
  distance[from] = 0;
  const queue = [from];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const here = queue[cursor];
    for (const next of links(here)) {
      if (previous[next] !== -1) continue;
      const owner = c.provinces[next].owner;
      if (!friendly(c, id, owner) && !atWar(c, id, owner)) continue;
      if (SEA.has(seaKey(here, next)) && !canSail(c, id, here, next)) continue;
      previous[next] = here;
      distance[next] = distance[here] + 1;
      queue.push(next);
    }
  }
  return { previous, distance };
}

function pathFrom(previous: number[], from: number, target: number): number[] | null {
  if (previous[target] === -1) return null;
  const path: number[] = [];
  for (let node = target; node !== from; node = previous[node]) path.unshift(node);
  return path;
}

function route(c: Campaign, id: NationId, from: number, target: number): number[] | null {
  return pathFrom(routeTree(c, id, from).previous, from, target);
}

export function canResearch(c: Campaign, id: NationId, tech: string): boolean {
  const n = c.nations[id];
  const definition = TECHS.find(t => t.id === tech);
  return !!definition && !n.capitulated && n.research.length < 2 && !has(n, tech)
    && !n.research.some(r => r.tech === tech) && definition.requires.every(t => has(n, t));
}

export function canFocus(c: Campaign, id: NationId, focus: string): boolean {
  const n = c.nations[id];
  const definition = FOCUSES.find(f => f.id === focus);
  return !!definition && !n.capitulated && n.focus === null && !focused(n, focus)
    && definition.requires.every(f => focused(n, f));
}

function newDivision(c: Campaign, id: NationId, province: number, type: UnitType): void {
  c.divisions.push({ id: c.nextId++, nation: id, province, type, hp: 100, org: 100, entrenchment: 0, path: [], progress: 0, experience: 0 });
}

export function createCampaign(player: NationId = 0, seed = 19360901): Campaign {
  const c: Campaign = {
    version: 1, seed: Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 19360901, day: 0,
    player: nationId(player) ? player : 0, phase: 'setup',
    provinces: PROVINCES.map(p => ({ owner: p.home, fort: p.capital ? 1 : 0, infrastructure: p.capital ? 3 : 1, civilian: p.civilian, military: p.military, dockyard: p.dockyard })),
    nations: NATIONS.map(def => ({
      id: def.id, pp: 100, stability: 0.72, support: 0.6, manpower: 30_000, fuel: 180,
      stock: { rifles: 240, artillery: 50, tanks: 36, aircraft: 18, ships: 4 },
      allocation: { rifles: 0, artillery: 0, tanks: 0, aircraft: 0, ships: 0 },
      efficiency: { rifles: 0.45, artillery: 0.4, tanks: 0.35, aircraft: 0.35, ships: 0.35 },
      research: [], techs: [], focus: null, focuses: [], construction: [], recruitment: [], allies: [],
      relations: NATIONS.map(other => other.id === def.id ? 100 : 0), justification: null, trade: null,
      airMission: 'reserve', navalMission: 'reserve', mobilization: 0, capitulated: false,
    })),
    divisions: [], wars: [], battles: [], dispatches: [], nextId: 1, tension: 8, score: 0,
  };
  for (const n of c.nations) {
    const capacity = industry(c, n.id);
    n.allocation.rifles = Math.ceil(capacity.military * 0.5);
    n.allocation.artillery = Math.floor(capacity.military * 0.25);
    n.allocation.tanks = Math.max(0, capacity.military - n.allocation.rifles - n.allocation.artillery - 1);
    n.allocation.aircraft = Math.max(0, capacity.military - n.allocation.rifles - n.allocation.artillery - n.allocation.tanks);
    n.allocation.ships = capacity.dockyard;
    const home = PROVINCES.filter(p => p.home === n.id);
    const border = home.filter(p => p.neighbors.some(other => PROVINCES[other].home !== n.id));
    const placements = [...home.filter(p => p.capital), ...border, ...home.filter(p => !p.capital)];
    for (let i = 0; i < 7; i++) newDivision(c, n.id, placements[i % placements.length].id, i === 6 ? 'motorized' : 'infantry');
  }
  dispatch(c, 'Prepare your industry, choose research and begin the campaign.');
  return c;
}

export function startCampaign(c: Campaign): void {
  if (c.phase !== 'setup') return;
  c.phase = 'playing';
  dispatch(c, 'Campaign begun. Secure 60% of victory points and three capitals with your allies.');
}

const ok = (message: string): CommandResult => ({ ok: true, message });
const no = (message: string): CommandResult => ({ ok: false, message });

function declareWar(c: Campaign, a: NationId, b: NationId): void {
  const sideA = [a, ...c.nations[a].allies].filter(id => !c.nations[id].capitulated);
  const sideB = [b, ...c.nations[b].allies].filter(id => !c.nations[id].capitulated);
  for (const x of sideA) for (const y of sideB) {
    if (x === y || friendly(c, x, y) || atWar(c, x, y)) continue;
    c.wars.push(x < y ? [x, y] : [y, x]);
    c.nations[x].relations[y] = c.nations[y].relations[x] = -100;
    if (c.nations[x].trade === y) c.nations[x].trade = null;
    if (c.nations[y].trade === x) c.nations[y].trade = null;
  }
  c.nations[a].justification = null;
  clearInvalidJustifications(c);
  c.tension = clamp(c.tension + 18, 0, 100);
  dispatch(c, `${NATIONS[a].short} declared war on ${NATIONS[b].short}.`, 'diplomacy');
}

function clearInvalidJustifications(c: Campaign): void {
  for (const n of c.nations) {
    const target = n.justification?.target;
    if (target !== undefined && (friendly(c, n.id, target) || atWar(c, n.id, target) || c.nations[target].capitulated)) n.justification = null;
  }
}

function setFront(c: Campaign, id: NationId, target: NationId, units: Division[]): CommandResult {
  const candidates = PROVINCES.filter(p => c.provinces[p.id].owner === target
    && links(p.id).some(next => friendly(c, id, c.provinces[next].owner)));
  if (!candidates.length) return no('No reachable enemy front.');
  const assigned = new Map<number, number>();
  const defenders = PROVINCES.map(() => 0);
  for (const d of c.divisions) if (atWar(c, id, d.nation)) defenders[d.province]++;
  let count = 0;
  for (const d of units) {
    const tree = routeTree(c, id, d.province);
    let best: { score: number; target: number } | null = null;
    for (const p of candidates) {
      if (tree.previous[p.id] === -1) continue;
      const score = tree.distance[p.id] + defenders[p.id] * 2.5 + (assigned.get(p.id) ?? 0) * 1.8 - p.vp * 0.12;
      if (!best || score < best.score) best = { score, target: p.id };
    }
    if (best) {
      d.path = pathFrom(tree.previous, d.province, best.target)!; d.progress = 0; d.entrenchment = 0;
      assigned.set(best.target, (assigned.get(best.target) ?? 0) + 1);
      count++;
    }
  }
  return count ? ok(`${count} divisions assigned to the front.`) : no('A fleet on patrol is required to cross the sea.');
}

function perform(c: Campaign, id: NationId, cmd: Command): CommandResult {
  if (c.phase !== 'playing') return no('Begin the campaign first.');
  const n = c.nations[id];
  if (n.capitulated) return no('This nation has capitulated.');
  switch (cmd.type) {
    case 'allocation': {
      if (!EQUIPMENT_IDS.includes(cmd.equipment) || !Number.isInteger(cmd.delta) || Math.abs(cmd.delta) > 128 || !cmd.delta) return no('Choose a valid factory change.');
      const next = n.allocation[cmd.equipment] + cmd.delta;
      if (next < 0) return no('No assigned factory to remove.');
      const free = cmd.equipment === 'ships' ? industry(c, id).dockyard - n.allocation.ships : availableFactories(c, id);
      if (cmd.delta > free) return no(cmd.equipment === 'ships' ? 'No free dockyards.' : 'No free military factories.');
      if (cmd.delta > 0) n.efficiency[cmd.equipment] = Math.max(0.1, n.efficiency[cmd.equipment] * n.allocation[cmd.equipment] / next);
      n.allocation[cmd.equipment] = next;
      return ok('Factory allocation changed.');
    }
    case 'research':
      if (!canResearch(c, id, cmd.tech)) return no('Research requires a free slot and its prerequisites.');
      n.research.push({ tech: cmd.tech, progress: 0 });
      return ok('Research started.');
    case 'focus':
      if (!canFocus(c, id, cmd.focus)) return no('Complete the current focus and its prerequisites.');
      n.focus = { id: cmd.focus, progress: 0 };
      return ok('National focus started.');
    case 'build': {
      if (!provinceId(cmd.province) || !BUILDING_IDS.includes(cmd.kind) || c.provinces[cmd.province].owner !== id) return no('Build in your own province.');
      if (n.construction.length >= 12) return no('Construction queue is full.');
      if (cmd.kind === 'dockyard' && !PROVINCES[cmd.province].port) return no('Dockyards require a port.');
      const queued = n.construction.filter(j => j.province === cmd.province && j.kind === cmd.kind).length;
      if (c.provinces[cmd.province][cmd.kind] + queued >= BUILDINGS[cmd.kind].max) return no('Province building limit reached.');
      n.construction.push({ province: cmd.province, kind: cmd.kind, progress: 0 });
      return ok('Construction queued.');
    }
    case 'cancel-build':
      if (!Number.isInteger(cmd.index) || cmd.index < 0 || cmd.index >= n.construction.length) return no('Choose a queued building.');
      n.construction.splice(cmd.index, 1);
      return ok('Construction cancelled.');
    case 'recruit': {
      if (!UNIT_IDS.includes(cmd.unit)) return no('Unknown division type.');
      if (n.recruitment.length >= 12 || c.divisions.length + c.nations.reduce((sum, other) => sum + other.recruitment.length, 0) >= MAX_UNITS) return no('Recruitment limit reached.');
      const template = TEMPLATES[cmd.unit];
      if (n.manpower < template.manpower) return no('More manpower required.');
      if (EQUIPMENT_IDS.some(e => n.stock[e] < (template.equipment[e] ?? 0))) return no('More equipment required.');
      n.manpower -= template.manpower;
      for (const e of EQUIPMENT_IDS) n.stock[e] -= template.equipment[e] ?? 0;
      n.recruitment.push({ type: cmd.unit, progress: 0 });
      return ok('Division training. Equipment and manpower reserved.');
    }
    case 'order':
    case 'halt': {
      if (!Array.isArray(cmd.units) || !cmd.units.length || cmd.units.length > MAX_UNITS || new Set(cmd.units).size !== cmd.units.length) return no('Select your divisions.');
      const units = cmd.units.map(unitId => c.divisions.find(d => d.id === unitId && d.nation === id));
      if (units.some(d => !d)) return no('You can only command your own divisions.');
      if (cmd.type === 'halt') {
        for (const d of units as Division[]) { d.path = []; d.progress = 0; }
        return ok('Divisions halted.');
      }
      if (!provinceId(cmd.target)) return no('Choose a province.');
      const owner = c.provinces[cmd.target].owner;
      if (!friendly(c, id, owner) && !atWar(c, id, owner)) return no('Declare war before entering neutral territory.');
      const routes = (units as Division[]).map(d => route(c, id, d.province, cmd.target));
      if (routes.some(path => path === null)) return no('No route. Sea crossings require ports, ships, fuel and patrol.');
      (units as Division[]).forEach((d, i) => { d.path = routes[i]!; d.progress = 0; d.entrenchment = 0; });
      return ok('Orders issued.');
    }
    case 'front':
      if (!nationId(cmd.target) || !atWar(c, id, cmd.target)) return no('Choose a nation at war with you.');
      return setFront(c, id, cmd.target, c.divisions.filter(d => d.nation === id));
    case 'justify':
      if (!nationId(cmd.target) || cmd.target === id || friendly(c, id, cmd.target) || atWar(c, id, cmd.target) || c.nations[cmd.target].capitulated) return no('Choose a neutral rival.');
      if (n.justification) return no('A war justification is already active.');
      if (n.pp < 35) return no('35 political power required.');
      n.pp -= 35;
      n.justification = { target: cmd.target, readyDay: c.day + 24 };
      c.tension = clamp(c.tension + 5, 0, 100);
      dispatch(c, `${NATIONS[id].short} is justifying war against ${NATIONS[cmd.target].short}.`, 'diplomacy');
      return ok('War justification ready in 24 days.');
    case 'declare':
      if (!nationId(cmd.target) || !n.justification || n.justification.target !== cmd.target || c.day < n.justification.readyDay) return no('Finish a war justification first.');
      if (friendly(c, id, cmd.target) || atWar(c, id, cmd.target) || c.nations[cmd.target].capitulated) return no('That nation is no longer a valid rival.');
      declareWar(c, id, cmd.target);
      return ok('War declared.');
    case 'relations':
      if (!nationId(cmd.target) || cmd.target === id || c.nations[cmd.target].capitulated || atWar(c, id, cmd.target)) return no('Choose a peaceful foreign nation.');
      if (n.pp < 20 || n.relations[cmd.target] >= 100) return no('20 political power required; relations must be below 100.');
      n.pp -= 20;
      n.relations[cmd.target] = clamp(n.relations[cmd.target] + 25, -100, 100);
      c.nations[cmd.target].relations[id] = clamp(c.nations[cmd.target].relations[id] + 25, -100, 100);
      return ok('Relations improved by 25.');
    case 'alliance': {
      if (!nationId(cmd.target) || cmd.target === id || c.nations[cmd.target].capitulated || friendly(c, id, cmd.target) || atWar(c, id, cmd.target)) return no('Choose a peaceful foreign nation.');
      if (n.pp < 75 || n.relations[cmd.target] < 40) return no('Alliance requires 75 political power and 40 relations.');
      const bloc = [...new Set([id, ...n.allies, cmd.target, ...c.nations[cmd.target].allies])];
      if (bloc.some(a => bloc.some(b => atWar(c, a, b)))) return no('An ally is at war with this nation.');
      n.pp -= 75;
      for (const a of bloc) c.nations[a].allies = bloc.filter(b => b !== a);
      clearInvalidJustifications(c);
      const existingWars = [...c.wars];
      for (const [a, b] of existingWars) {
        if (bloc.includes(a) && !bloc.includes(b)) declareWar(c, a, b);
        else if (bloc.includes(b) && !bloc.includes(a)) declareWar(c, b, a);
      }
      dispatch(c, `${NATIONS[id].short} and ${NATIONS[cmd.target].short} formed an alliance.`, 'diplomacy');
      return ok('Alliance formed.');
    }
    case 'trade':
      if (cmd.target === null) { n.trade = null; return ok('Trade ended.'); }
      if (!nationId(cmd.target) || cmd.target === id || c.nations[cmd.target].capitulated || atWar(c, id, cmd.target)) return no('Choose a peaceful trade partner.');
      if (n.trade === cmd.target) return no('Trade is already active.');
      if (industry(c, id).civilian + (n.trade === null ? 0 : 1) < 1) return no('Trade requires one civilian factory.');
      n.trade = cmd.target;
      return ok('Trade active: one civilian factory for 6 steel and 3 oil.');
    case 'air':
      if (!['reserve', 'superiority', 'support'].includes(cmd.mission)) return no('Unknown air mission.');
      if (cmd.mission !== 'reserve' && (n.stock.aircraft < 1 || n.fuel < 1)) return no('Aircraft and fuel required.');
      n.airMission = cmd.mission;
      return ok('Air mission changed.');
    case 'navy':
      if (!['reserve', 'patrol', 'raiding'].includes(cmd.mission)) return no('Unknown naval mission.');
      if (cmd.mission !== 'reserve' && (n.stock.ships < 1 || n.fuel < 1)) return no('Ships and fuel required.');
      n.navalMission = cmd.mission;
      return ok('Naval mission changed.');
    case 'mobilize':
      if (n.mobilization >= 3) return no('Full mobilization reached.');
      if (n.pp < 60 || n.support < 0.45) return no('60 political power and 45% war support required.');
      n.pp -= 60; n.mobilization++; n.manpower = Math.min(MAX_STOCK, n.manpower + 12_000); n.stability = clamp(n.stability - 0.08);
      return ok('Mobilized 12,000 reservists.');
    case 'rally':
      if (n.pp < 35 || (n.stability >= 1 && n.support >= 1)) return no('35 political power required; public support is already full.');
      n.pp -= 35; n.stability = clamp(n.stability + 0.12); n.support = clamp(n.support + 0.12);
      return ok('Stability and war support increased by 12%.');
    default: return no('Unknown command.');
  }
}

export function issue(c: Campaign, cmd: Command): CommandResult {
  if (!cmd || typeof cmd !== 'object') return no('Unknown command.');
  return perform(c, c.player, cmd);
}

function trimAllocation(c: Campaign, n: NationState): void {
  const capacity = industry(c, n.id);
  n.allocation.ships = Math.min(n.allocation.ships, capacity.dockyard);
  let excess = Math.max(0, EQUIPMENT_IDS.filter(e => e !== 'ships').reduce((sum, e) => sum + n.allocation[e], 0) - capacity.military);
  for (const e of ['aircraft', 'tanks', 'artillery', 'rifles'] as Equipment[]) {
    const removed = Math.min(excess, n.allocation[e]);
    n.allocation[e] -= removed; excess -= removed;
  }
}

function reconcileConstruction(c: Campaign, n: NationState): void {
  const reserved = new Map<string, number>();
  n.construction = n.construction.filter(job => {
    const province = c.provinces[job.province];
    if (province.owner !== n.id) return false;
    const key = `${job.province}:${job.kind}`;
    const count = reserved.get(key) ?? 0;
    if (province[job.kind] + count >= BUILDINGS[job.kind].max) return false;
    reserved.set(key, count + 1);
    return true;
  });
}

function completeFocus(c: Campaign, n: NationState, id: string): void {
  n.focuses.push(id); n.focus = null;
  const capital = capitalOf(c, n.id);
  if (capital !== null) {
    if (id === 'civic-plan') c.provinces[capital].civilian = Math.min(8, c.provinces[capital].civilian + 1);
    if (id === 'arsenal') c.provinces[capital].military = Math.min(8, c.provinces[capital].military + 2);
    if (id === 'open-ports') {
      const port = PROVINCES.find(p => p.port && c.provinces[p.id].owner === n.id);
      if (port) c.provinces[port.id].dockyard = Math.min(6, c.provinces[port.id].dockyard + 1);
    }
  }
  if (id === 'civic-plan') n.stability = clamp(n.stability + 0.05);
  if (id === 'officer-school') { n.manpower = Math.min(MAX_STOCK, n.manpower + 5_000); n.support = clamp(n.support + 0.05); }
  if (id === 'war-economy') { n.pp = Math.min(1_000, n.pp + 60); n.support = clamp(n.support + 0.1); }
  if (id === 'national-resolve') n.stability = clamp(n.stability + 0.08);
  if (id === 'open-ports') n.fuel = Math.min(MAX_STOCK, n.fuel + 100);
  // Free focus buildings replace the last redundant queued projects, preserving active work.
  reconcileConstruction(c, n);
  dispatch(c, `${NATIONS[n.id].short}: ${FOCUSES.find(f => f.id === id)!.name} completed.`, 'research');
}

function economy(c: Campaign, n: NationState): void {
  if (n.capitulated) return;
  trimAllocation(c, n);
  const capacity = industry(c, n.id);
  const output = (1 + (has(n, 'machine-tools') ? 0.2 : 0) + (focused(n, 'industrial-drive') ? 0.1 : 0)) * (0.65 + n.stability * 0.35);
  n.pp = Math.min(1_000, n.pp + 0.8 + n.stability * 0.6);
  n.manpower = Math.min(MAX_STOCK, n.manpower + (18 + n.mobilization * 9) * n.stability);
  n.fuel = Math.min(MAX_STOCK, n.fuel + capacity.oil * 0.65);
  const steelNeed = EQUIPMENT_IDS.reduce((sum, e) => sum + n.allocation[e] * EQUIPMENT[e].steel, 0);
  const oilNeed = EQUIPMENT_IDS.reduce((sum, e) => sum + n.allocation[e] * EQUIPMENT[e].oil, 0);
  const resources = Math.min(1, capacity.steel / Math.max(1, steelNeed), capacity.oil / Math.max(1, oilNeed));
  for (const e of EQUIPMENT_IDS) {
    if (n.allocation[e] === 0) continue;
    n.efficiency[e] = Math.min(has(n, 'assembly-lines') ? 0.95 : 0.8, n.efficiency[e] + 0.004);
    n.stock[e] = Math.min(MAX_STOCK, n.stock[e] + n.allocation[e] * n.efficiency[e] * 4 * output * (0.15 + 0.85 * resources) / EQUIPMENT[e].cost);
  }
  for (const job of [...n.research]) {
    job.progress++;
    if (job.progress >= TECHS.find(t => t.id === job.tech)!.days) {
      n.techs.push(job.tech);
      n.research.splice(n.research.indexOf(job), 1);
      dispatch(c, `${NATIONS[n.id].short}: ${TECHS.find(t => t.id === job.tech)!.name} researched.`, 'research');
    }
  }
  if (n.focus) {
    n.focus.progress++;
    if (n.focus.progress >= FOCUSES.find(f => f.id === n.focus!.id)!.days) completeFocus(c, n, n.focus.id);
  }
  reconcileConstruction(c, n);
  const build = n.construction[0];
  if (build) {
    build.progress += capacity.civilian * 0.8 * output;
    if (build.progress >= BUILDINGS[build.kind].cost) {
      c.provinces[build.province][build.kind] = Math.min(BUILDINGS[build.kind].max, c.provinces[build.province][build.kind] + 1);
      n.construction.shift();
      dispatch(c, `${NATIONS[n.id].short}: ${BUILDINGS[build.kind].name} completed in ${PROVINCES[build.province].name}.`);
    }
  }
  // Two training grounds run in parallel. Resources were reserved when each job entered the queue.
  for (const recruit of [...n.recruitment.slice(0, 2)]) {
    recruit.progress++;
    if (recruit.progress >= TEMPLATES[recruit.type].days) {
      const capital = capitalOf(c, n.id);
      if (capital !== null && c.divisions.length < MAX_UNITS) {
        newDivision(c, n.id, capital, recruit.type);
        n.recruitment.splice(n.recruitment.indexOf(recruit), 1);
        if (n.id === c.player) dispatch(c, `${TEMPLATES[recruit.type].name} division deployed in ${PROVINCES[capital].name}.`);
      }
    }
  }
  const flying = n.airMission !== 'reserve' && n.stock.aircraft >= 1;
  const sailing = n.navalMission !== 'reserve' && n.stock.ships >= 1;
  n.fuel = Math.max(0, n.fuel - (flying ? n.stock.aircraft * 0.035 : 0) - (sailing ? n.stock.ships * 0.11 : 0));
  if (n.fuel < 0.5) { n.airMission = 'reserve'; n.navalMission = 'reserve'; }
}

function strategicAI(c: Campaign, n: NationState): void {
  if (n.id === c.player || n.capitulated || c.day % 7 !== n.id) return;
  while (n.research.length < 2) {
    const candidates = TECHS.filter(t => canResearch(c, n.id, t.id));
    if (!candidates.length) break;
    perform(c, n.id, { type: 'research', tech: candidates[Math.floor(random(c) * Math.min(4, candidates.length))].id });
  }
  if (!n.focus) {
    const candidates = FOCUSES.filter(f => canFocus(c, n.id, f.id));
    if (candidates.length) perform(c, n.id, { type: 'focus', focus: candidates[Math.floor(random(c) * Math.min(2, candidates.length))].id });
  }
  const capital = capitalOf(c, n.id);
  if (capital !== null && n.construction.length < 2) {
    const provinces = PROVINCES.filter(p => c.provinces[p.id].owner === n.id);
    const kind: Building = c.day < 90 ? 'civilian' : 'military';
    const site = provinces.find(p => c.provinces[p.id][kind] + n.construction.filter(j => j.province === p.id && j.kind === kind).length < BUILDINGS[kind].max);
    if (site) perform(c, n.id, { type: 'build', province: site.id, kind });
  }
  if (n.recruitment.length < 2 && c.divisions.filter(d => d.nation === n.id).length < 16) {
    const choice: UnitType = has(n, 'mobile-warfare') && n.stock.tanks >= 24 ? 'armored' : 'infantry';
    perform(c, n.id, { type: 'recruit', unit: choice });
  }
  while (availableFactories(c, n.id) > 0) perform(c, n.id, { type: 'allocation', equipment: n.stock.rifles < 100 ? 'rifles' : n.stock.artillery < 30 ? 'artillery' : 'tanks', delta: 1 });
  if (industry(c, n.id).dockyard > n.allocation.ships) perform(c, n.id, { type: 'allocation', equipment: 'ships', delta: industry(c, n.id).dockyard - n.allocation.ships });
  const enemies = c.nations.filter(other => atWar(c, n.id, other.id));
  if (enemies.length) {
    if (n.fuel > 10) {
      if (n.stock.aircraft >= 1) n.airMission = n.id % 2 ? 'support' : 'superiority';
      if (n.stock.ships >= 1) n.navalMission = n.id === 5 || n.id % 2 === 0 ? 'patrol' : 'raiding';
    }
    const own = c.divisions.filter(d => d.nation === n.id && d.org > 25);
    const enemy = enemies.sort((a, b) => c.divisions.filter(d => d.nation === a.id).length - c.divisions.filter(d => d.nation === b.id).length)[0];
    setFront(c, n.id, enemy.id, own.filter((d, i) => d.path.length === 0 && (d.province !== capital || i > 0)));
    if (n.pp >= 100 && n.manpower < 10_000) perform(c, n.id, { type: 'mobilize' });
    if (n.pp >= 100 && n.stability < 0.65) perform(c, n.id, { type: 'rally' });
  } else if (c.day >= 90 + n.id * 17) {
    if (n.justification && n.justification.readyDay <= c.day) perform(c, n.id, { type: 'declare', target: n.justification.target });
    else if (!n.justification) {
      const candidates = c.nations.filter(other => other.id !== n.id && !other.capitulated && !friendly(c, n.id, other.id)
        && n.relations[other.id] < 40 && PROVINCES.some(p => c.provinces[p.id].owner === n.id
          && links(p.id).some(next => c.provinces[next].owner === other.id)));
      candidates.sort((a, b) => industry(c, a.id).military - industry(c, b.id).military || a.id - b.id);
      if (candidates.length) perform(c, n.id, { type: 'justify', target: candidates[0].id });
    }
  }
}

function reinforce(c: Campaign, d: Division, supply: number): void {
  const n = c.nations[d.nation];
  const t = TEMPLATES[d.type];
  const missing = Math.min(0.8 * supply, 100 - d.hp);
  let repaired = Math.min(missing, n.manpower * 100 / t.manpower);
  for (const e of EQUIPMENT_IDS) if (t.equipment[e]) repaired = Math.min(repaired, n.stock[e] * 100 / t.equipment[e]!);
  if (repaired > 0) {
    n.manpower = Math.max(0, n.manpower - repaired * t.manpower / 100);
    for (const e of EQUIPMENT_IDS) n.stock[e] = Math.max(0, n.stock[e] - repaired * (t.equipment[e] ?? 0) / 100);
    d.hp = Math.min(100, d.hp + repaired);
  }
}

function capture(c: Campaign, province: number, id: NationId): void {
  const previous = c.provinces[province].owner;
  if (!atWar(c, id, previous)) return;
  const home = PROVINCES[province].home;
  c.provinces[province].owner = friendly(c, id, home) && !c.nations[home].capitulated ? home : id;
  c.nations[previous].construction = c.nations[previous].construction.filter(j => j.province !== province);
  c.score = Math.min(1_000_000_000, c.score + (friendly(c, c.player, id) ? PROVINCES[province].vp * 10 : 0));
  if (PROVINCES[province].vp >= 3) dispatch(c, `${NATIONS[id].short} captured ${PROVINCES[province].name}.`, 'battle');
}

function march(c: Campaign, supply: number[][]): void {
  const engaged = new Map<number, NationId[]>();
  for (const attacker of c.divisions) {
    if (attacker.hp <= 0 || attacker.org < 8 || !attacker.path.length || attacker.progress < 1) continue;
    const target = attacker.path[0];
    if (atWar(c, attacker.nation, c.provinces[target].owner)) engaged.set(target, [...(engaged.get(target) ?? []), attacker.nation]);
  }
  for (const d of c.divisions) {
    const s = supply[d.nation][d.province];
    if (s < 0.25) { d.hp = Math.max(0, d.hp - (0.25 - s) * 1.8); d.org = Math.max(0, d.org - 2); }
    if (d.hp <= 0) continue;
    // Engaged defenders cannot walk out of a battle. Retreat is resolved by combat.
    if (engaged.get(d.province)?.some(enemy => atWar(c, d.nation, enemy))) continue;
    if (!d.path.length) {
      d.org = Math.min(100, d.org + (has(c.nations[d.nation], 'logistics') ? 6 : 4) * s);
      d.entrenchment = Math.min(1, d.entrenchment + 0.055 * s);
      reinforce(c, d, s);
      continue;
    }
    const target = d.path[0];
    const owner = c.provinces[target].owner;
    if (!friendly(c, d.nation, owner) && !atWar(c, d.nation, owner)) { d.path = []; d.progress = 0; continue; }
    const sea = SEA.has(seaKey(d.province, target));
    if (sea && !canSail(c, d.nation, d.province, target)) { d.progress = 0; continue; }
    const n = c.nations[d.nation];
    const motor = d.type !== 'infantry';
    const fueled = !motor || n.fuel >= 0.25;
    if (motor && fueled) n.fuel = Math.max(0, n.fuel - 0.25);
    d.entrenchment = 0;
    d.org = Math.min(100, d.org + 1.5 * s);
    d.progress = Math.min(1, d.progress + TEMPLATES[d.type].speed * terrainSpeed[PROVINCES[target].terrain]
      * (0.3 + 0.7 * s) * (fueled ? 1 : 0.35) * (motor && has(n, 'mobile-warfare') ? 1.2 : 1) * (sea ? 0.45 : 1));
    if (d.progress < 1 || d.org < 15) continue;
    if (c.divisions.some(other => other.province === target && atWar(c, d.nation, other.nation))) continue;
    capture(c, target, d.nation);
    if (sea) { n.fuel = Math.max(0, n.fuel - 1); d.org = Math.max(0, d.org - 12); }
    d.province = target; d.path.shift(); d.progress = 0;
  }
}

function airPower(c: Campaign, id: NationId, mission: 'superiority' | 'support'): number {
  const n = c.nations[id];
  return n.airMission === mission && n.fuel >= 0.5 ? n.stock.aircraft * (has(n, 'airframes') ? 1.25 : 1) : 0;
}

function combatPower(c: Campaign, d: Division, attacking: boolean, province: number, supply: number): number {
  const n = c.nations[d.nation];
  const t = TEMPLATES[d.type];
  const strength = (d.hp / 100) * (0.25 + d.org / 100 * 0.75) * (0.25 + 0.75 * supply) * (1 + d.experience * 0.3);
  if (!attacking) return t.defense * strength * terrainDefense[PROVINCES[province].terrain]
    * (1 + d.entrenchment * 0.4 + c.provinces[province].fort * 0.16);
  const tech = 1 + (has(n, 'field-drill') ? 0.15 : 0) + (d.type === 'infantry' && has(n, 'support-guns') ? 0.15 : 0)
    + (d.type !== 'infantry' && has(n, 'mobile-warfare') ? 0.2 : 0) + (focused(n, 'national-resolve') ? 0.1 : 0);
  const mobileTerrain = d.type === 'armored' && ['mountain', 'forest', 'city'].includes(PROVINCES[province].terrain) ? 0.65 : 1;
  const landing = SEA.has(seaKey(d.province, province)) ? 0.65 : 1;
  return t.attack * strength * tech * mobileTerrain * landing * (d.type !== 'infantry' && n.fuel < 0.25 ? 0.5 : 1);
}

function retreat(c: Campaign, d: Division, enemy: NationId): boolean {
  const options = PROVINCES[d.province].neighbors.filter(p => friendly(c, d.nation, c.provinces[p].owner)
    && !c.divisions.some(other => other.province === p && atWar(c, d.nation, other.nation)));
  options.sort((a, b) => PROVINCES[b].vp - PROVINCES[a].vp || a - b);
  if (!options.length) { d.hp = 0; return false; }
  d.province = options[0]; d.path = []; d.progress = 0; d.entrenchment = 0; d.org = 18;
  d.hp = Math.max(0, d.hp - 5);
  return true;
}

function fight(c: Campaign, supply: number[][]): void {
  const previous = c.battles;
  c.battles = [];
  const attacks = new Map<number, Division[]>();
  for (const d of c.divisions) {
    if (d.hp <= 0 || !d.path.length || d.progress < 1 || d.org < 8) continue;
    const target = d.path[0];
    if (!atWar(c, d.nation, c.provinces[target].owner)) continue;
    if (!attacks.has(target)) attacks.set(target, []);
    attacks.get(target)!.push(d);
  }
  for (const [province, pending] of attacks) {
    // Earlier battles can destroy, retreat or cancel orders on these same units.
    const eligible = pending.filter(d => d.hp > 0 && d.org >= 8 && d.progress >= 1 && d.path[0] === province
      && adjacent(d.province, province) && atWar(c, d.nation, c.provinces[province].owner));
    if (!eligible.length) continue;
    const attacker = eligible[0].nation;
    const width = ['mountain', 'city'].includes(PROVINCES[province].terrain) ? 4 : 6;
    const fit = (units: Division[]) => {
      let used = 0;
      return units.filter(d => { used += TEMPLATES[d.type].width; return used <= width; });
    };
    const attackers = fit(eligible.filter(d => friendly(c, attacker, d.nation)));
    const defenders = fit(c.divisions.filter(d => d.hp > 0 && d.province === province && atWar(c, attacker, d.nation)));
    if (!defenders.length) continue;
    const defender = c.provinces[province].owner;
    const superiority = airPower(c, attacker, 'superiority') - airPower(c, defender, 'superiority');
    const air = clamp(superiority / 100, -0.2, 0.2);
    const support = Math.min(0.4, airPower(c, attacker, 'support') / 100) * (has(c.nations[attacker], 'close-support') ? 1.3 : 1);
    const a = attackers.reduce((sum, d) => sum + combatPower(c, d, true, province, supply[d.nation][d.province]), 0) * (1 + air + support);
    const b = defenders.reduce((sum, d) => sum + combatPower(c, d, false, province, supply[d.nation][province]), 0) * (1 - air);
    const ratio = a / Math.max(0.1, b);
    const balance = clamp((a - b) / Math.max(1, a + b), -1, 1);
    const old = previous.find(battle => battle.province === province && battle.attacker === attacker);
    c.battles.push({ province, attacker, defender, balance, days: (old?.days ?? 0) + 1 });
    const variation = 0.9 + random(c) * 0.2;
    for (const d of attackers) {
      d.org = Math.max(0, d.org - clamp(6 / Math.max(0.2, ratio), 1.5, 18) * variation);
      d.hp = Math.max(0, d.hp - clamp(1.8 / Math.max(0.2, ratio), 0.4, 6) * variation);
      d.experience = Math.min(1, d.experience + 0.008);
      if (d.org < 8) { d.path = []; d.progress = 0; }
    }
    for (const d of defenders) {
      d.org = Math.max(0, d.org - clamp(6 * ratio, 1.5, 18) * variation);
      d.hp = Math.max(0, d.hp - clamp(1.8 * ratio, 0.4, 6) * variation);
      d.experience = Math.min(1, d.experience + 0.008);
      if (d.org < 8 || d.hp < 12) retreat(c, d, attacker);
    }
    if (!c.divisions.some(d => d.hp > 0 && d.province === province && atWar(c, attacker, d.nation))) {
      capture(c, province, attacker);
      for (const d of attackers) if (d.hp > 0 && d.path[0] === province) { d.province = province; d.path.shift(); d.progress = 0; }
      dispatch(c, `${NATIONS[attacker].short} won the battle for ${PROVINCES[province].name}.`, 'battle');
    }
  }
  c.divisions = c.divisions.filter(d => d.hp > 0);
}

function missions(c: Campaign): void {
  // Global sea zone: patrols engage raiders; escorts protect transport and port supply.
  for (const [a, b] of c.wars) {
    const x = c.nations[a]; const y = c.nations[b];
    const nx = navalStrength(c, a); const ny = navalStrength(c, b);
    if (nx > 0 && ny > 0) {
      x.stock.ships = Math.max(0, x.stock.ships - Math.min(0.06, ny * 0.004) * (has(x, 'convoy-escorts') ? 0.5 : 1));
      y.stock.ships = Math.max(0, y.stock.ships - Math.min(0.06, nx * 0.004) * (has(y, 'convoy-escorts') ? 0.5 : 1));
    }
    const ax = airPower(c, a, 'superiority'); const ay = airPower(c, b, 'superiority');
    if (ax + ay > 0) {
      if (x.airMission !== 'reserve') x.stock.aircraft = Math.max(0, x.stock.aircraft - ay * 0.002);
      if (y.airMission !== 'reserve') y.stock.aircraft = Math.max(0, y.stock.aircraft - ax * 0.002);
    }
  }
}

function endStates(c: Campaign): void {
  for (const n of c.nations) {
    if (n.capitulated) continue;
    const home = PROVINCES.filter(p => p.home === n.id);
    const totalVP = home.reduce((sum, p) => sum + p.vp, 0);
    const heldVP = home.reduce((sum, p) => sum + (friendly(c, n.id, c.provinces[p.id].owner) ? p.vp : 0), 0);
    const capital = home.find(p => p.capital)!;
    if (friendly(c, n.id, c.provinces[capital.id].owner) || heldVP > totalVP * 0.4) continue;
    const conqueror = c.provinces[capital.id].owner;
    n.capitulated = true; n.recruitment = []; n.construction = []; n.research = []; n.focus = null; n.justification = null; n.trade = null;
    n.allocation = { rifles: 0, artillery: 0, tanks: 0, aircraft: 0, ships: 0 };
    c.divisions = c.divisions.filter(d => d.nation !== n.id);
    for (const state of c.provinces) if (state.owner === n.id) state.owner = conqueror;
    for (const other of c.nations) {
      other.allies = other.allies.filter(id => id !== n.id);
      if (other.trade === n.id) other.trade = null;
      if (other.justification?.target === n.id) other.justification = null;
    }
    n.allies = [];
    c.wars = c.wars.filter(([a, b]) => a !== n.id && b !== n.id);
    dispatch(c, `${NATIONS[n.id].name} capitulated to ${NATIONS[conqueror].short}.`, 'diplomacy');
  }
  c.battles = c.battles.filter(b => atWar(c, b.attacker, b.defender) && c.provinces[b.province].owner === b.defender);
  for (const n of c.nations) { n.construction = n.construction.filter(j => c.provinces[j.province].owner === n.id); trimAllocation(c, n); }
  if (c.nations[c.player].capitulated) { c.phase = 'defeat'; dispatch(c, 'Your government has capitulated. Campaign lost.'); return; }
  const total = PROVINCES.reduce((sum, p) => sum + p.vp, 0);
  const controlled = PROVINCES.filter(p => friendly(c, c.player, c.provinces[p.id].owner));
  const vp = controlled.reduce((sum, p) => sum + p.vp, 0);
  if (vp >= total * 0.6 && controlled.filter(p => p.capital).length >= 3) {
    c.phase = 'victory';
    c.score = Math.min(1_000_000_000, c.score + Math.round(vp * 100 + 10_000 / (1 + c.day / 100)));
    dispatch(c, 'Your alliance secured the Meridian. Campaign won.');
  }
}

export function advanceDay(c: Campaign): void {
  if (c.phase !== 'playing' || c.day >= 1_000_000) return;
  c.day++;
  for (const n of c.nations) economy(c, n);
  for (const n of c.nations) strategicAI(c, n);
  const supply = c.nations.map(n => supplyMap(c, n.id));
  march(c, supply);
  fight(c, supply);
  missions(c);
  endStates(c);
}

export function serializeCampaign(c: Campaign): unknown {
  return JSON.parse(JSON.stringify(c));
}

type Data = Record<string, unknown>;
const record = (x: unknown): x is Data => x !== null && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const number = (x: unknown, low: number, high: number, integer = false): x is number => typeof x === 'number' && Number.isFinite(x) && x >= low && x <= high && (!integer || Number.isInteger(x));
const list = (x: unknown, max: number): x is unknown[] => {
  if (!Array.isArray(x) || x.length > max) return false;
  for (let i = 0; i < x.length; i++) if (!Object.hasOwn(x, i)) return false;
  return true;
};
const unique = (x: unknown[]) => new Set(x).size === x.length;
const knownStrings = (x: unknown, ids: string[]): x is string[] => list(x, ids.length) && unique(x) && x.every(item => typeof item === 'string' && ids.includes(item));
const exact = (x: Data, keys: string[]) => Object.keys(x).length === keys.length && keys.every(key => Object.hasOwn(x, key));
const equipmentRecord = (x: unknown, low: number, high: number, integer = false): boolean => record(x) && exact(x, EQUIPMENT_IDS) && EQUIPMENT_IDS.every(e => number(x[e], low, high, integer));

/** Saves are data only. Validate every nested field before cloning an accepted snapshot. */
export function restoreCampaign(data: unknown): Campaign | null {
  try {
    if (!record(data) || !exact(data, ['version', 'seed', 'day', 'player', 'phase', 'provinces', 'nations', 'divisions', 'wars', 'battles', 'dispatches', 'nextId', 'tension', 'score'])) return null;
    if (data.version !== 1 || !number(data.seed, 0, 4294967295, true) || !number(data.day, 0, 1_000_000, true) || !nationId(data.player)
      || typeof data.phase !== 'string' || !['setup', 'playing', 'victory', 'defeat'].includes(data.phase) || !number(data.nextId, 1, 10_000_000, true)
      || !number(data.tension, 0, 100) || !number(data.score, 0, 1_000_000_000)) return null;
    if (!list(data.provinces, PROVINCES.length) || data.provinces.length !== PROVINCES.length || !data.provinces.every((p, i) => record(p)
      && exact(p, ['owner', 'fort', 'infrastructure', 'civilian', 'military', 'dockyard']) && nationId(p.owner)
      && BUILDING_IDS.every(key => number(p[key], 0, BUILDINGS[key].max, true)) && (PROVINCES[i].port || p.dockyard === 0))) return null;
    if (!list(data.nations, 6) || data.nations.length !== 6) return null;
    for (let i = 0; i < 6; i++) {
      const n = data.nations[i];
      if (!record(n) || !exact(n, ['id', 'pp', 'stability', 'support', 'manpower', 'fuel', 'stock', 'allocation', 'efficiency', 'research', 'techs', 'focus', 'focuses', 'construction', 'recruitment', 'allies', 'relations', 'justification', 'trade', 'airMission', 'navalMission', 'mobilization', 'capitulated'])
        || n.id !== i || !number(n.pp, 0, 1_000) || !number(n.stability, 0, 1) || !number(n.support, 0, 1)
        || !number(n.manpower, 0, MAX_STOCK) || !number(n.fuel, 0, MAX_STOCK) || !equipmentRecord(n.stock, 0, MAX_STOCK)
        || !equipmentRecord(n.allocation, 0, PROVINCES.length * 8, true) || !equipmentRecord(n.efficiency, 0.05, 1)
        || !number(n.mobilization, 0, 3, true) || typeof n.capitulated !== 'boolean') return null;
      if (!knownStrings(n.techs, TECHS.map(t => t.id)) || !knownStrings(n.focuses, FOCUSES.map(f => f.id))) return null;
      const techs = n.techs;
      const focuses = n.focuses;
      if (!TECHS.filter(t => techs.includes(t.id)).every(t => t.requires.every(id => techs.includes(id)))
        || !FOCUSES.filter(f => focuses.includes(f.id)).every(f => f.requires.every(id => focuses.includes(id)))) return null;
      if (!list(n.research, 2) || !n.research.every(r => record(r) && exact(r, ['tech', 'progress']) && typeof r.tech === 'string'
        && TECHS.some(t => t.id === r.tech && !techs.includes(t.id) && t.requires.every(id => techs.includes(id)) && number(r.progress, 0, t.days - 1)))) return null;
      if (!unique(n.research.map(r => (r as Data).tech))) return null;
      if (n.focus !== null && (!record(n.focus) || !exact(n.focus, ['id', 'progress']) || !FOCUSES.some(f => record(n.focus) && f.id === n.focus.id
        && !focuses.includes(f.id) && f.requires.every(id => focuses.includes(id)) && number(n.focus.progress, 0, f.days - 1)))) return null;
      if (!list(n.construction, 12) || !n.construction.every(j => record(j) && exact(j, ['province', 'kind', 'progress']) && provinceId(j.province)
        && BUILDING_IDS.includes(j.kind as Building) && number(j.progress, 0, BUILDINGS[j.kind as Building].cost)
        && (data.provinces as Data[])[j.province].owner === i && (j.kind !== 'dockyard' || PROVINCES[j.province].port))) return null;
      if (!list(n.recruitment, 12) || !n.recruitment.every(j => record(j) && exact(j, ['type', 'progress']) && UNIT_IDS.includes(j.type as UnitType)
        && number(j.progress, 0, TEMPLATES[j.type as UnitType].days))) return null;
      if (!list(n.allies, 5) || !unique(n.allies) || !n.allies.every(a => nationId(a) && a !== i)
        || !list(n.relations, 6) || n.relations.length !== 6 || !n.relations.every(r => number(r, -100, 100))) return null;
      if (n.justification !== null && (!record(n.justification) || !exact(n.justification, ['target', 'readyDay']) || !nationId(n.justification.target)
        || n.justification.target === i || !number(n.justification.readyDay, 0, 1_000_024, true))) return null;
      if ((n.trade !== null && (!nationId(n.trade) || n.trade === i)) || typeof n.airMission !== 'string' || !['reserve', 'support', 'superiority'].includes(n.airMission)
        || typeof n.navalMission !== 'string' || !['reserve', 'patrol', 'raiding'].includes(n.navalMission)) return null;
    }
    if (!list(data.divisions, MAX_UNITS) || !data.divisions.every(d => record(d) && exact(d, ['id', 'nation', 'province', 'type', 'hp', 'org', 'entrenchment', 'path', 'progress', 'experience'])
      && number(d.id, 1, Number(data.nextId) - 1, true) && nationId(d.nation) && provinceId(d.province) && UNIT_IDS.includes(d.type as UnitType)
      && number(d.hp, Number.MIN_VALUE, 100) && number(d.org, 0, 100) && number(d.entrenchment, 0, 1) && number(d.progress, 0, 1) && number(d.experience, 0, 1)
      && list(d.path, PROVINCES.length) && unique(d.path) && d.path.every(provinceId)
      && d.path.every((p, i) => adjacent(Number(i ? (d.path as number[])[i - 1] : d.province), Number(p))))) return null;
    if (!unique(data.divisions.map(d => (d as Data).id))) return null;
    if (!list(data.wars, 15) || !data.wars.every(w => Array.isArray(w) && w.length === 2 && nationId(w[0]) && nationId(w[1]) && w[0] < w[1])
      || !unique(data.wars.map(w => (w as number[]).join(':')))) return null;
    if (!list(data.battles, PROVINCES.length) || !data.battles.every(b => record(b) && exact(b, ['province', 'attacker', 'defender', 'balance', 'days']) && provinceId(b.province)
      && nationId(b.attacker) && nationId(b.defender) && b.attacker !== b.defender && number(b.balance, -1, 1) && number(b.days, 1, 1_000_000, true))) return null;
    if (!list(data.dispatches, 80) || !data.dispatches.every(d => record(d) && exact(d, ['day', 'text', 'kind']) && number(d.day, 0, Number(data.day), true)
      && typeof d.text === 'string' && d.text.length <= 220 && typeof d.kind === 'string' && ['info', 'battle', 'research', 'diplomacy'].includes(d.kind))) return null;
    const c = JSON.parse(JSON.stringify(data)) as Campaign;
    if (c.nations.reduce((sum, n) => sum + n.recruitment.length, c.divisions.length) > MAX_UNITS) return null;
    for (const n of c.nations) {
      if (n.allies.some(id => !c.nations[id].allies.includes(n.id) || atWar(c, n.id, id) || c.nations[id].capitulated)) return null;
      if (n.trade !== null && (atWar(c, n.id, n.trade) || c.nations[n.trade].capitulated)) return null;
      const capacity = industry(c, n.id);
      if (n.allocation.ships > capacity.dockyard || EQUIPMENT_IDS.filter(e => e !== 'ships').reduce((sum, e) => sum + n.allocation[e], 0) > capacity.military) return null;
      if (n.capitulated && (c.divisions.some(d => d.nation === n.id) || n.allies.length || n.research.length || n.focus || n.construction.length || n.recruitment.length)) return null;
      for (const p of PROVINCES) for (const kind of BUILDING_IDS) {
        if (c.provinces[p.id][kind] + n.construction.filter(j => j.province === p.id && j.kind === kind).length > BUILDINGS[kind].max) return null;
      }
    }
    if (c.wars.some(([a, b]) => c.nations[a].capitulated || c.nations[b].capitulated)) return null;
    if (c.battles.some(b => !atWar(c, b.attacker, b.defender))) return null;
    if ((c.phase === 'setup' && c.day !== 0) || (c.phase === 'defeat' && !c.nations[c.player].capitulated)
      || (c.phase === 'playing' && c.nations[c.player].capitulated)) return null;
    return c;
  } catch {
    return null;
  }
}
