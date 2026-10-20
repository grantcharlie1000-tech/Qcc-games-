import { poly, type SpeciesDef } from './types';
// Body, head and near legs as one silhouette; far legs, ears and tail are drawn behind it.
const SIL='M-21.5-4C-23-12-17-16.8-9-16.8C1-16.8 9-12.5 15-12.8C17-18 22-23 29-23C36-23 40-19 40.5-15Q43-13 45.5-11.5Q48-10.5 47.5-8Q47-5.5 43.5-5Q41-4.5 39.5-2Q38.5 3 34.5 6L31.5 3Q26 2.8 21 2C22 8 22 14 22 19.5Q24.5 20 24.5 23Q24.5 24.6 23 24.6H15.5Q14 24.6 14.2 23L15 19Q14.5 12 12.5 8.5Q2 10.8-8 10Q-10.5 15-14 19.5L-14.5 23Q-14.5 24.6-16 24.6H-22.5Q-24 24.6-24 23L-23.2 19Q-24.5 10-22.5 3Q-22.8-1-21.5-4Z';
const TAIL='M-12-16.2C-22-16.8-34-16-42-13.4C-48-11.4-50.5-6.5-49-2.5C-47.5 1.5-42 4.5-35 4.6C-28 4.7-24 4-19 3Z';
const O='stroke="#1d1b22" stroke-width="2.6"';
const ring=(a:number,b:number)=>`<path d="M${a}-22Q${a-2.5}-7 ${a} 8H${b}Q${b-2.5}-7 ${b}-22Z"/>`;
export const redPanda:SpeciesDef={
 name:'Red Panda',mass:1.6,color:'#cf4a1f',
 shapes:[
  poly(-49,-5,-47.5,-9.5,-43,-13,-35,-15,-24,-16.3,-10,-16.6,4,-14.5,15,-12.5,21,2,-36,3.8,-45,1.5,-49,-2),
  poly(-23,-2,18,-2,21,2,12.5,8.5,-8,10,-22.5,3),
  poly(16,-13,20,-20,29,-23.2,36,-21.5,47.8,-9,47.5,-6.5,39.5,-2,32,2,21,2),
  poly(21.5,-21,22.3,-28.5,26,-31.6,31,-30,33,-22),
  poly(17.5,-18,17.3,-25.5,20,-29.2,23.5,-29,25.5,-22),
  poly(12,-4,21,-4,22,19.5,15,19.5),
  poly(14.2,19,22,19,24.5,22,24.5,24.6,14.2,24.6),
  poly(4,-4,11.5,-4,9.8,24.6,1.6,24.6),
  poly(-14,-4,-6.5,-4,-2.5,24.6,-10.6,24.6),
  poly(-22.5,3,-10,4,-8,10,-14,19.5,-23.5,19.5,-24.2,11),
  poly(-23.2,19,-14,19,-14.5,24.6,-24,24.6),
 ],
 art:`<defs><clipPath id="redPanda-c"><path d="${SIL}"/></clipPath><clipPath id="redPanda-t"><path d="${TAIL}"/></clipPath></defs><g stroke-linejoin="round" stroke-linecap="round"><path d="M5 0H11.5L9.8 23Q9.8 24.6 8.3 24.6H3.2Q1.6 24.6 1.8 23Z" fill="#2b1a1c" ${O}/><path d="M-13 2H-6Q-5 12-3 19L-2.5 23Q-2.5 24.6-4 24.6H-9.2Q-10.7 24.6-10.5 23L-10.2 18Q-11.5 11-13 2Z" fill="#2b1a1c" ${O}/><path d="M17.5-18Q16-27 20-29.5Q24-30.5 25.5-21.8Z" fill="#9a3214" ${O}/><path d="M21.5-20.5Q20-30 26-32Q32-33 33-22Z" fill="#fff4e4" ${O}/><path d="M23.8-21.5Q23.2-28 26.4-29.6Q30-30 30.8-22.2Z" fill="#7a2812"/><path d="${TAIL}" fill="#cf4a1f"/><g clip-path="url(#redPanda-t)" fill="#f2c27e">${ring(-24,-27.5)}${ring(-31,-34.5)}${ring(-38,-41.5)}<path d="M-44.5-22Q-47-7-44.5 8H-56V-22Z" fill="#7a2812"/></g><path d="${TAIL}" fill="none" ${O}/><path d="${SIL}" fill="#cf4a1f"/><g clip-path="url(#redPanda-c)"><path d="M-28 4Q-8 8 8 5Q16 3.5 22-.5L30 3V30H-28Z" fill="#4a2b26"/><path d="M38-13.5Q42-15 45-12L50-10V0L38 2Q36.5-6 38-13.5Z" fill="#fff4e4"/><path d="M24-3Q27-9 32.6-8.8Q35.6-5 35.4 1L36 6H24Z" fill="#fff4e4"/></g><path d="${SIL}" fill="none" ${O}/><path d="M-8.6 9.6Q-9.6 6.5-12 5.2M12.6 8.4Q12.2 6.4 13 5" fill="none" stroke="#1d1b22" stroke-width="1.4"/><ellipse cx="33" cy="-18.5" rx="2.6" ry="1.8" fill="#fff4e4"/><path d="M44.8-11.6Q48-11.2 47.8-8.6Q47.2-7 45.2-8Q44.2-9.6 44.8-11.6Z" fill="#1d1b22"/><circle cx="35.5" cy="-13" r="2" fill="#1d1b22"/><circle cx="36.1" cy="-13.6" r=".6" fill="#fff"/><path d="M45.5-5.8Q43.5-4.6 41.2-5.2" fill="none" stroke="#1d1b22" stroke-width="1.2"/></g>`,
};
