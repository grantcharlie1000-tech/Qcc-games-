import { poly, type SpeciesDef } from './types';
// Malayan tapir: charcoal head, shoulders and legs, bold cream saddle, short drooping snout, white-rimmed ears.
const S='M-57 9C-58 3-55-2-52-4C-48-7-44-13-40-17C-36-21-31-24-25-25C-14-26 4-31 24-31C37-31 45-27 47-16C49-6 47 4 45 10C44 14 45 18 44 22L44 31Q44 34 41 34L34 34Q31 34 31 31L31 22C26 19 20 20 10 20C-2 21-14 19-22 15L-22 31Q-22 34-25 34L-32 34Q-35 34-35 31L-35 15C-35 11-37 9-40 9C-43 9-45 11.5-47.5 11C-48.5 10.7-49.5 9.8-50 9.8C-52 11-54 13.5-56 13C-57.5 12.5-57.5 11-57 9Z';
const O='stroke="#1d1b22" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"';
export const tapir:SpeciesDef={
 name:'Tapir',mass:4.8,color:'#3a3f4b',
 shapes:[
  poly(-30,-23,-12,-26.5,6,-29.5,24,-30.5,36,-29,44,-23,47.5,-12,47,2,45,12,36,19,10,20,-10,20,-22,16,-32,8),
  poly(-52,-3,-38,-19,-30,-24,-24,-25,-24,6,-36,11.5,-47,9.5),
  poly(-57,9,-55,0,-51,-4,-47,1,-49,9.5,-55,13,-57.5,11.5),
  poly(-35,12,-22,14,-22,32,-23.5,34,-33.5,34,-35,32),
  poly(-11,14,-1,14,-1,32,-2.5,34,-9.5,34,-11,32),
  poly(15,14,26,14,26,32,24.5,34,16.5,34,15,32),
  poly(31,18,45,12,44.5,32,42.5,34,32.5,34,31,32),
  poly(-37,-19,-38,-28,-34,-32,-31,-30,-31,-19),
  poly(-30,-21,-28,-30,-24,-31,-22,-27,-25,-21),
 ],
 art:`<defs><clipPath id="tapir-clip"><path d="${S}"/></clipPath></defs>`+
 `<g ${O}><path d="M-11 12L-11 31Q-11 34-8 34L-4 34Q-1 34-1 31L-1 12Z" fill="#262a33"/><path d="M15 12L15 31Q15 34 18 34L23 34Q26 34 26 31L26 12Z" fill="#262a33"/>`+
 `<path d="M-30-21C-31-27-28-32-24-31C-21-30-22-25-25-20Z" fill="#262a33"/></g>`+
 `<path d="${S}" fill="#3a3f4b" ${O}/>`+
 `<path d="M-7-34C-6-16-2 6-2 24L22 24C24 12 32 4 52 3L52-34Z" fill="#f3ead6" clip-path="url(#tapir-clip)"/>`+
 `<path d="${S}" fill="none" ${O}/>`+
 `<path d="M-37-19C-40-25-38-32-33-32C-29-32-29-26-31-19Z" fill="#f6f1e6" ${O}/><path d="M-35.5-20C-37-25-36-29.5-33.5-29.5C-31.5-29.5-31.5-25-32.5-20Z" fill="#3a3f4b"/>`+
 `<circle cx="-41" cy="-7" r="2.6" fill="#5c6371"/><circle cx="-41" cy="-7" r="1.8" fill="#121318"/><circle cx="-41.6" cy="-7.7" r=".6" fill="#fff"/>`+
 `<g fill="none" stroke-linecap="round"><path d="M-54-1.5q1.5 1.5 0 3M-55.5 3q1.5 1.5 0 3M-50 9.8Q-48 8.5-45.5 8.5" stroke="#737a88" stroke-width="1.3"/><path d="M-28.5 34v-3M-6 34v-3M20.5 34v-3M37.5 34v-3" stroke="#1d1b22" stroke-width="1.3"/></g>`,
};
