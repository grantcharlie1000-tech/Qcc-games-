import {spike} from './campaign-types';
import {trail,H,L,M,T} from './route-build';

/** 01 · The Window Left Open
 * One terrace to Nell's window, as it always was: the alleys teach the run-up
 * jump over lean-tos and a back yard, a dormer eave rewards the short hop,
 * and the first tooth and the first lethal drop wait across the street. Her
 * gable stack is a held jump up, and Bell Lane is one long jump down from it.
 *
 * Bell Lane is a few houses, each once, each standing on the lane with the
 * black between them: the bakehouse and its one gable stack, the cooperage,
 * the laundry and the dye house with the laundry's basket on its line between
 * their walls, the chandler's, the yard shed and the yard wall, the
 * almshouse, the roofers' store at the foot of the tall house and the hoist
 * that serves it, the tall house with its stairhead, the chapel with its bellcote, the
 * vestry, the sexton's house and lean-to, and the forecourt's gate pier. The
 * tower door is across the forecourt. Every landing is the top of the thing
 * its tag names; nothing stands in the air. */
const house=(tag:string)=>T(tag);
export const ROUTE_01=trail(24,440,300).here('Our roof')
 .side(300,500,140).side(520,500,140,{},true).side(828,488,72)
 .at(372,440,180)
 .at(616,440,200).here('Washing lines').cp()
 .side(912,500,452).side(1364,468,60).side(1424,500,496)
 .at(912,440,160).at(1184,408,180)
 .at(1484,408,140).here('Low eaves').cp()
 .side(1688,321,172,{k:'e'}).side(1920,452,160)
 .at(1720,408,200)
 .at(1992,344,300).here('The street').cp().hz(i=>spike(i,.5,22))
 .at(2420,344,96)
 .at(2628,344,200).hz(i=>spike(i,.72,22)).hz(i=>spike(i,.89,22))
 .at(2892,344,340,T('nell')).here('Nell’s window').cp()
 .at(3232,280,48,T('nellstack',H(64))).here('Bell Lane')
 // One long jump down onto the bakehouse, short of the tooth on its ridge; its one stack is on the east gable.
 .sec('The bakehouse').at(3440,376,330,house('bakehouse')).cp().hz(i=>spike(i,.55,22))
 .r(0,-64,48,T('stack',H(64)))
 .sec('The cooperage').r(130,96,240,house('cooperage'))
 // The laundry's basket rides its line between the laundry's wall and the dye house's.
 .sec('The laundry').r(110,-24,160,house('laundry')).cp()
 .r(150,8,72,T('basket',M(110,1,12)))
 .r(150,-8,180,house('dyehouse'))
 .sec('Chandlers’ Yard').r(100,-56,260,house('chandler'))
 .r(120,72,150,house('shed'))
 .r(70,-32,40,T('wall',H(48)))
 .sec('The almshouse').r(80,40,320,house('almshouse')).cp().enemy('crawler',.55,50,3.8)
 // The roofers' store stands at the foot of the tall house; the hoist's pallet runs up the tall house's face.
 .sec('The roofers’ hoist').r(120,8,120,house('store'))
 .r(8,-170,64,T('hoist',L(170,1.2,12)))
 .r(8,-174,264,house('tall')).enemy('crawler',.36,44,4.2).cp()
 // The stairhead on the tall roof's east gable: hop over it, or onto it for the memory.
 .off(264,-40,56,T('stairhead',H(40)),true)
 // The chapel: a long drop off the tall house onto the nave, two teeth on its ridge, the bellcote over the east gable.
 .sec('The chapel').r(150,184,284,house('chapel')).hz(i=>spike(i,.29,22)).hz(i=>spike(i,.6,22))
 .off(284,-48,56,T('bellcote',H(48)),true)
 .r(150,112,140,house('vestry')).cp()
 // Down past the sexton's house and its lean-to, then the forecourt's gate pier, a narrow held jump back up.
 .sec('The tower forecourt').r(120,-40,180,house('sexton')).hz(i=>spike(i,.62,22))
 .r(82,64,96,T('lean'))
 .r(64,-48,56,T('pier',H(64)))
 .r(0,64,300,T('court'))
 .done({setting:'roofs',goal:'shelter'});
