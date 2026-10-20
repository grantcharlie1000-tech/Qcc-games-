import type { Kind } from './model';
import { SPECIES } from './species';
import { speciesBox } from './species/types';
export const artBox=(kind:Kind)=>speciesBox(SPECIES[kind]);
export const animalMarkup=(kind:Kind)=>`<g>${SPECIES[kind].art}</g>`;
/** Rasterised at 3× logical size so sprites stay crisp on high-density displays. */
export const animalSvg=(kind:Kind)=>{const b=artBox(kind);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" width="${b.width*3}" height="${b.height*3}" role="img" aria-label="${SPECIES[kind].name} toy cutout">${animalMarkup(kind)}</svg>`;};
