import { poly, type SpeciesDef } from './types';
const O='stroke="#1d1b22" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"';
/** Near silhouette: torso, scruff, head, near ear and near legs, facing right. */
const BODY='M-31-11Q-14-16 4-14L10-17 12-20 14-19 17-23 19.5-24 23-28 27-37 32-28Q35-28 37-25L46-22Q49-21 48-18L46-16Q44-15 40-15L36-14 32-11 34-7 29-6 30-2 25 0Q23 2 22.5 5L24.5 26Q25.5 29 23 29L16 29 15.5 10Q12 6 6 7L2 6 0 9-3 6-5 9-8 5-13 5-14 10-19.5 16.5-19 26Q-17.5 29-20 29L-26.5 29-26.5 19-29 14-32 8-35 8-34 2Q-36-6-31-11Z';
const TAIL='M-29-11Q-40-12-45-2L-48 8-46 10-47 17-44 22-41 17-39 19-37 8Q-35 0-31-4Z';
export const wolf:SpeciesDef={
 name:'Wolf',mass:2.8,color:'#7d8696',
 shapes:[
  poly(-34,-4,-31,-11,-14,-15,4,-14,24,-10,29,-4,25,1,17,5,6,7,-33,4),
  poly(8,-15,23,-28,31,-12,29,-4,25,1,16,5,8,0),
  poly(23,-28,33,-28,46,-22,49,-19,46,-16,31,-11,25,-18),
  poly(24,-28,27,-36,32,-28),
  poly(14,-8,21,-8,24.5,26.5,23.5,29,16,29),
  poly(-31,-11,-14,-14,-13,2,-14,10,-19.5,16.5,-27,17,-33,7,-34,-4),
  poly(-19.5,15,-17.8,27.5,-19,29,-26.5,29,-26.5,16),
  poly(2,-10,9,-10,9.5,26.5,9,29,0.5,29),
  poly(-12,-10,-5,-10,-4.5,26.5,-5,29,-12.5,29),
  poly(-30,-11,-31,-4,-37,8,-47.5,7,-45,-2,-40,-9),
  poly(-37,7,-39,19,-44,22,-47,17,-48,8),
 ],
 art:`<defs><clipPath id="wolf-clip"><path d="${BODY}"/></clipPath><clipPath id="wolf-tail-clip"><path d="${TAIL}"/></clipPath></defs>`
 +`<path d="M22-27 23-35 27-29Z" fill="#596172" ${O}/>`
 +`<path d="M2 0 9 0 9.5 26Q10.5 29 8.5 29L0.5 29 1 20Z" fill="#596172" ${O}/>`
 +`<path d="M-12 0-5 0-4.5 26Q-3.5 29-5.5 29L-12.5 29-12 20Z" fill="#596172" ${O}/>`
 +`<path d="${TAIL}" fill="#7d8696" ${O}/>`
 +`<g clip-path="url(#wolf-tail-clip)"><path d="M-50-14-30-14-33-6-40-2-50 0Z" fill="#535b6b"/><path d="M-50 13-38 12-36 24-50 24Z" fill="#2f3440"/></g>`
 +`<path d="${BODY}" fill="#7d8696"/>`
 +`<g clip-path="url(#wolf-clip)">`
 +`<path d="M-38-22 18-26 10-12 4-8 0-10-6-6-10-9-16-5-22-8-30-3-38-4Z" fill="#535b6b"/>`
 +`<path d="M26-17 36-19 50-19 50-10 26-2 24-12Z" fill="#e4e6ea"/>`
 +`<path d="M24-8 36-10 36 4 18 8 20-4Z" fill="#e4e6ea"/>`
 +`<path d="M17 2Q2 1-14 6L17 12Z" fill="#e4e6ea"/>`
 +`</g>`
 +`<path d="${BODY}" fill="none" ${O}/>`
 +`<path d="M26.5-33 29-29.5 25.5-29.5Z" fill="#3f4655"/>`
 +`<path d="M-26 3Q-25-3-19-4" fill="none" stroke="#1d1b22" stroke-width="1.4" stroke-linecap="round"/>`
 +`<path d="M46-16Q43-15 40-15" fill="none" stroke="#1d1b22" stroke-width="1.3" stroke-linecap="round"/>`
 +`<path d="M45.5-22Q49-22 48.5-18.5 47-18 45-19Z" fill="#1d1b22" stroke="#1d1b22" stroke-width="1" stroke-linejoin="round"/>`
 +`<circle cx="34" cy="-23" r="1.9" fill="#1d1b22"/><circle cx="34.6" cy="-23.6" r=".6" fill="#fff"/>`,
};
