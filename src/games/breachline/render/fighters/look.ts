/** The two squads' looks. Both wear the same cut of kit; Azure is in slate urban kit with a balaclava and goggles,
 * Ember in coyote kit with a scarf and glasses. Colour is never the only cue: each squad's shape (◆ Azure, ▲ Ember)
 * is a patch on both shoulders and on the helmet. */
import { PAT, SURF, surf, type Surface } from '../hero/geom';
import { SQUADS } from '../../config';

export interface Look {
  squad: 0 | 1;
  /** Squad colour (bands and patches). */
  band: number;
  mask: 'balaclava' | 'scarf';
  eyes: 'goggles' | 'glasses';
  shirt: Surface; pants: Surface; skin: Surface; face: Surface; hair: Surface; lip: Surface;
  glove: Surface; palm: Surface; knuckle: Surface;
  /** Plate carrier and pouch fabric (Cordura), webbing, helmet, polymer hardware, rubber, metal, boot leather. */
  kit: Surface; web: Surface; helmet: Surface; poly: Surface; rubber: Surface; metal: Surface; boot: Surface; lens: Surface;
  scarf: Surface;
}

const fab = (color: number, rough = 0.93) => surf(SURF.cloth, { color, rough, pat: PAT.fabric, wear: 0.15 });
const hex = (s: string) => Number(`0x${s.slice(1)}`);

export const LOOKS: readonly [Look, Look] = [
  {
    squad: 0, band: hex(SQUADS[0].color), mask: 'balaclava', eyes: 'goggles',
    shirt: fab(0x666d76), pants: fab(0x555b63), skin: surf(SURF.skin, { color: 0xb0866a }), face: fab(0x242628, 0.97),
    hair: fab(0x2a2420), lip: surf(SURF.skin, { color: 0x9a6a58 }),
    glove: surf(SURF.glove, { color: 0x262728 }), palm: surf(SURF.gloveTan, { color: 0x45423d }), knuckle: surf(SURF.knuckle, { color: 0x1c1d1e }),
    kit: fab(0x43484d, 0.9), web: surf(SURF.webbing, { color: 0x34383b }), helmet: surf(SURF.helmet, { color: 0x50565c, rough: 0.72 }),
    poly: surf(SURF.poly, { color: 0x1f2022 }), rubber: surf(SURF.rubber, {}), metal: surf(SURF.park, { color: 0x2d2e30 }),
    boot: surf(SURF.boot, { color: 0x1f1e1d }), lens: surf(SURF.lens, { color: 0x10171c }), scarf: fab(0x242628),
  },
  {
    squad: 1, band: hex(SQUADS[1].color), mask: 'scarf', eyes: 'glasses',
    shirt: fab(0x93826a), pants: fab(0x7c6d56), skin: surf(SURF.skin, { color: 0x8f6650 }), face: fab(0x8c7c60, 0.97),
    hair: fab(0x1e1915), lip: surf(SURF.skin, { color: 0x7a4f42 }),
    glove: surf(SURF.glove, { color: 0x4a4234 }), palm: surf(SURF.gloveTan, { color: 0x6e6150 }), knuckle: surf(SURF.knuckle, { color: 0x2c2a26 }),
    kit: fab(0x6f6650, 0.9), web: surf(SURF.webbing, { color: 0x5a5240 }), helmet: surf(SURF.helmet, { color: 0x7d7158, rough: 0.74 }),
    poly: surf(SURF.poly, { color: 0x2a2825 }), rubber: surf(SURF.rubber, {}), metal: surf(SURF.park, { color: 0x2d2e30 }),
    boot: surf(SURF.boot, { color: 0x5a4a37 }), lens: surf(SURF.lensAmber, { color: 0x2a1f10 }), scarf: fab(0x9a8a6a),
  },
];

/** Body surfaces in tag order (body.ts `BT`). */
export const bodySurfaces = (l: Look): Surface[] => [l.shirt, l.pants, l.skin, surf(l.web, { color: l.band, rough: 0.7 }), l.face, l.hair, l.glove, l.palm, l.knuckle, l.lip];
