// Generates every library poster in public/game-art/<id>/cover.svg as a lit isometric voxel diorama.
//   node scripts/generate-posters.mjs            (all posters, then syncs card colours in src/core/catalog.ts)
//   node scripts/generate-posters.mjs snake pool (only these)
//
// The renderer and palette live in scripts/posters/engine.mjs. Each poster's model is hand-built in
// scripts/posters/models/<id>.mjs (see docs/ARTWORK.md).
import {readFile, writeFile} from 'node:fs/promises';
import * as engine from './posters/engine.mjs';

const {C, backdrop} = engine;
export const TITLE_INK = '#fff3df';

// Backdrop hue and title accent per game. Card colours in src/core/catalog.ts derive from these.
export const POSTERS = {
  'color-blocks': {hue: 250, accent: C.yellow, title: 'A voxel puzzle board half filled with coloured blocks and a T piece hovering above'},
  'water-sort':   {hue: 290, accent: C.pink,   title: 'Three voxel glass tubes holding stacked bands of coloured water'},
  'fruit-merge':  {hue: 195, accent: C.red,    title: 'A blocky watermelon, orange and cherries on a wooden crate'},
  'tower':        {hue: 325, accent: C.teal,   title: 'A tower of stacked voxel slabs with the next slab sliding in'},
  'flappy-bird':  {hue: 30,  accent: C.yellow, title: 'A blocky yellow bird flapping between two green pipes'},
  'ball-run':     {hue: 265, accent: C.pink,   title: 'A voxel ball rolling down a neon-edged track past obstacles'},
  'animal-stack': {hue: 175, accent: C.yellow, title: 'A blocky elephant, lion and penguin balanced in a tower'},
  'snake':        {hue: 42,  accent: C.red,    title: 'A voxel snake slithering across a grass board towards an apple'},
  'neon-coil':    {hue: 240, accent: C.lime,   title: 'A glowing voxel worm weaving between bright energy orbs'},
  'minesweeper':  {hue: 200, accent: C.red,    title: 'A voxel minefield of raised tiles with numbers and flags'},
  'solitaire':    {hue: 345, accent: C.cream,  title: 'Four blocky playing cards fanned on green felt'},
  'block-fill':   {hue: 280, accent: C.yellow, title: 'A golden path of raised blocks winding through a tile grid'},
  'color-connect':{hue: 300, accent: C.yellow, title: 'Coloured voxel pipes linking pairs of matching pegs on a board'},
  'pool':         {hue: 158, accent: C.yellow, title: 'A voxel pool table with a rack of balls, the cue ball and a cue'},
  'globle':       {hue: 212, accent: C.yellow, title: 'A voxel globe with guessed countries shaded from cream to deep red'},
  'blockcraft':   {hue: 205, accent: C.green,  title: 'A floating grass island with a tree, flowers, water and a sheep'},
  'maze-muncher': {hue: 245, accent: C.teal,   title: 'A blocky muncher chasing pellets through a maze past a ghost'},
  'corn-clicker': {hue: 95,  accent: C.yellow, title: 'A giant voxel corn cob with floating plus-one coins'},
  'slipline':     {hue: 268, accent: C.teal,   title: 'A board of arrow tiles with one tile sliding free'},
  'quadfall':     {hue: 222, accent: C.orange, title: 'A wall of stacked coloured blocks with a T piece falling in'},
  'fivefold':     {hue: 150, accent: C.green,  title: 'Letter blocks spelling PLANT above PLAYS solved in green'},
  'claimline':    {hue: 330, accent: C.pink,   title: 'A voxel arena of coloured territories with a trail looping out'},
  'crossy-road':  {hue: 200, accent: C.red,    title: 'A voxel chicken in a Santa hat hopping across snow, road and river'},
  'quad-clash':   {hue: 22,  accent: C.yellow, title: 'A blocky egg fighter in a yellow headband holding a pencil blaster'},
  'femboy-obby':  {hue: 256, accent: C.pink,   title: 'A blocky boy in a pink cat-ear beanie and snowflake jumper hopping across gift boxes in the snow'},
  'last-light': {hue: 218, accent: C.gold, title: 'A voxel courier holding a golden lantern on a broken rooftop above a sleeping city'},
  'drift-club':   {hue: 183, accent: C.yellow, title: 'A voxel harbour shuffleboard with coral and blue pucks, a bullseye and a striped lighthouse'},
};

async function build(id) {
  const {default: model} = await import(`./posters/models/${id}.mjs`);
  const out = engine.poster(id, POSTERS[id], model, engine);
  await writeFile(new URL(`../public/game-art/${id}/cover.svg`, import.meta.url), out.svg);
  return `${String(out.svg.length).padStart(7)} bytes ${String(out.voxels).padStart(6)} voxels  scale ${out.a.toFixed(2)}`;
}

// Keeps each library card's colours in src/core/catalog.ts in step with its poster: the card colour is the
// flat backdrop (shown while the image loads), the title is always cream and the underline is the accent.
async function syncCatalog() {
  const file = new URL('../src/core/catalog.ts', import.meta.url);
  let src = await readFile(file, 'utf8');
  for (const [id, spec] of Object.entries(POSTERS)) {
    const re = new RegExp(`(\\{id:'${id}',title:'[^']*',)color:'[^']*',ink:'[^']*',accent:'[^']*'`);
    if (!re.test(src)) throw new Error(`Catalog entry for ${id} not found`);
    src = src.replace(re, `$1color:'${spec.color ?? backdrop(spec.hue)}',ink:'${TITLE_INK}',accent:'${spec.accent}'`);
  }
  await writeFile(file, src);
}

const only = process.argv.slice(2);
for (const id of only.length ? only : Object.keys(POSTERS)) {
  if (!POSTERS[id]) throw new Error(`No poster for ${id}`);
  console.log(id.padEnd(14), await build(id));
}
await syncCatalog();
