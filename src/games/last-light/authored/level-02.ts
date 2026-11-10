import {trail,C,G,H,L,T,type Trail} from '../route-build';

/** 02 · A Bell Above the Rain — draft 3 (geometry only). */
const S=(h=16)=>H(h);
let F=2400;
const t:Trail=trail(24,F,352,T('ground')).here('The tower foot');
const up=()=>{F-=192;};
// S0 east: the well-head kerb, then the stone stair cantilevered from the back wall over the flooded pit.
t.at(376,F-32,56,T('wellhead',H(40))).at(464,F-48,96,T('step',S())).at(592,F-56,88,T('step',S())).at(720,F-64,80,T('step',S())).at(840,F-48,72,T('step',S()))
 .at(952,F,224,T('ground')).at(1112,F-64,64,T('step',S())).at(1016,F-128,64,T('step',S()));
up();
// S1 west: the ringing floor. A ringer's box to step over, then the floor broken back from the well: the run-up jump.
t.at(872,F,128,T('floor')).here('The ringing floor').cp().at(808,F-32,64,T('box',H(60))).at(696,F,112,T('floor'))
 .at(376,F,160,T('floor')).at(312,F-40,64,T('box',H(68))).at(200,F,112,T('floor')).at(24,F,136,T('floor'))
 .at(24,F-64,64,T('tread',G)).at(112,F-128,64,T('tread',G));
up();
// S2 east: the rotten floor. Rotten joists, the rotten beam over the well, rotten joists, the window.
t.at(200,F,152,T('floor')).here('The rotten floor').cp().at(392,F,48,T('joist',C(.5))).at(480,F,56,T('floor'))
 .at(536,F+8,136,T('beam',C(.5,12))).at(720,F,96,T('floor')).at(856,F,48,T('joist',C(.5))).at(944,F,48,T('joist',C(.45)))
 .at(1032,F,144,T('floor')).at(1120,F-64,56,T('sill',H(12))).at(1032,F-128,56,T('corbel',S()));
up();
// S3 west: the fallen vault. A rib vault came down onto this floor; its stones are the way over the hole it left.
t.at(856,F,160,T('floor')).here('The fallen vault').cp().at(784,F-40,56,T('rubble',H(68))).at(688,F-72,48,T('rubble',H(100)))
 .at(472,F-64,64,T('rubble',H(92))).at(352,F-24,72,T('rubble',H(52))).at(200,F,120,T('floor')).at(24,F,136,T('floor'))
 .at(24,F-64,56,T('sill',H(12))).at(104,F-128,56,T('corbel',S()));
up();
// S4 east: the clock room. A dash over a hole in the floor, a dash over the well, the clock case.
t.at(176,F,120,T('floor')).here('The clock room').cp().at(472,F-48,64,T('clockcase',H(76)))
 .at(760,F,96,T('floor')).at(1008,F,168,T('floor'))
 .at(1112,F-64,64,T('bracket',G)).at(1016,F-128,64,T('bracket',G));
up();
// S5 west: behind the dial. The clock face is an iron wheel built into the back wall; its ring and spokes are the way across.
t.at(824,F,176,T('floor')).here('Behind the dial').cp().at(728,F-48,40,T('dial',G)).at(640,F-88,40,T('dial',G)).at(552,F-104,48,T('dial',G))
 .at(472,F-88,40,T('dial',G)).at(392,F-48,40,T('dial',G)).at(200,F,152,T('floor')).at(24,F,136,T('floor'))
 .at(24,F-64,64,T('rung',G)).at(24,F-128,64,T('rung',G));
up();
// S6 east: the ringers' old stair, its treads gone soft: up it without stopping.
t.at(104,F,256,T('floor')).here('The old stair').cp().at(400,F-24,56,T('stair',C(.4))).at(488,F-48,56,T('stair',C(.4)))
 .at(576,F-72,56,T('stair',C(.4))).at(664,F-48,56,T('stair',C(.4))).at(752,F-24,56,T('stair',C(.4))).at(840,F,336,T('floor'))
 .at(1112,F-64,64,T('rung',G)).at(1112,F-128,64,T('rung',G));
up();
// S7 west: the bell hoist. Its pallet rides the well on one rope; it is the only way up past this floor.
t.at(696,F,384,T('floor')).here('The bell hoist').cp().at(568,F-48,72,T('pallet',L(88,1,12)));
up();
// S8 east: the corbel table along the back wall, then the iron ladder.
t.at(672,F,56,T('floor')).here('The corbel table').cp().at(776,F-16,32,T('corbel',S())).at(856,F-40,32,T('corbel',S()))
 .at(944,F-24,32,T('corbel',S())).at(1032,F-48,40,T('corbel',S())).at(1096,F,80,T('floor'))
 .at(1112,F-48,64,T('ladder',G)).at(1112,F-96,64,T('ladder',G)).at(1112,F-144,64,T('ladder',G));
up();
// S9 west: the tie bar, wall to wall across the tower, over the broken floor.
t.at(920,F,168,T('floor')).here('The tie bar').cp().at(24,F-64,1152,T('tiebar',G)).at(24,F-128,56,T('bracket',G));
up();
// S10 east: the bell frame over the well, and Ivo's landing.
t.at(104,F,432,T('floor')).here('Under the bells').cp().at(560,F-56,96,T('frame',G)).at(704,F-112,96,T('frame',G));
F-=176;
t.at(840,F,336,T('floor')).here('Ivo’s landing').cp()
// S11 west: the louvre boards to the gallery door.
 .at(776,F-56,40,T('louvre',G)).at(680,F-112,40,T('louvre',G)).at(584,F-168,40,T('louvre',G))
 .at(24,F-224,520,T('gallery')).here('The gallery door');
const built=t
 .side(216,2144,56,T('aumbry',H(12)),true).side(904,1376,56,T('aumbry',H(12)),true).side(1040,240,56,T('sill',H(12)),true)
 .done({setting:'tower',goal:'rescue'});

export const level={index:1,route:built.route,branches:built.branches,memories:[...built.memories] as number[],checkpoints:[...built.checkpoints] as number[],sectors:built.sectors.map(([i,n])=>[i,n]) as [number,string][],water:2468 as number|null,timing:''};
export const tags:readonly string[]=built.tags??[];
