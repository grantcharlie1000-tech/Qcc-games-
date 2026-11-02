// Strongroom operator palette — the single source of truth for swatch layout
// and colours. Imported by the offline pipeline (tools/build.mjs), by
// out/attachments.js (procedural kit) and by preview.html.
//
// Texture: 64 x 64 px, an 8 x 8 grid of 8 x 8 px flat swatches. Every vertex
// UV sits on a swatch CENTRE, and all three corners of a triangle share one
// swatch, so sampling is constant per triangle: NEAREST filtering, no mipmaps,
// no bleeding at any distance.
//
// UV convention = glTF: (0,0) is the TOP-LEFT pixel of the image. three's
// GLTFLoader sets flipY=false, and a DataTexture's first data row is v=0, so a
// runtime DataTexture built by paletteRGBA() lines up with the embedded PNG.
//
// Rows:
//   0  side gear A   TOP SLEEVE TROUSERS HELMET POUCH BELT BOOTS GLOVES
//   1  side gear B   COLLAR PAD PLATE STRAP HOOD CAP KIT_DARK KIT_LIGHT
//   2  shared        SKIN FACE_DARK METAL METAL_DARK LENS RUBBER GEAR_GREY SKIN_ALT
//   3  TEAM TINT     ARMBAND STRIPE PATCH TEAM_LIGHT  (engine paints ally/enemy)
//   4-7 reserved     (neutral grey; free for future operator accents)

export const PALETTE_SIZE = 64;
export const CELL = 8;
export const GRID = PALETTE_SIZE / CELL;

/** slot name -> [column, row] in the 8 x 8 swatch grid. */
export const SLOTS = Object.freeze({
  TOP: [0, 0], SLEEVE: [1, 0], TROUSERS: [2, 0], HELMET: [3, 0],
  POUCH: [4, 0], BELT: [5, 0], BOOTS: [6, 0], GLOVES: [7, 0],
  COLLAR: [0, 1], PAD: [1, 1], PLATE: [2, 1], STRAP: [3, 1],
  HOOD: [4, 1], CAP: [5, 1], KIT_DARK: [6, 1], KIT_LIGHT: [7, 1],
  SKIN: [0, 2], FACE_DARK: [1, 2], METAL: [2, 2], METAL_DARK: [3, 2],
  LENS: [4, 2], RUBBER: [5, 2], GEAR_GREY: [6, 2], SKIN_ALT: [7, 2],
  ARMBAND: [0, 3], STRIPE: [1, 3], PATCH: [2, 3], TEAM_LIGHT: [3, 3],
});

/** Swatches the engine re-paints with the viewer-relative team colour. */
export const TEAM_SLOTS = Object.freeze(['ARMBAND', 'STRIPE', 'PATCH', 'TEAM_LIGHT']);

/** Viewer-relative team colours (DESIGN.md §9.2). */
export const TINTS = Object.freeze({ ally: '#3D9BFF', enemy: '#FF8A1F' });
export const TEAM_EMISSIVE_INTENSITY = 0.6;
/** Untinted team swatch colour baked into the GLBs (engine always overrides). */
export const TEAM_NEUTRAL = '#C8C8C8';

/**
 * Side gear colours (sRGB). Low saturation on purpose: the second side cue
 * must never compete with the saturated ally-blue / enemy-orange tint.
 */
export const SIDE_COLOURS = Object.freeze({
  // Attackers: olive / tan / coyote.
  attack: {
    TOP: '#676b49', SLEEVE: '#8a7c5d', TROUSERS: '#776d52', HELMET: '#5d6243',
    POUCH: '#5a513f', BELT: '#3d382d', BOOTS: '#2e2a25', GLOVES: '#3a3833',
    COLLAR: '#545839', PAD: '#7c7354', PLATE: '#4d5037', STRAP: '#2f2d27',
    HOOD: '#7f7457', CAP: '#6a6d4a', KIT_DARK: '#34362c', KIT_LIGHT: '#a49776',
  },
  // Defenders: slate / navy / steel.
  defend: {
    TOP: '#46505e', SLEEVE: '#5f6772', TROUSERS: '#3c4553', HELMET: '#3a4452',
    POUCH: '#323a46', BELT: '#262b33', BOOTS: '#1f2227', GLOVES: '#2b2d31',
    COLLAR: '#353e4b', PAD: '#58616d', PLATE: '#2e3643', STRAP: '#23262c',
    HOOD: '#4c5664', CAP: '#3d4654', KIT_DARK: '#2a2f37', KIT_LIGHT: '#8b94a1',
  },
});

