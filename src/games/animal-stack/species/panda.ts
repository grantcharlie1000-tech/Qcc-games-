import { poly, type SpeciesDef } from './types';
const BODY='M-21-18Q-11-28 4-26.5Q22-26 34-21Q45-14 44 0Q43 8 39 13L39 30Q39 32 37 32L29 32Q27 32 27 30L25 18Q18 15.5 10 16L-4 16Q-8 16-9 18L-13 30Q-13 32-15 32L-26 32Q-28 32-27 30L-23 12Q-26 4-24-6Q-24-14-21-18Z';
export const panda:SpeciesDef={
 name:'Panda',mass:4.2,color:'#f6f4ee',
 shapes:[
  poly(-23,-12,-14,-24,4,-26.5,22,-25.5,35,-21,42,-12,44,-1,42,10,36,15,-8,15,-22,8,-24,-2),
  poly(-21,-13,-24,-21,-33,-24.5,-42,-21,-45,-13,-43,-3,-34,4,-24,2),
  poly(-44,-14,-48,-8,-50,-3,-47,2,-40,3.5),
  poly(-32,-24,-31,-28,-27,-29.5,-23,-28,-22,-24,-24,-20),
  poly(-42.5,-22,-41.5,-27,-38,-28.3,-34.5,-27,-33.5,-22),
  poly(-23,8,-8,10,-13,32,-27,32),
  poly(-12,6,-1,6,1,32,-9,32),
  poly(14,6,25,6,20,32,10,32),
  poly(25,10,39,10,39,32,27,32),
 ],
 art:`<defs><clipPath id="panda-clip"><path d="${BODY}"/></clipPath></defs><g stroke="#1d1b22" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M-12 6-1 6 1 30Q1 32-1 32L-7 32Q-9 32-9 30ZM14 6 25 6 20 30Q19.5 32 17.5 32L12 32Q10 32 10 30Z" fill="#232128"/><circle cx="-38" cy="-23.5" r="4.6" fill="#232128"/><path d="${BODY}" fill="#f6f4ee"/><g clip-path="url(#panda-clip)" stroke="none" fill="#3a3741"><path d="M-17-40-7-40Q6-6-6 40L-40 40-40 4Q-27 0-22-6Q-19-20-17-40Z"/><path d="M14 40 16 14Q18 0 30-2Q40-3 48 4L48 40Z"/></g><path d="${BODY}" fill="none"/><circle cx="-27" cy="-24" r="5.2" fill="#3a3741"/><path d="M-21-13Q-22-24-33-24.5Q-43-24-45-14Q-46-10-48-8Q-51.5-5-49-1Q-46 3-40 3.5Q-33 6.5-25 3Q-19-1-21-13Z" fill="#f6f4ee"/><path d="M-32-14Q-37-18.5-41.5-13Q-44-7.5-40-6Q-34.5-5.5-33-10Z" fill="#3a3741" stroke="none"/><ellipse cx="-48.6" cy="-4.8" rx="2.3" ry="1.8" fill="#1d1b22" stroke="none"/><path d="M-47 .4Q-45 1.8-42.6 .8" fill="none" stroke-width="1.3"/></g><circle cx="-37.6" cy="-11" r="2.1" fill="#fff"/><circle cx="-38.2" cy="-11.1" r="1.35" fill="#1d1b22"/>`,
};
