import { poly, type SpeciesDef } from './types';
/** Silverback knuckle-walking to the right: massive near arm forward, short legs behind, silver saddle on the back. */
const BODY='M14-38Q20-48 30-46Q38-44 42-35L44-32Q44-29 42-28Q47-25 47-20Q46-15 41-14Q37-14 36-12Q43-4 41 6Q44 16 42 27L44 33Q45 38 41 38L28 38Q24 38 25 33Q26 27 24 20Q22 12 21 6Q16 9 8 9L-14 10Q-17 16-21 22Q-26 28-28 31Q-25 33-26 36Q-27 38-30 38L-43 38Q-47 38-46 33Q-43 26-45 18Q-48 10-46 0Q-44-12-36-20Q-20-32 0-37Q8-39 14-38Z';
const S='stroke="#1d1b22" stroke-width="2.6"';
export const gorilla:SpeciesDef={
 name:'Gorilla',mass:4.8,color:'#38363e',
 shapes:[
  poly(-46,0,-42,-14,-34,-22,-18,-31,0,-37,14,-38,22,-30,24,-10,21,6,8,9,-40,12),
  poly(16,-38,22,-45,30,-46,38,-43,43,-33,46,-25,47,-20,45,-15,41,-14,34,-14,18,-24),
  poly(16,-22,30,-16,37,-12,41,-3,41,6,21,6,16,-6),
  poly(21,6,41,6,43,16,42,27,25,27),
  poly(25,27,42,27,44,33,43,37,41,38,28,38,25,34),
  poly(4,0,12,-4,20,-1,21,8,21,20,19,30,2,30,2,8),
  poly(2,30,19,30,20,34,19,37,17,38,4,38,2,35),
  poly(-24,0,-10,2,-7,10,-5,18,-6,26,-21,26,-24,10),
  poly(-21,26,-6,26,-6,37,-9,38,-19,38,-21,35),
  poly(-46,0,-14,10,-17,16,-21,22,-45,22,-47,12),
  poly(-45,20,-21,22,-28,31,-45,31),
  poly(-46,30,-28,30,-25,33,-26,37,-30,38,-43,38,-46,34),
 ],
 art:`<defs><clipPath id="gorilla-clip"><path d="${BODY}"/></clipPath></defs><g stroke-linecap="round" stroke-linejoin="round"><path d="M12-4Q20-2 21 8Q22 20 19 30L20 34Q21 38 17 38L4 38Q1 38 2 34Q4 26 3 16Q2 6 4 0Z" fill="#232127" ${S}/><path d="M-24 0Q-10 2-8 10Q-5 18-6 26L-7 33Q-5 38-9 38L-19 38Q-22 38-21 34Q-19 26-22 18Q-25 10-24 0Z" fill="#232127" ${S}/><path d="${BODY}" fill="#38363e" ${S}/><g clip-path="url(#gorilla-clip)"><path d="M-50 8Q-44-2-36-5L-33-2-30-8Q-20-10-12-15L-9-12-6-19Q2-24 8-36L2-48-50-48Z" fill="#b6bac4"/><path d="M33-34Q38-37 44-32L42-28Q47-25 47-20Q46-15 41-14Q35-14 33-19Q30-26 33-34Z" fill="#5e5a66"/><path d="M23 32Q34 28 46 31V40H23ZM-22 33Q-28 29-35 33V40H-22Z" fill="#5e5a66"/></g><path d="M16-26Q14-8 21 6M-21 4Q-17 12-20 20M9 34v3M-14 34v3M-31 34v3" fill="none" stroke="#56535e" stroke-width="1.4"/><path d="M34-33Q39-36 44-32M32 33.5v4M37 33v4.5" fill="none" stroke="#1d1b22" stroke-width="1.6"/><circle cx="29" cy="-28" r="2.4" fill="#4b4852" stroke="#1d1b22" stroke-width="1.2"/><circle cx="39" cy="-29" r="1.8" fill="#141218"/><circle cx="39.6" cy="-29.6" r=".6" fill="#fff"/><ellipse cx="44.3" cy="-23.3" rx="1.4" ry="1" fill="#1d1b22"/><path d="M46-17.5Q42.5-16.5 39.5-17.5" fill="none" stroke="#1d1b22" stroke-width="1.3"/></g>`,
};