export const SHARED_COLOURS = Object.freeze({
  SKIN: '#b8875f', FACE_DARK: '#1e1b19', METAL: '#7a7f86', METAL_DARK: '#3b3f45',
  LENS: '#1a2330', RUBBER: '#1d1d1e', GEAR_GREY: '#54575b', SKIN_ALT: '#8a5e42',
});

const RESERVED = '#808080';

/** Swatch-centre UV of a slot, glTF convention. */
export function slotUV(slot) {
  const cell = SLOTS[slot];
  if (!cell) throw new Error(`unknown palette slot ${slot}`);
  return [(cell[0] * CELL + CELL / 2) / PALETTE_SIZE, (cell[1] * CELL + CELL / 2) / PALETTE_SIZE];
}

/** Pixel rectangle of a slot: { x, y, w, h } with y measured from the TOP. */
export function slotRect(slot) {
  const [c, r] = SLOTS[slot];
  return { x: c * CELL, y: r * CELL, w: CELL, h: CELL };
}

/** Which slot a UV lands in (inverse of slotUV), or null. */
export function slotAt(u, v) {
  const c = Math.floor(u * GRID), r = Math.floor(v * GRID);
  for (const [name, cell] of Object.entries(SLOTS)) if (cell[0] === c && cell[1] === r) return name;
  return null;
}

function hexRGB(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Resolved colour of every slot for one side and tint. `overrides` replaces
 * individual slots (e.g. a player-profile sleeve colour for the FP arms).
 */
export function paletteColours(side = 'attack', tint = null, overrides = null) {
  const sideSet = SIDE_COLOURS[side];
  if (!sideSet) throw new Error(`unknown side ${side}`);
  const team = tint ? (TINTS[tint] || tint) : TEAM_NEUTRAL;
  const out = {};
  for (const slot of Object.keys(SLOTS)) {
    out[slot] = TEAM_SLOTS.includes(slot) ? team : (sideSet[slot] || SHARED_COLOURS[slot]);
  }
  if (overrides) for (const [slot, hex] of Object.entries(overrides)) { if (!SLOTS[slot]) throw new Error(`unknown slot ${slot}`); out[slot] = hex; }
  return out;
}

/**
 * RGBA8 pixels for a palette variant (row 0 = top = v 0).
 * @param {'attack'|'defend'} side
 * @param {'ally'|'enemy'|string|null} tint  team colour, a hex, or null (neutral)
 * @param {Record<string,string>|null} overrides  per-slot hex overrides
 */
export function paletteRGBA(side = 'attack', tint = null, overrides = null) {
  const px = new Uint8Array(PALETTE_SIZE * PALETTE_SIZE * 4);
  const colours = paletteColours(side, tint, overrides);
  for (let i = 0; i < PALETTE_SIZE * PALETTE_SIZE; i++) {
    const rgb = hexRGB(RESERVED);
    px.set([...rgb, 255], i * 4);
  }
  for (const [slot, hex] of Object.entries(colours)) {
    const { x, y } = slotRect(slot);
    const rgb = hexRGB(hex);
    for (let yy = y; yy < y + CELL; yy++) {
      for (let xx = x; xx < x + CELL; xx++) px.set([...rgb, 255], (yy * PALETTE_SIZE + xx) * 4);
    }
  }
  return px;
}

/** RGBA8 emissive mask: white on the team swatches, black elsewhere. */
export function emissiveMaskRGBA() {
  const px = new Uint8Array(PALETTE_SIZE * PALETTE_SIZE * 4);
  for (let i = 0; i < PALETTE_SIZE * PALETTE_SIZE; i++) px[i * 4 + 3] = 255;
  for (const slot of TEAM_SLOTS) {
    const { x, y } = slotRect(slot);
    for (let yy = y; yy < y + CELL; yy++) {
      for (let xx = x; xx < x + CELL; xx++) px.set([255, 255, 255, 255], (yy * PALETTE_SIZE + xx) * 4);
    }
  }
  return px;
}
