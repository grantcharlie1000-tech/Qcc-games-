import { poly, type SpeciesDef } from './types';
const S='M-35 -20L-18 -21Q-12 -21 -6 -20C4 -22 22 -23 30 -17C37 -12 39 0 34 8L31 12L31 21Q31 23 29 23L22 23Q20 23 20 21L20 14Q8 15 -4 13L-4 21Q-4 23 -6 23L-12 23Q-14 23 -14 21L-14 8Q-18 5 -24 3L-34 2Q-39 2 -39 -3L-39 -15Q-39 -20 -35 -20Z';
const O='stroke="#1d1b22" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"';
export const capybara:SpeciesDef={
 name:'Capybara',mass:2.2,color:'#b9763a',
 shapes:[
  poly(-39,-15,-35,-20,-18,-21,-14,-10,-22,3,-34,2,-39,-3),
  poly(-18,-21,-12,-21,-6,-20,-8,-6,-16,-6),
  poly(-22,3,-16,-8,-14,-8,-13,8),
  poly(-19.5,-22,-17,-24,-14.5,-22,-15,-20,-19,-20),
  poly(-6,-20,2.7,-21.2,12.8,-21.5,22.4,-20.3,30,-17,34.3,-12.1,36.5,-5.6,36.5,1.4,34,8,31,12,20,14,-4,13,-14,8,-15,-4),
  poly(-14,7,-4,12,-4,21.5,-5.5,23,-12.5,23,-14,21.5),
  poly(20,11,31,10,31,21.5,29.5,23,21.5,23,20,21.5),
  poly(-6,8,3,8,3,21.5,1.5,23,-4.5,23,-6,21.5),
  poly(12,9,21,9,21,21.5,19.5,23,13.5,23,12,21.5),
 ],
 art:`<defs><clipPath id="capybara-clip"><path d="${S}"/></clipPath></defs>`+
  `<g ${O} fill="#87522a"><path d="M-6 6L-6 21Q-6 23 -4 23L1 23Q3 23 3 21L3 6Z"/><path d="M12 8L12 21Q12 23 14 23L19 23Q21 23 21 21L21 8Z"/></g>`+
  `<circle cx="-16.5" cy="-21" r="3" fill="#b9763a" ${O}/>`+
  `<path d="${S}" fill="#b9763a" ${O}/>`+
  `<g clip-path="url(#capybara-clip)"><path d="M-40 -18Q-33 -18 -32.5 -11.5Q-33 -5 -40 -5Z" fill="#6e4426"/></g>`+
  `<g fill="none" stroke="#6e4426" stroke-width="1.4" stroke-linecap="round"><path d="M20 12Q18 0 27 -7"/><path d="M-4 10Q-3 2 -9 -3"/><path d="M-17.6 -21.4Q-16.5 -22.8 -15.4 -21.4"/><path d="M-30 1.6Q-24 0 -21 -5"/></g>`+
  `<path d="M-26.4 -12.6A2.6 2.6 0 0 0 -21.6 -12.6Z" fill="#1d1b22"/><circle cx="-22.9" cy="-11.6" r=".6" fill="#fff"/>`+
  `<path d="M-27.4 -12.4Q-24 -13.6 -20.6 -12.4" fill="none" stroke="#1d1b22" stroke-width="1.6" stroke-linecap="round"/>`+
  `<path d="M-37.4 -13.6-36 -12.4M-37.6 -1.4Q-35.6 -0.2 -33.6 -0.8" fill="none" stroke="#1d1b22" stroke-width="1.4" stroke-linecap="round"/>`+
  `<path d="M-11 21.2V23M-8 21.2V23M25 21.2V23M28 21.2V23" stroke="#1d1b22" stroke-width="1.2" stroke-linecap="round"/>`,
};
