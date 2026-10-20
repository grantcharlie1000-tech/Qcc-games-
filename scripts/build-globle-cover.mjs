// Draws public/game-art/globle/cover.svg from the bundled Natural Earth display data.
//   node scripts/build-globle-cover.mjs
import {readFile, mkdir, writeFile} from 'node:fs/promises';

const world = JSON.parse(await readFile('src/games/globle/data/world.json', 'utf8'));
const cx = 160, cy = 262, R = 122, lat0 = 12 * Math.PI / 180, lng0 = 16 * Math.PI / 180;
// A round in progress: the hidden country (Chad) and guesses coloured by distance.
const fills = {TCD: '#2fa84f', NER: '#6b0a10', LBY: '#6b0a10', CMR: '#6b0a10', NGA: '#6b0a10', EGY: '#d72e1f', DZA: '#d72f1f', ESP: '#f58532', GBR: '#f9a74a', ZAF: '#faab52', BRA: '#fcc781'}; // real distances to Chad

function project([lng, lat]) {
  const φ = lat * Math.PI / 180, λ = lng * Math.PI / 180 - lng0;
  const cosc = Math.sin(lat0) * Math.sin(φ) + Math.cos(lat0) * Math.cos(φ) * Math.cos(λ);
  return {x: cx + R * Math.cos(φ) * Math.sin(λ), y: cy - R * (Math.cos(lat0) * Math.sin(φ) - Math.sin(lat0) * Math.cos(φ) * Math.cos(λ)), visible: cosc > 0.02};
}
function ringPath(ring) {
  const points = ring.map(project);
  if (points.filter(p => p.visible).length < 3) return '';
  for (const p of points) if (!p.visible) { // pin hidden points to the limb
    const k = R / Math.max(1e-6, Math.hypot(p.x - cx, p.y - cy)); p.x = cx + (p.x - cx) * k; p.y = cy + (p.y - cy) * k;
  }
  let d = '', last = null;
  for (const p of points) {
    const x = p.x.toFixed(1), y = p.y.toFixed(1);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1.2) continue;
    d += (d ? 'L' : 'M') + x + ' ' + y; last = p;
  }
  return d ? d + 'Z' : '';
}
const paths = [];
for (const feature of world.features) {
  const d = feature.polygons.map(polygon => ringPath(polygon[0])).join('');
  if (d) paths.push(`<path d="${d}" fill="${fills[feature.id] ?? '#a19d91'}"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 410" role="img" aria-labelledby="title desc"><title id="title">A blue globe with guessed countries shaded from pale cream to dark red around a green hidden country</title><desc id="desc">Original Globle cover drawn from Natural Earth public-domain country outlines.</desc>
<defs><linearGradient id="bg" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#1b4f7c"/><stop offset="1" stop-color="#0b2440"/></linearGradient><radialGradient id="sea" cx="38%" cy="32%" r="75%"><stop stop-color="#4c93cf"/><stop offset=".7" stop-color="#2d6fa8"/><stop offset="1" stop-color="#1c4f80"/></radialGradient><radialGradient id="shine" cx="34%" cy="26%" r="60%"><stop stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><clipPath id="disc"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>
<rect width="320" height="410" fill="url(#bg)"/>
<g fill="#ffe0a4" opacity=".55"><circle cx="38" cy="132" r="2"/><circle cx="286" cy="118" r="1.6"/><circle cx="270" cy="372" r="1.8"/><circle cx="30" cy="350" r="1.4"/><circle cx="300" cy="230" r="1.2"/></g>
<circle cx="${cx}" cy="${cy}" r="${R + 9}" fill="#8fc3ff" opacity=".16"/>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#sea)"/>
<g clip-path="url(#disc)" stroke="#55606b" stroke-width=".6" stroke-linejoin="round">${paths.join('')}</g>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#shine)"/>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#0b2440" stroke-opacity=".5" stroke-width="2"/>
</svg>
`;
await mkdir('public/game-art/globle', {recursive: true});
await writeFile('public/game-art/globle/cover.svg', svg);
console.log(`cover.svg ${svg.length} bytes, ${paths.length} shapes`);
