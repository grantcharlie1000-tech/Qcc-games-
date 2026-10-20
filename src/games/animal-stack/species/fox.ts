import { poly, type SpeciesDef } from './types';
// Red fox in side profile: level bushy tail with a white tip, white bib, black stockings, dark-backed ears.
const SIL='M-22-4Q-21-10-14-11C-6-12.5 4-12.5 12-10.5Q16-12 18.5-17.5L20.5-20 24-33 31-21Q35.5-21 38.5-17.5L46-12.8Q48.5-10.8 46-9L38.5-7.5Q33-6 28-5.5Q23-3 21.5 3L21 6 20.5 23.5Q22.5 24.5 22.5 26.5L15 26.5 15.5 22 15 7.5Q4 9.5-7 7.5L-8.5 18-9 23.5Q-6 24.5-6 26.5L-13.5 26.5-14 19Q-20 13-21 6Q-23 1-22-4Z';
const TAIL='M-14-11.5Q-24-13.5-33-12.5Q-43-11-47-3Q-48.5 4-41 8.5Q-31 13.5-19 8Z';
const FAR='M6 2 12 2 9.5 23.5Q12.5 24.5 12.5 26.5L3.5 26.5 4 22ZM-22 0-13 3-17.5 23.5Q-15.5 24.5-15.5 26.5L-25 26.5-24.5 18Z';
const O='stroke="#1d1b22" stroke-width="2.6"';
const INK='#1d1b22',SOCK='#2a1f24',CREAM='#fff4e6';
export const fox:SpeciesDef={
 name:'Fox',mass:1.8,color:'#ee6422',
 shapes:[
  poly(-47,-2,-44.5,-7.5,-38,-11,-29,-12.8,12,-10.5,20,-4,21,4,15,7.5,-32,10.5,-40,8.3,-45.5,4),
  poly(12,-10,18.5,-17.5,26,-12,25,-3,21.5,4,16,0),
  poly(18.5,-18,24,-21.5,35,-20.5,46.5,-12.8,47.5,-10,46,-9,38.5,-7.5,28,-5.5,21,-8),
  poly(21,-20,24,-32,30.5,-21),
  poly(16.5,-18,18.2,-29.5,23.5,-19),
  poly(15,-4,20.5,-4,21,5,20.5,26.5,15,26.5),
  poly(6,-4,12,-4,9.5,26.5,3.5,26.5),
  poly(-8,-2,-9,26.5,-13.5,26.5,-15,-2),
  poly(-7,8,-8,14,-14,19,-18.5,12,-19,7),
  poly(-22,-4,-13,-4,-13,3,-17.5,26.5,-25,26.5,-24.5,18),
 ],
 art:`<defs><clipPath id="fox-c"><path d="${SIL}"/></clipPath><clipPath id="fox-t"><path d="${TAIL}"/></clipPath><clipPath id="fox-f"><path d="${FAR}"/></clipPath></defs>`+
 `<g stroke-linejoin="round" stroke-linecap="round">`+
 // far ear and far legs: darker tone, drawn first
 `<path d="M16-18 18-30.5 24-19Z" fill="${SOCK}" ${O}/><path d="${FAR}" fill="#b8461c"/>`+
 `<path d="M2 14Q8 12 14 14V28H2ZM-27 18Q-20 16-12 18V28H-27Z" fill="#191317" clip-path="url(#fox-f)"/><path d="${FAR}" fill="none" ${O}/>`+
 // bushy tail with a white tip
 `<path d="${TAIL}" fill="#ee6422"/><path d="M-35-15-38.5-8-36-3-39 3-36.5 9-38 15H-55V-15Z" fill="${CREAM}" clip-path="url(#fox-t)"/><path d="${TAIL}" fill="none" ${O}/>`+
 // body, head and near legs
 `<path d="${SIL}" fill="#ee6422"/><g clip-path="url(#fox-c)"><path d="M26-12Q34-9 47-10V0L24 2 20 8 17 1Q20-7 26-12Z" fill="${CREAM}"/>`+
 `<path d="M12 14Q18 12 25 14V28H12ZM-16 18Q-11 16-4 18V28H-16Z" fill="${SOCK}"/><path d="M19-20 24-35 34-20Z" fill="${SOCK}"/></g>`+
 `<path d="M24.6-28 28.8-21H24Z" fill="#ffc48f"/><path d="M-8.5 9Q-15 6-17.5-1" fill="none" stroke="#b8461c" stroke-width="1.4"/>`+
 `<path d="${SIL}" fill="none" ${O}/>`+
 `<circle cx="46.8" cy="-11" r="2" fill="${INK}"/><circle cx="33" cy="-16" r="1.9" fill="${INK}"/><circle cx="33.6" cy="-16.6" r=".6" fill="#fff"/>`+
 `<path d="M45-8.8Q42-7.9 39.5-8.4" fill="none" stroke="${INK}" stroke-width="1.2"/></g>`,
};
