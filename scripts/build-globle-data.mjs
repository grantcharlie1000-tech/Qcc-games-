// Generates the Globle data files from Natural Earth admin-0 countries.
//   node scripts/build-globle-data.mjs
// Distances use the 1:10m geometry; the globe display uses separately simplified 1:50m geometry.
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {COUNTRIES, MERGED_INTO, EXCLUDED_PARTS} from '../src/games/globle/countries.ts';

const NE_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const NE_VERSION = '5.2.0-pre (natural-earth-vector master)';
const CACHE = '.cache/natural-earth';
const OUT = 'src/games/globle/data';
const EARTH_RADIUS_KM = 6371.0088; // IUGG mean radius
const MAX_STEP_KM = 1; // boundaries are densified so sampled distances are within 1 km of exact

async function source(scale) {
  const file = `${CACHE}/${NE_COMMIT}-ne_${scale}_admin_0_countries.geojson`;
  if (!existsSync(file)) {
    await mkdir(CACHE, {recursive: true});
    const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/ne_${scale}_admin_0_countries.geojson`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = await readFile(file);
  return {data: JSON.parse(bytes.toString('utf8')), sha256: createHash('sha256').update(bytes).digest('hex')};
}

const playable = new Set(COUNTRIES.map(c => c.id));
assert.equal(playable.size, COUNTRIES.length, 'duplicate playable id');
const polygonsOf = geometry => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
const ringCentre = ring => {let x = 0, y = 0; for (const [lon, lat] of ring) {x += lon; y += lat;} return [x / ring.length, y / ring.length];};
/** Splits a Natural Earth feature into playable land (owner id) and excluded overseas land (null). */
function classify(feature) {
  const code = feature.properties.ADM0_A3;
  const owner = playable.has(code) ? code : MERGED_INTO[code] ?? null;
  const exclusion = owner ? EXCLUDED_PARTS[owner] : undefined;
  const kept = [], excluded = [];
  for (const polygon of polygonsOf(feature.geometry)) {
    if (exclusion && !exclusion.keep(...ringCentre(polygon[0]))) excluded.push(polygon); else kept.push(polygon);
  }
  return {code, owner, kept, excluded};
}

const toVector = ([lon, lat]) => {
  const φ = lat * Math.PI / 180, λ = lon * Math.PI / 180;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
};
/** Every boundary ring as unit vectors, with no great-circle gap longer than MAX_STEP_KM. */
function densifiedPoints(polygons) {
  const out = [];
  const maxAngle = MAX_STEP_KM / EARTH_RADIUS_KM;
  for (const polygon of polygons) for (const ring of polygon) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = toVector(ring[i]), b = toVector(ring[i + 1]);
      out.push(a);
      const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const angle = Math.acos(dot);
      const steps = Math.ceil(angle / maxAngle);
      if (steps > 1) {
        const sin = Math.sin(angle);
        for (let s = 1; s < steps; s++) {
          const t = s / steps, wa = Math.sin((1 - t) * angle) / sin, wb = Math.sin(t * angle) / sin;
          out.push([wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]]);
        }
      }
    }
  }
  const flat = new Float64Array(out.length * 3);
  out.forEach((p, i) => flat.set(p, i * 3));
  return flat;
}

/** Bounding-sphere hierarchy over a point set, in chord (straight 3D) distance. */
function buildTree(points) {
  const count = points.length / 3;
  const order = new Uint32Array(count).map((_, i) => i);
  const nodes = [];
  function build(start, end) {
    let cx = 0, cy = 0, cz = 0;
    for (let i = start; i < end; i++) {const p = order[i] * 3; cx += points[p]; cy += points[p + 1]; cz += points[p + 2];}
    const n = end - start; cx /= n; cy /= n; cz /= n;
    let r = 0, minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = start; i < end; i++) {
      const p = order[i] * 3, x = points[p], y = points[p + 1], z = points[p + 2];
      r = Math.max(r, Math.hypot(x - cx, y - cy, z - cz));
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const node = {cx, cy, cz, r, start, end, left: null, right: null};
    nodes.push(node);
    if (n > 24) {
      const axis = maxX - minX >= maxY - minY && maxX - minX >= maxZ - minZ ? 0 : maxY - minY >= maxZ - minZ ? 1 : 2;
      const slice = Array.from(order.subarray(start, end)).sort((a, b) => points[a * 3 + axis] - points[b * 3 + axis]);
      order.set(slice, start);
      const mid = start + (n >> 1);
      node.left = build(start, mid); node.right = build(mid, end);
    }
    return node;
  }
  return {points, order, root: build(0, count)};
}

/** Exact minimum chord distance between two sampled boundaries (branch and bound). */
function minChord(A, B) {
  let best = Infinity;
  const gap = (a, b) => Math.max(0, Math.hypot(a.cx - b.cx, a.cy - b.cy, a.cz - b.cz) - a.r - b.r);
  function visit(a, b) {
    if (gap(a, b) >= best) return;
    const aLeaf = !a.left, bLeaf = !b.left;
    if (aLeaf && bLeaf) {
      for (let i = a.start; i < a.end; i++) {
        const p = A.order[i] * 3, x = A.points[p], y = A.points[p + 1], z = A.points[p + 2];
        for (let j = b.start; j < b.end; j++) {
          const q = B.order[j] * 3, dx = x - B.points[q], dy = y - B.points[q + 1], dz = z - B.points[q + 2];
          const d = dx * dx + dy * dy + dz * dz;
          if (d < best * best) best = Math.sqrt(d);
        }
      }
      return;
    }
    const pairs = (!aLeaf && (bLeaf || a.r >= b.r)) ? [[a.left, b], [a.right, b]] : [[a, b.left], [a, b.right]];
    pairs.sort((p, q) => gap(...p) - gap(...q));
    for (const [x, y] of pairs) visit(x, y);
  }
  visit(A.root, B.root);
  return best;
}
const chordToKm = chord => 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, chord / 2));

// ---------- planar helpers for the display data ----------
function ringArea(ring) { // km², equal-area approximation adequate for marker sizing
  let sum = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    sum += (x2 - x1) * Math.PI / 180 * (2 + Math.sin(y1 * Math.PI / 180) + Math.sin(y2 * Math.PI / 180));
  }
  return Math.abs(sum * EARTH_RADIUS_KM * EARTH_RADIUS_KM / 2);
}
const polygonArea = polygon => Math.max(0, ringArea(polygon[0]) - polygon.slice(1).reduce((s, r) => s + ringArea(r), 0));
function simplify(ring, tolerance) {
  if (ring.length <= 8) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = ring[s], [x2, y2] = ring[e];
    let max = 0, index = -1;
    for (let i = s + 1; i < e; i++) {
      const [x, y] = ring[i], dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len)) : 0;
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
      if (d > max) {max = d; index = i;}
    }
    if (max > tolerance) {keep[index] = 1; stack.push([s, index], [index, e]);}
  }
  const result = ring.filter((_, i) => keep[i]);
  return result.length >= 4 ? result : ring;
}
const round = value => Math.round(value * 1000) / 1000;
// d3-geo / three-globe read rings spherically: an exterior wound the wrong way covers the rest of the planet.
const signedArea = ring => {let s = 0; for (let i = 0; i + 1 < ring.length; i++) s += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]); return s;};
const wind = (ring, clockwise) => (signedArea(ring) > 0) === clockwise ? ring : [...ring].reverse();
const displayPolygon = polygon => polygon.map((ring, i) => wind(simplify(ring, 0.03).map(([x, y]) => [round(x), round(y)]), i === 0));

// ---------- distance table ----------
const ten = await source('10m'), fifty = await source('50m');
const geometry = new Map(COUNTRIES.map(c => [c.id, []]));
const labels = new Map();
for (const feature of ten.data.features) {
  const {code, owner, kept} = classify(feature);
  if (!owner) continue;
  geometry.get(owner).push(...kept);
  if (code === owner) labels.set(owner, [feature.properties.LABEL_X, feature.properties.LABEL_Y]);
}
for (const {id} of COUNTRIES) {
  assert.ok(geometry.get(id).length > 0, `${id} has no Natural Earth 1:10m geometry`);
  assert.ok(labels.has(id), `${id} has no label point`);
}
const ids = COUNTRIES.map(c => c.id).sort();
console.time('densify + index');
const trees = new Map(ids.map(id => [id, buildTree(densifiedPoints(geometry.get(id)))]));
console.timeEnd('densify + index');
console.log('sample points', [...trees.values()].reduce((s, t) => s + t.order.length, 0));
console.time('distances');
const km = [];
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  km.push(Math.round(chordToKm(minChord(trees.get(ids[i]), trees.get(ids[j])))));
}
console.timeEnd('distances');
const lookup = (a, b) => {
  let i = ids.indexOf(a), j = ids.indexOf(b); if (i > j) [i, j] = [j, i];
  return km[i * ids.length - i * (i + 1) / 2 + (j - i - 1)];
};
// Well-known geography checks: shared borders, enclaves, short sea gaps and overseas exclusions.
for (const [a, b] of [['FRA', 'ESP'], ['ITA', 'VAT'], ['ITA', 'SMR'], ['ZAF', 'LSO'], ['ESP', 'MAR'], ['CHN', 'RUS'], ['USA', 'CAN'], ['SOM', 'DJI'], ['CYP', 'CYP']].filter(([a, b]) => a !== b)) {
  assert.equal(lookup(a, b), 0, `${a}-${b} should share a land boundary`);
}
assert.ok(lookup('FRA', 'BRA') > 5000, 'French Guiana must not make France border Brazil');
assert.ok(lookup('NLD', 'VEN') > 5000, 'Caribbean Netherlands must not count');
assert.ok(lookup('GBR', 'FRA') > 20 && lookup('GBR', 'FRA') < 50, 'Dover Strait');
assert.ok(lookup('USA', 'RUS') > 0 && lookup('USA', 'RUS') < 10, 'Diomede Islands');
console.log('AUS-NZL (Macquarie to Auckland Islands)', lookup('AUS', 'NZL'));
for (const [a, b] of [['GBR','IRL'],['GBR','NOR'],['ESP','PRT'],['JPN','KOR'],['NZL','FJI'],['ARG','GBR'],['BRA','FRA'],['TWN','CHN'],['SGP','MYS'],['BHR','SAU'],['MLT','ITA'],['NRU','KIR'],['DEU','AUS'],['BWA','ZMB']]) console.log(a, b, lookup(a, b));

// ---------- display geometry ----------
const features = [];
for (const feature of fifty.data.features) {
  const {code, owner, kept, excluded} = classify(feature);
  if (kept.length) features.push({id: owner, polygons: kept.map(displayPolygon)});
  if (excluded.length) features.push({id: null, polygons: excluded.map(displayPolygon)});
}
const displayIds = new Set(features.map(f => f.id).filter(Boolean));
for (const {id} of COUNTRIES) assert.ok(displayIds.has(id), `${id} missing from display data`);
const countries = ids.map(id => {
  const [lng, lat] = labels.get(id);
  const area = Math.round(geometry.get(id).reduce((s, p) => s + polygonArea(p), 0));
  return {id, lat: round(lat), lng: round(lng), area};
});

await mkdir(OUT, {recursive: true});
const provenance = {
  source: 'Natural Earth Admin 0 – Countries (public domain), https://www.naturalearthdata.com/',
  repository: `https://github.com/nvkelso/natural-earth-vector/tree/${NE_COMMIT}`,
  version: NE_VERSION,
  sha256: {'ne_10m_admin_0_countries.geojson': ten.sha256, 'ne_50m_admin_0_countries.geojson': fifty.sha256},
  generator: 'scripts/build-globle-data.mjs'
};
await writeFile(`${OUT}/distances.json`, JSON.stringify({
  ...provenance,
  method: `Shortest great-circle distance between 1:10m land boundaries (sphere R=${EARTH_RADIUS_KM} km), boundaries densified to ≤${MAX_STEP_KM} km, rounded to whole km. Upper triangle, row-major, ids sorted.`,
  ids, km
}) + '\n');
await writeFile(`${OUT}/world.json`, JSON.stringify({...provenance, method: '1:50m geometry, Douglas–Peucker 0.03°, 0.001° precision. Display only.', countries, features}) + '\n');
console.log(`Wrote ${ids.length} countries, ${km.length} distances, ${features.length} display features`);
