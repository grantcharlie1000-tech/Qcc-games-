import { poly, type SpeciesDef } from './types';
/** Rhino: heavy lavender-slate side profile facing left, big front horn and small rear horn, armour folds. */
const BODY='M-52 9Q-57 7-56 1Q-56-3-53-5L-41-11-30-18Q-24-22-17-22Q-12-29 0-28.5Q22-30 38-24Q49-18 49-4Q49 8 42 13L42.5 28Q42.5 30 40.5 30L29.5 30Q27.5 30 27.5 28L28 15Q6 18-14.5 14L-13 28Q-13 30-15 30L-26.5 30Q-28.5 30-28.5 28L-28 15Q-29 10-31 9Q-36 14-44 11Z';
const O='stroke="#1d1b22" stroke-width="2.6"';
export const rhino:SpeciesDef={
 name:'Rhino',mass:5.6,color:'#9896c6',
 shapes:[
  poly(-20,-21.5,-10,-27,0,-28.5,19.5,-28,38,-24,46,-16,49,-4,47,6,42,13,28,14,-14,13,-28,12,-30,6),
  poly(-56,1,-55.3,-2.5,-53,-5,-30,-18,-22,-21.3,-25,6,-37,12,-44,11,-52,9,-55.5,6),
  poly(-53,-5,-54,-21,-48.5,-35.5,-41,-11),
  poly(-39,-12,-38.5,-19,-37,-25,-31,-17),
  poly(-25.5,-20,-26.4,-27,-24.5,-32.5,-21.5,-35.2,-17.8,-34,-16.9,-30,-17.5,-27,-19,-20.5),
  poly(-28,13,-14.5,13,-13,28,-14,30,-27.5,30,-28.5,28),
  poly(28,13,42,13,42.5,28,41,30,29,30,27.5,28),
  poly(-8.5,12,3,12,3.5,28,2,30,-7,30,-8.5,28),
  poly(9.5,12,21,12,21.5,28,20,30,11,30,9.5,28),
 ],
 art:`<defs><clipPath id="rhino-clip"><path d="${BODY}"/></clipPath></defs><g stroke-linecap="round" stroke-linejoin="round">`+
 // tail + far legs (behind)
 `<path d="M44-17Q51-13 55.5-5.5L53-4Q49.5-9.5 44-11Z" fill="#9896c6" ${O}/><ellipse cx="55" cy="-3.5" rx="2.2" ry="3" transform="rotate(-30 55 -3.5)" fill="#3b3852" stroke="#1d1b22" stroke-width="1.6"/>`+
 `<path d="M-8.5 6V28Q-8.5 30-6.5 30H1.5Q3.5 30 3.5 28L3 6ZM9.5 6V28Q9.5 30 11.5 30H19.5Q21.5 30 21.5 28L21 6Z" fill="#7673a6" ${O}/>`+
 `<path d="M-7.5 30V28.6A1.7 1.7 0 0 1-4.1 28.6V30ZM-3.6 30V28.6A1.7 1.7 0 0 1-.2 28.6V30ZM10.5 30V28.6A1.7 1.7 0 0 1 13.9 28.6V30ZM14.4 30V28.6A1.7 1.7 0 0 1 17.8 28.6V30Z" fill="#cdc3b2" stroke="#1d1b22" stroke-width="1.1"/>`+
 // ear (behind the head outline)
 `<path d="M-26-17L-25.5-19.5C-27-27-25-33-21.5-35C-18-36-16.5-32-17.5-28L-19-18Q-23-16-26-17Z" fill="#9896c6" ${O}/><path d="M-21.8-32Q-24.6-27-23-22.5Q-20.2-27-21.8-32Z" fill="#5f5c90"/>`+
 // body
 `<path d="${BODY}" fill="#9896c6" ${O}/>`+
 // armour folds
 `<g clip-path="url(#rhino-clip)" fill="none" stroke="#5f5c90" stroke-width="1.5"><path d="M-28-19Q-33-6-29 8M-3-29Q-11-12-9 4Q-10 11-15 14M23-30Q16-11 23 9Q25 13 28 15M-27 21Q-21 23-15 21M29 21Q35 23 41 21M-9 7Q6 11 22 7"/></g>`+
 // near toenails
 `<path d="M-27 30V28.6A1.9 1.9 0 0 1-23.2 28.6V30ZM-22.6 30V28.6A1.9 1.9 0 0 1-18.8 28.6V30ZM-18.2 30V28.6A1.9 1.9 0 0 1-14.4 28.6V30ZM29 30V28.6A1.9 1.9 0 0 1 32.8 28.6V30ZM33.4 30V28.6A1.9 1.9 0 0 1 37.2 28.6V30ZM37.8 30V28.6A1.9 1.9 0 0 1 41.6 28.6V30Z" fill="#efe6d2" stroke="#1d1b22" stroke-width="1.2"/>`+
 // horns
 `<path d="M-53-4Q-56.5-22-48.5-36.5Q-46-21-40.5-11Z" fill="#efe6d2" ${O}/><path d="M-39-12Q-40-20-37-25Q-34-19-31-16.5Z" fill="#efe6d2" ${O}/>`+
 // face
 `<circle cx="-36" cy="-4" r="1.9" fill="#1d1b22"/><circle cx="-35.4" cy="-4.7" r=".6" fill="#fff"/><path d="M-52.5-.5Q-51 -1.5-50 0M-55 5.5Q-51 6.8-46 5" fill="none" stroke="#1d1b22" stroke-width="1.3"/></g>`,
};
