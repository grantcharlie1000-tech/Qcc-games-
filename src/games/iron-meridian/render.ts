import { LANDMASSES, MAP_HEIGHT, MAP_WIDTH, NATIONS, PROVINCES, RIVERS, ROADS, SEA_LINKS } from './map-data';
import { floorDpr, floorTierActive } from '../../perf/floor';
import { atWar, supplyLevels } from './model';
import type { Campaign, Division, MapView, NationId, ProvinceDefinition } from './types';

type Point = { x: number; y: number };
type Edge = { a: [number, number]; b: [number, number]; provinces: number[] };

const PAPER = '#eee0ba';
const INK = '#253a3e';
const TERRAIN = { plains: '#b2b59a', forest: '#748f7c', hills: '#ab9f83', mountain: '#9b9690', city: '#bca783' };

function trace(ctx: CanvasRenderingContext2D | Path2D, points: [number, number][]) {
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

function contains(polygon: [number, number][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function route(from: number, to: number) {
  const queue = [from], previous = new Map<number, number>([[from, -1]]);
  for (let head = 0; head < queue.length && !previous.has(to); head++) {
    for (const next of PROVINCES[queue[head]].neighbors) {
      if (!previous.has(next)) { previous.set(next, queue[head]); queue.push(next); }
    }
  }
  const path: number[] = [];
  for (let at = to; previous.has(at) && at >= 0; at = previous.get(at)!) path.unshift(at);
  return path;
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  const width = ctx.measureText(text).width + (text.length - 1) * spacing;
  let left = x - width / 2;
  for (const letter of text) { ctx.fillText(letter, left, y); left += ctx.measureText(letter).width + spacing; }
}

/** A pure presentation surface. MapView uses CSS pixels and world * zoom + pan. */
export function createRenderer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('A Canvas 2D context is required.');
  const ctx = context;
  let width = 1, height = 1, dpr = 1, disposed = false;
  const paths = PROVINCES.map(p => { const path = new Path2D(); trace(path, p.polygon); return path; });
  const land = new Path2D();
  LANDMASSES.forEach(points => trace(land, points));
  const edgeMap = new Map<string, Edge>();
  for (const p of PROVINCES) {
    for (let i = 0; i < p.polygon.length; i++) {
      const a = p.polygon[i], b = p.polygon[(i + 1) % p.polygon.length];
      const keys = [a.map(v => v.toFixed(2)).join(','), b.map(v => v.toFixed(2)).join(',')].sort();
      const key = keys.join('|'), existing = edgeMap.get(key);
      if (existing) existing.provinces.push(p.id);
      else edgeMap.set(key, { a, b, provinces: [p.id] });
    }
  }
  const edges = [...edgeMap.values()];
  const roads = ROADS.flatMap(stops => stops.slice(1).map((stop, i) => route(stops[i], stop)));
  const marks = PROVINCES.map(p => {
    const result: Point[] = [];
    const xs = p.polygon.map(v => v[0]), ys = p.polygon.map(v => v[1]);
    let seed = p.id * 1907 + 41;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 28 && result.length < 9; i++) {
      const x = Math.min(...xs) + random() * (Math.max(...xs) - Math.min(...xs));
      const y = Math.min(...ys) + random() * (Math.max(...ys) - Math.min(...ys));
      if (contains(p.polygon, x, y) && Math.hypot(x - p.x, y - p.y) > 15) result.push({ x, y });
    }
    return result;
  });

  function screenPoint(province: number, view: MapView): Point {
    const p = PROVINCES[province];
    return { x: p.x * view.zoom + view.panX, y: p.y * view.zoom + view.panY };
  }

  function line(points: Point[]) {
    if (!points.length) return;
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
  }

  function smooth(points: [number, number][]) {
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], next = points[i + 1];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + next[0]) / 2, (p[1] + next[1]) / 2);
    }
    const last = points[points.length - 1]; ctx.lineTo(last[0], last[1]); ctx.stroke();
  }

  function terrain(p: ProvinceDefinition, overlay: boolean) {
    ctx.save(); ctx.clip(paths[p.id]);
    ctx.strokeStyle = overlay ? '#263d3580' : '#263d3538';
    ctx.fillStyle = overlay ? '#263d3538' : '#263d351b'; ctx.lineWidth = 1.2;
    for (const { x, y } of marks[p.id]) {
      if (p.terrain === 'mountain' || p.terrain === 'hills') {
        const h = p.terrain === 'mountain' ? 12 : 5;
        ctx.beginPath(); ctx.moveTo(x - 9, y + 6); ctx.lineTo(x, y - h); ctx.lineTo(x + 9, y + 6);
        ctx.fill(); ctx.stroke();
        if (p.terrain === 'mountain') {
          ctx.beginPath(); ctx.moveTo(x - 3, y - 6); ctx.lineTo(x, y - 12); ctx.lineTo(x + 3, y - 6);
          ctx.strokeStyle = '#e4dfc9a0'; ctx.stroke(); ctx.strokeStyle = overlay ? '#263d3580' : '#263d3538';
        }
      } else if (p.terrain === 'forest') {
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x - 4, y + 3); ctx.lineTo(x + 4, y + 3); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 7); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function counter(unit: Division, x: number, y: number, count: number, selected: boolean) {
    const nation = NATIONS[unit.nation], w = 34, h = 29;
    ctx.save(); ctx.translate(x, y);
    ctx.shadowColor = '#0008'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    ctx.fillStyle = nation.dark; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = selected ? '#ffe8a0' : '#eadfc6'; ctx.lineWidth = selected ? 2 : 0.8;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = nation.color; ctx.fillRect(-15, -12, 30, 12);
    ctx.strokeStyle = '#122b30'; ctx.lineWidth = 1;
    if (unit.type === 'armored') {
      ctx.beginPath(); ctx.ellipse(-4, -6, 7, 3.8, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.strokeRect(-12, -10, 17, 8);
      ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(5, -2); ctx.moveTo(5, -10); ctx.lineTo(-12, -2); ctx.stroke();
      if (unit.type === 'motorized') { ctx.fillStyle = '#132d31'; ctx.fillRect(-10, -1, 3, 2); ctx.fillRect(0, -1, 3, 2); }
    }
    ctx.font = '700 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#17333a'; ctx.fillText(String(count), 10, -5);
    ctx.fillStyle = '#f3e9cf'; ctx.fillText(nation.short, 0, 5);
    ctx.fillStyle = '#172b30'; ctx.fillRect(-15, 11, 30, 2);
    ctx.fillStyle = '#8aca97'; ctx.fillRect(-15, 11, 30 * Math.max(0, Math.min(1, unit.hp / 100)), 2);
    ctx.fillStyle = '#172b30'; ctx.fillRect(-15, 14, 30, 2);
    ctx.fillStyle = '#8cb8db'; ctx.fillRect(-15, 14, 30 * Math.max(0, Math.min(1, unit.org / 100)), 2);
    ctx.restore();
  }

  function draw(c: Campaign, view: MapView) {
    if (disposed || !Number.isFinite(view.zoom) || view.zoom <= 0) return;
    const floor = floorTierActive();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (floor) { ctx.fillStyle = '#112b3a'; ctx.fillRect(0, 0, width, height); }
    else {
      const sea = ctx.createLinearGradient(0, 0, width, height);
      sea.addColorStop(0, '#173442'); sea.addColorStop(0.55, '#112b3a'); sea.addColorStop(1, '#0b2331');
      ctx.fillStyle = sea; ctx.fillRect(0, 0, width, height);
    }
    ctx.save(); ctx.translate(view.panX, view.panY); ctx.scale(view.zoom, view.zoom);
    const k = 1 / view.zoom;
    if (!floor) {
      ctx.lineWidth = k * 0.6; ctx.strokeStyle = '#9dbdb915';
      ctx.beginPath();
      for (let x = -200; x <= 1800; x += 100) { ctx.moveTo(x, -200); ctx.lineTo(x, 1200); }
      for (let y = -200; y <= 1200; y += 100) { ctx.moveTo(-200, y); ctx.lineTo(1800, y); }
      ctx.stroke();
      ctx.strokeStyle = '#8dbab00b'; ctx.lineWidth = 32; ctx.stroke(land);
      ctx.strokeStyle = '#8dbab012'; ctx.lineWidth = 18; ctx.stroke(land);
    }
    ctx.strokeStyle = '#a8c5b225'; ctx.lineWidth = floor ? 2 : 7; ctx.stroke(land);
    const supplyMaps = view.mode === 'supply' ? NATIONS.map(n => supplyLevels(c, n.id)) : [];
    const supplies = view.mode === 'supply' ? PROVINCES.map(p => supplyMaps[c.provinces[p.id]?.owner ?? p.home][p.id]) : [];
    if (floor && view.mode !== 'supply') {
      const grouped = new Map<string, Path2D>();
      for (const p of PROVINCES) {
        const owner = c.provinces[p.id]?.owner ?? p.home;
        const color = view.mode === 'terrain' ? TERRAIN[p.terrain] : NATIONS[owner].color;
        let path = grouped.get(color);
        if (!path) { path = new Path2D(); grouped.set(color, path); }
        path.addPath(paths[p.id]);
      }
      for (const [color, path] of grouped) { ctx.fillStyle = color; ctx.fill(path); }
    }
    for (const p of PROVINCES) {
      if (floor && view.mode !== 'supply') break;
      const state = c.provinces[p.id], owner = state?.owner ?? p.home;
      ctx.fillStyle = view.mode === 'terrain' ? TERRAIN[p.terrain] : view.mode === 'supply'
        ? `hsl(${Math.round(12 + supplies[p.id] * 108)} 24% ${Math.round(34 + supplies[p.id] * 24)}%)` : NATIONS[owner].color;
      ctx.fill(paths[p.id]);
      if (floor) continue;
      const shade = ctx.createLinearGradient(p.x - 50, p.y - 70, p.x + 50, p.y + 70);
      shade.addColorStop(0, '#f8efc714'); shade.addColorStop(1, '#112a2920');
      ctx.fillStyle = shade; ctx.fill(paths[p.id]);
      ctx.strokeStyle = '#253d3e50'; ctx.lineWidth = 0.65 * k; ctx.stroke(paths[p.id]);
      terrain(p, view.mode === 'terrain');
      if (owner !== p.home) {
        ctx.save(); ctx.clip(paths[p.id]); ctx.strokeStyle = `${NATIONS[p.home].dark}66`; ctx.lineWidth = 2.5 * k;
        ctx.beginPath();
        for (let x = p.x - 220; x < p.x + 220; x += 13 * k) { ctx.moveTo(x, p.y - 140); ctx.lineTo(x + 180, p.y + 140); }
        ctx.stroke(); ctx.restore();
      }
    }
    if (!floor) {
      ctx.save(); ctx.clip(land);
      ctx.strokeStyle = '#f0d9aa48'; ctx.lineWidth = 2.5 * k; ctx.setLineDash([3 * k, 4 * k]);
      roads.forEach(path => line(path.map(id => PROVINCES[id]))); ctx.setLineDash([]);
      ctx.strokeStyle = '#d3e1ca55'; ctx.lineWidth = 4 * k;
      RIVERS.forEach(smooth); ctx.strokeStyle = '#456c82'; ctx.lineWidth = 1.7 * k; RIVERS.forEach(smooth);
      ctx.restore();
      ctx.strokeStyle = '#e4dfbd99'; ctx.lineWidth = 1.25 * k; ctx.stroke(land);
    }
    if (!floor && view.mode === 'supply') {
      ctx.save(); ctx.strokeStyle = '#d8d8b353'; ctx.lineWidth = 1.1 * k; ctx.setLineDash([3 * k, 7 * k]);
      for (const [a, b] of SEA_LINKS) {
        if (c.provinces[a]?.owner !== c.player && c.provinces[b]?.owner !== c.player) continue;
        const p = PROVINCES[a], q = PROVINCES[b];
        const east = p.x > 1200 || q.x > 1200;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(east ? Math.max(p.x, q.x) + 100 : (p.x + q.x) / 2, east ? (p.y + q.y) / 2 : Math.max(p.y, q.y) + 140, q.x, q.y); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.lineCap = 'round';
    if (floor) {
      ctx.beginPath();
      const contested: Edge[] = [];
      for (const edge of edges) {
        if (edge.provinces.length !== 2) continue;
        const [a, b] = edge.provinces.map(id => c.provinces[id]?.owner ?? PROVINCES[id].home);
        if (a === b) continue;
        ctx.moveTo(edge.a[0], edge.a[1]); ctx.lineTo(edge.b[0], edge.b[1]);
        if (atWar(c, a, b)) contested.push(edge);
      }
      ctx.strokeStyle = '#ecdfb4c9'; ctx.lineWidth = 1.6 * k; ctx.stroke();
      if (contested.length) {
        ctx.beginPath();
        for (const edge of contested) { ctx.moveTo(edge.a[0], edge.a[1]); ctx.lineTo(edge.b[0], edge.b[1]); }
        ctx.strokeStyle = '#e5a478'; ctx.lineWidth = 2.2 * k; ctx.setLineDash([5 * k, 4 * k]); ctx.stroke(); ctx.setLineDash([]);
      }
    } else for (const edge of edges) {
      if (edge.provinces.length !== 2) continue;
      const [a, b] = edge.provinces.map(id => c.provinces[id]?.owner ?? PROVINCES[id].home);
      if (a === b) continue;
      ctx.beginPath(); ctx.moveTo(...edge.a); ctx.lineTo(...edge.b);
      ctx.strokeStyle = '#203339'; ctx.lineWidth = 3.8 * k; ctx.stroke();
      ctx.strokeStyle = '#ecdfb4c9'; ctx.lineWidth = 1.3 * k; ctx.stroke();
      if (atWar(c, a, b)) {
        ctx.strokeStyle = '#e5a478'; ctx.lineWidth = 3 * k; ctx.setLineDash([5 * k, 4 * k]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (view.selected !== null && paths[view.selected]) {
      ctx.fillStyle = '#ffe2a12b'; ctx.fill(paths[view.selected]);
      ctx.strokeStyle = '#fff0b6'; ctx.lineWidth = 3 * k; ctx.stroke(paths[view.selected]);
    }
    // Geographic lettering stays part of the map, beneath the tactical counters.
    ctx.textBaseline = 'middle'; ctx.textAlign = floor ? 'center' : 'left';
    for (const nation of NATIONS) {
      const owned = PROVINCES.filter(p => p.home === nation.id);
      const x = owned.reduce((sum, p) => sum + p.x, 0) / owned.length;
      const y = owned.reduce((sum, p) => sum + p.y, 0) / owned.length;
      if (floor) {
        ctx.fillStyle = '#172e3d9c'; ctx.font = '600 16px Georgia, serif';
        ctx.fillText(nation.name.toUpperCase(), x, y);
        continue;
      }
      ctx.save(); ctx.translate(x, y); ctx.rotate(nation.id === 5 ? -0.17 : -0.08);
      ctx.fillStyle = '#172e3d9c'; ctx.font = '600 16px Georgia, serif';
      const words = nation.name.toUpperCase().split(' ');
      spaced(ctx, words[0], 0, -10, 3.5);
      ctx.font = '9px Georgia, serif'; spaced(ctx, words.slice(1).join(' '), 0, 10, 3);
      ctx.restore();
    }
    ctx.fillStyle = '#a6beb35c';
    if (floor) {
      ctx.font = 'italic 16px Georgia, serif';
      ctx.fillText('THE MERIDIAN SEA', 1010, 940);
      ctx.fillText('VESPER REACH', 100, 500);
    } else {
      ctx.font = 'italic 19px Georgia, serif';
      spaced(ctx, 'THE MERIDIAN SEA', 1010, 940, 5);
      ctx.font = 'italic 14px Georgia, serif'; spaced(ctx, 'VESPER REACH', 100, 500, 3);
    }
    ctx.restore();

    // The tactical layer is sized in CSS pixels so units remain legible at any zoom.
    const groups = new Map<number, Division[]>();
    for (const unit of c.divisions) {
      if (!groups.has(unit.province)) groups.set(unit.province, []);
      groups.get(unit.province)!.push(unit);
      if (unit.nation !== c.player || !unit.path.length) continue;
      const selected = view.units.includes(unit.id);
      const points = [unit.province, ...unit.path].map(id => screenPoint(id, view));
      ctx.strokeStyle = selected ? '#ffdea0' : '#fff4d78c'; ctx.lineWidth = selected ? 2.5 : 1.4;
      ctx.setLineDash(selected ? [] : [4, 4]); line(points); ctx.setLineDash([]);
      if (points.length > 1) {
        const end = points[points.length - 1], before = points[points.length - 2], angle = Math.atan2(end.y - before.y, end.x - before.x);
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - Math.cos(angle - 0.45) * 10, end.y - Math.sin(angle - 0.45) * 10);
        ctx.lineTo(end.x - Math.cos(angle + 0.45) * 10, end.y - Math.sin(angle + 0.45) * 10); ctx.closePath(); ctx.fill();
      }
    }
    for (const p of PROVINCES) {
      const s = screenPoint(p.id, view);
      if (s.x < -60 || s.y < -60 || s.x > width + 60 || s.y > height + 60) continue;
      if (!floor && p.port) {
        ctx.strokeStyle = '#173741'; ctx.lineWidth = 1.5;
        const x = s.x - 13, y = s.y + 19;
        ctx.beginPath(); ctx.arc(x, y - 4, 1.8, 0, Math.PI * 2); ctx.moveTo(x, y - 2); ctx.lineTo(x, y + 5);
        ctx.moveTo(x - 5, y); ctx.quadraticCurveTo(x - 4, y + 6, x, y + 5); ctx.quadraticCurveTo(x + 4, y + 6, x + 5, y); ctx.stroke();
      }
      if (p.capital || (!floor && view.zoom > 1.15 && !groups.has(p.id))) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = p.capital ? '600 11px system-ui, sans-serif' : '10px system-ui, sans-serif';
        if (!floor) { ctx.lineWidth = 3; ctx.strokeStyle = '#dfd5b580'; ctx.strokeText(p.name, s.x, s.y + 23); }
        ctx.fillStyle = INK; ctx.fillText(p.capital ? `★ ${p.name}` : p.name, s.x, s.y + 23);
      }
    }
    for (const [province, units] of groups) {
      const p = screenPoint(province, view);
      if (p.x < -50 || p.y < -50 || p.x > width + 50 || p.y > height + 50) continue;
      const selected = units.some(unit => view.units.includes(unit.id));
      const representative = units.find(unit => view.units.includes(unit.id)) ?? units[0];
      if (floor) {
        ctx.fillStyle = NATIONS[representative.nation].dark;
        ctx.fillRect(p.x - 16, p.y - 12, 32, 18);
        ctx.fillStyle = '#f3e9cf'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(units.length), p.x, p.y - 3);
      } else counter(representative, p.x, p.y - 2, units.length, selected);
    }
    for (const battle of c.battles) {
      const p = screenPoint(battle.province, view); p.x += 24; p.y -= 19;
      ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.fillStyle = '#172e36'; ctx.fill();
      ctx.strokeStyle = '#b77368'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, battle.balance)));
      ctx.strokeStyle = '#e9d49d'; ctx.stroke();
      ctx.font = '700 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = PAPER; ctx.fillText(`${Math.round(battle.balance * 100)}`, p.x, p.y);
    }
    // Small marginal details anchor the atlas without occupying a UI panel.
    if (!floor && width > 680 && height > 420) {
      const x = width - 42, y = height - 112;
      ctx.strokeStyle = '#d1c5a474'; ctx.fillStyle = '#d1c5a49c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 19); ctx.lineTo(x - 5, y + 9); ctx.lineTo(x, y + 4); ctx.lineTo(x + 5, y + 9); ctx.closePath(); ctx.stroke();
      ctx.fillRect(x - 0.5, y - 15, 1, 22);
      ctx.font = '10px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('N', x, y - 28);
    }
  }

  return {
    resize(w: number, h: number, ratio = window.devicePixelRatio || 1) {
      width = Math.max(1, w); height = Math.max(1, h);
      const device = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
      dpr = floorTierActive() ? floorDpr(width, height, device) : Math.max(1, Math.min(2, device));
      canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
    },
    draw,
    provinceAt(x: number, y: number, view: MapView) {
      if (disposed || !Number.isFinite(view.zoom) || view.zoom <= 0) return null;
      const worldX = (x - view.panX) / view.zoom, worldY = (y - view.panY) / view.zoom;
      return PROVINCES.find(p => contains(p.polygon, worldX, worldY))?.id ?? null;
    },
    screenPoint,
    fit(view: MapView, nation?: NationId) {
      const points = nation === undefined ? [[0, 0], [MAP_WIDTH, MAP_HEIGHT]] : PROVINCES.filter(p => p.home === nation).flatMap(p => p.polygon);
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const padding = nation === undefined ? 25 : 190;
      view.zoom = Math.max(0.18, Math.min(width / (maxX - minX + padding), height / (maxY - minY + padding))) * 0.94;
      view.panX = width / 2 - (minX + maxX) / 2 * view.zoom;
      view.panY = height / 2 - (minY + maxY) / 2 * view.zoom;
    },
    dispose() { disposed = true; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); },
  };
}
