import { poly, type SpeciesDef } from './types';
/** Ostrich mid-stride facing right: fluffy black body, white plumes, bare pink neck, long grey legs.
 * Few large parts (body+tail, each leg as one long taper running up into the body) keep its
 * rotational inertia high so the tall bird does not spin on landing. */
const BODY='M19-14C14-21 6-22-3-22S-22-20-26-14C-30-8-31 0-26 6A5.5 5.5 0 0 0-18 11 5.5 5.5 0 0 0-9 14 5.5 5.5 0 0 0 0 14 5.5 5.5 0 0 0 9 11 5.5 5.5 0 0 0 16 6 5.5 5.5 0 0 0 21-1C22.5-6 22-10 19-14Z';
const O='stroke="#1d1b22" stroke-width="2.6"';
export const ostrich:SpeciesDef={
 name:'Ostrich',mass:2.4,color:'#34303a',
 shapes:[
  poly(22.5,-4,19,4.5,10,10.7,-3,13,-16,10.7,-27,3,-37,-6.5,-42,-14,-41,-22,-36,-26,10,-18.7,19,-12.5),
  poly(14.5,-52,24,-52,21,-14,8,-16),
  poly(13,-56,17,-62,25,-62,29,-56,25,-50,17,-50),
  poly(27,-59.5,37,-56,36,-54,27,-52),
  poly(1,-10,17,-10,23.5,50,18,50),
  poly(15.5,52,19,49,24,49,33,54.5,33,57,16,57),
  poly(-15,-10,-1,-10,-17.5,50,-23,50),
  poly(-27,52,-23.5,49,-18.5,49,-10,54.5,-10,57,-26.5,57),
 ],
 art:`<defs><clipPath id="ostrich-body"><path d="${BODY}"/></clipPath></defs><g ${O} stroke-linejoin="round" stroke-linecap="round">`
 // far leg (darker), then near leg: thick bare thigh tapering to a slim shank, two-toed foot
 +`<path d="M-17 4C-18.5 12-19.5 20-19.5 28L-23 50H-17.5L-11 29C-8 22-5 12-4.5 4Z" fill="#8c8290"/><path d="M-23.5 49.5H-18Q-13 50.5-11 54Q-8.5 57-11.5 57H-25Q-27.5 57-26.5 53Z" fill="#8c8290"/>`
 +`<path d="M5 4C4 14 9 22 12 28L18 50H23.5L21 30C22 22 21 12 18.5 4Z" fill="#bdb3bb"/><path d="M18 49.5H24Q29 50.5 32 54Q34.5 57 31.5 57H17Q14.5 57 15.5 53Z" fill="#bdb3bb"/>`
 // tail plume sweeping off the back, and the neck, both behind the body
 +`<path d="M-14-20Q-24-24.5-35-27Q-41-27-41-21Q-44-17-41-13Q-42-7-36-6L-28-2Z" fill="#f7f3ee"/><path d="M7-15C11-27 13-40 15-52H24C23-40 22-28 21-13Z" fill="#eab4b0"/>`
 +`<path d="${BODY}" fill="#34303a"/>`
 // head and beak
 +`<path d="M26-59.5Q32-60.5 37.5-56Q37-53.5 27-52.5Z" fill="#f0a984"/><ellipse cx="21" cy="-56" rx="8" ry="6" fill="#eab4b0"/></g>`
 // white wing plume clipped to the body
 +`<g clip-path="url(#ostrich-body)"><path d="M-31-10Q-16-14-2-11Q8-9 12-4Q9 1 4 0Q1 4-4 2Q-8 6-12 3Q-16 6-20 3Q-24 6-28 2Q-31 4-33 2Z" fill="#f7f3ee" stroke="#1d1b22" stroke-width="1.6" stroke-linejoin="round"/></g>`
 +`<g fill="none" stroke-linecap="round" stroke-width="1.3"><path d="M-14-6Q-8-8-2-5M-24-4Q-19-6-14-3" stroke="#c9c1cb"/><path d="M-10-18Q-2-20 6-17" stroke="#55505d"/><path d="M-36-21Q-33-17-30-16M-37-13Q-33-11-30-11" stroke="#c9c1cb"/>`
 +`<path d="M28-55.8H35.5" stroke="#a65a40" stroke-width="1.1"/><path d="M24 53.5Q27 53 30 55M-19 53.5Q-16 53-13 55" stroke="#1d1b22" stroke-width="1.1"/><path d="M13.5 27.5Q16.5 28.5 20 28M-19 27.5Q-15.5 28.5-12 28" stroke="#6f6570" stroke-width="1.2"/><path d="M15.5-60.5Q15-63.5 17.5-63M19-61.8Q19.5-64.5 21.5-63.5" stroke="#1d1b22" stroke-width="1.2"/></g>`
 +`<circle cx="23" cy="-57.3" r="2.2" fill="#1d1b22"/><circle cx="23.7" cy="-58" r=".7" fill="#fff"/><path d="M20.3-60Q23-61.6 25.8-59.8" fill="none" stroke="#1d1b22" stroke-width="1.2" stroke-linecap="round"/>`,
};
