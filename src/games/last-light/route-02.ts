import {trail,C,G,H,L,T} from './route-build';
import {EAST,OUT_E,WATER,WEST,floorLine} from './tower-02';

/** 02 · A Bell Above the Rain
 * One tower, climbed floor by floor. You come in by the door at its foot,
 * where level 1 ended, and leave by the gallery door at the top. The tower is
 * seen in section and is as wide as the screen; its measurements are in
 * tower-02.ts. One open well runs up the middle from the flooded pit to the
 * belfry floor. Every floor is trimmed round it, nothing that stands still
 * crosses it, and a miss into it is a fall to the water. A miss anywhere else
 * drops you a flight, onto the floor or the treads below.
 *
 * Each storey is one room, crossed once and climbed by its own means: the
 * foot's stone steps on the back wall; the ringing floor's run-up jump, a
 * ringer's box and two wall treads; the rotten floor's beam over the well;
 * the masons' putlog boards; the muniment room's chest, press and aumbry; the
 * clock's two weights riding their cables up the chase; the stones of the
 * fallen vault, lodged on its joists; the clock room's dash, the clock case
 * and a bracket; the dial's iron rim; the old stair's soft treads over the
 * well, up without stopping; the corbel table and the iron ladder; the bell
 * hoist's pallet up through the trap; the bell frame to Ivo; a rotten plank
 * on the bell cage, the tenor's headstock and the west loft; the tie bar across the
 * belfry; three louvre boards to the gallery door. */
const F=floorLine;
const floor=T('floor'),step=T('step',H(16)),tread=T('tread',G),putlog=T('putlog',H(12)),louvre=T('louvre',G);
export const ROUTE_02=trail(WEST,F(0),204,T('ground')).here('The tower foot')
 // The well-head kerb either side of the pit's mouth, then the stone steps along the back wall.
 .at(244,F(0)-16,32,T('wellhead',H(44))).at(364,F(0)-16,32,T('wellhead',H(44)))
 .at(396,F(0),EAST-396,T('ground')).cp()
 .at(420,F(0)-48,48,step).at(508,F(0)-96,48,step).at(556,F(0)-144,EAST-556,step)
 // The ringing floor is broken back from the well: a run-up jump, then a ringer's box and two treads on the west wall.
 .sec('The ringing floor').at(404,F(1),96,floor)
 .at(172,F(1),80,floor).at(140,F(1)-32,32,T('box',H(60)))
 .side(WEST,F(1),100,floor,true)
 .at(64,F(1)-96,56,tread).at(152,F(1)-144,56,tread)
 // The rotten floor: the beam over the well, a rotten joist, a corbel and a bracket up the east wall.
 .sec('The rotten floor').at(224,F(2),48,floor)
 .side(WEST,F(2),72,floor,true)
 .at(272,F(2)+8,104,T('beam',C(.5,12)))
 .at(392,F(2),48,floor).at(456,F(2),32,T('joist',C(.45,12))).at(504,F(2),EAST-504,floor).cp()
 .at(552,F(2)-64,EAST-552,T('corbel',H(16))).at(480,F(2)-128,48,T('bracket',G))
 // The masons' scaffold: over the well, then boards on putlogs let into the back wall.
 .sec('The masons’ scaffold').at(384,F(3),80,floor)
 .at(168,F(3),96,floor)
 .at(104,F(3)-56,48,putlog).at(WEST,F(3)-112,56,putlog).at(104,F(3)-168,48,putlog)
 // The muniment room: over the well, the parish chest, the press against the east wall, an aumbry in the wall.
 .sec('The muniment room').at(168,F(4),96,floor)
 .at(380,F(4),68,floor).at(448,F(4)-40,48,T('chest',H(68))).at(496,F(4),56,floor)
 .at(552,F(4)-64,EAST-552,T('press',H(92))).at(472,F(4)-128,56,T('aumbry',H(12)))
 // The weight shaft: over the well, then the clock's two weights up the chase on their cables.
 .sec('The weight shaft').at(384,F(5),72,floor)
 .at(160,F(5),104,floor).cp()
 .at(96,F(5)-40,48,T('weight',L(40,.9,16)))
 .at(WEST,F(5)-136,48,T('weight',L(56,1.5,16)))
 // The fallen vault: its stones came down onto this floor's joists and are the way over the hole they made.
 .sec('The fallen vault').at(104,F(6),160,floor)
 .at(380,F(6)-40,56,T('rubble',H(68))).at(460,F(6)-80,48,T('rubble',H(108))).at(540,F(6)-128,EAST-540,T('rubble',H(156)))
 // The clock room: a dash over the well, the clock case, a bracket on the west wall.
 .sec('The clock room').at(400,F(7),128,floor).cp()
 .at(128,F(7),60,floor).at(64,F(7)-64,64,T('clockcase',H(92))).at(136,F(7)-128,48,T('bracket',G))
 // Behind the dial: over the well, then up the dial's iron rim.
 .sec('Behind the dial').at(200,F(8),64,floor)
 .at(384,F(8),56,floor).at(456,F(8)-48,40,T('dial',G)).at(528,F(8)-88,40,T('dial',G)).at(456,F(8)-128,40,T('dial',G))
 // The old stair: its soft treads cross the well to the half-landing on the west wall. Up it without stopping.
 .sec('The old stair').at(504,F(9),EAST-504,floor).cp()
 .at(440,F(9)-24,40,T('stair',C(.4,12))).at(376,F(9)-48,40,T('stair',C(.4,12))).at(312,F(9)-72,40,T('stair',C(.4,12)))
 .at(248,F(9)-96,40,T('stair',C(.4,12))).at(184,F(9)-120,40,T('stair',C(.4,12)))
 .at(WEST,F(9)-144,128,T('landing'))
 // The corbel table along the east half of the back wall, then the iron ladder up the east wall.
 .sec('The corbel table').at(184,F(10),80,floor)
 .at(388,F(10)-16,40,T('corbel',H(16))).at(452,F(10)-40,32,T('corbel',H(16))).at(516,F(10)-24,32,T('corbel',H(16)))
 .at(552,F(10)-72,EAST-552,T('ladder',G)).at(552,F(10)-120,EAST-552,T('ladder',G))
 // The bell hoist: its pallet rides the top of the well up through the trap in the belfry floor.
 .sec('The bell hoist').at(400,F(11),136,floor)
 .side(WEST,F(11),224,floor,true)
 .at(284,F(11)-96,72,T('pallet',L(96,.9,12)))
 // Under the bells: the belfry floor, over the trap, up the bell frame to Ivo's landing.
 .sec('Under the bells').at(WEST,F(12),228,floor).cp()
 .at(372,F(12),76,floor).at(464,F(12)-56,56,T('frame',G)).at(392,F(12)-112,56,T('frame',G))
 .at(480,F(12)-168,EAST-480,T('landing')).here('Ivo’s landing').cp().station('Ivo')
 // Over the bells: a rotten plank on the bell cage's east rail, the tenor's headstock over the trap, the frame's west post, the west loft.
 .sec('Over the bells').at(376,F(13),80,T('plank',C(.55,12)))
 .at(240,F(13)-24,64,T('headstock',H(20))).at(152,F(13)-56,48,T('frame',G)).at(WEST,F(13)-104,80,T('loft')).cp()
 // The tie bar runs wall to wall across the belfry; three louvre boards in the east openings climb to the gallery door.
 .sec('The tie bar').at(136,F(14)+44,48,tread).at(WEST,F(14),EAST-WEST,T('tiebar',G))
 .at(520,F(14)-48,48,louvre).at(440,F(14)-96,48,louvre).at(520,F(14)-144,48,louvre)
 .sec('The gallery door').at(360,F(15),144,T('gallery'))
 .done({setting:'tower',goal:'rescue',exit:.5,water:WATER,width:OUT_E,walls:[WEST,EAST]});
