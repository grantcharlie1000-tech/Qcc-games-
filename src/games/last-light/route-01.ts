import {spike,steam} from './campaign-types';
import {trail,C,H,L,M,T} from './route-build';

/** 01 · The Window Left Open
 * One terrace to Nell's window, as it always was: the alleys teach the run-up
 * jump over lean-tos and a back yard, a dormer eave rewards the short hop,
 * and the first tooth and the first lethal drop wait across the street. Her
 * gable stack is a held jump up, and Bell Lane is one long jump down from it.
 *
 * Bell Lane is a street of houses, each once, each standing on the lane with
 * the black between them. Past the bakehouse and the cooperage the clockmaker
 * hangs his clock off his west corner; the laundry's basket rides its line to
 * the dye house; the pawnbroker's oriel is a drop and a held jump; then the
 * chandler's yard and the almshouse. The burnt house is crossed inside, on
 * what the fire left of its floors. The market hall's lantern is hopped, the
 * coaching inn is crossed along its two galleries, the smithy's quench vent is
 * waited out, and the fish stall's awning throws the courier up onto the
 * weavers' cottages. Past the granary and the Lamb, the lodging house is climbed by its wing and dormer; the
 * bathhouse tank is the run-up for the long jump to the corn warehouses and
 * their covered bridge. The glazier's roof cracks underfoot, the rope walk is
 * patrolled, the coal yard's hopper is the step to its office, past the cart
 * shed and the pump house the watch house flies the lane's one flag. Then, as before: the roofers' store and
 * hoist, the tall house, the chapel, the vestry, the sexton's, the gate pier
 * and the forecourt, with the tower door across it.
 *
 * Every landing is the top of the thing its tag names; nothing stands in the
 * air. A landing tagged `name.part` belongs to the building `name` and is
 * drawn by that building's piece. */
const house=(tag:string)=>T(tag);
export const ROUTE_01=trail(24,440,300).here('Our roof')
 .side(300,500,140).side(520,500,140,{},true).side(828,488,72)
 .at(372,440,180)
 .at(616,440,200).here('Washing lines').cp()
 .side(912,500,452).side(1364,468,60).side(1424,500,496)
 .at(912,440,160).at(1184,408,180)
 .at(1484,408,140).here('Low eaves').cp()
 .side(1920,452,160)
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
 // The clockmaker's clock hangs on its iron bracket off his west corner, over the alley: up onto the case, then a held jump to his roof.
 .sec('The clockmaker’s').r(86,-44,40,T('clock.case',H(34)))
 .r(30,-62,132,T('clock'))
 // The laundry's basket rides its line between the laundry's wall and the dye house's.
 .sec('The laundry').r(118,82,160,house('laundry')).cp()
 .r(150,8,72,T('basket',M(110,1,12)))
 .r(150,-8,180,house('dyehouse'))
 // The pawnbroker's stands a storey over the dye house; his oriel is on the east corner, a drop and a held jump from the yard.
 .sec('The pawnbroker’s').r(64,-64,150,T('pawn',H(130)))
 .r(0,100,44,T('pawn.oriel',H(30)))
 .sec('Chandlers’ Yard').r(112,-64,260,house('chandler'))
 .r(120,72,150,house('shed'))
 .r(70,-32,40,T('wall',H(48)))
 .sec('The almshouse').r(80,40,320,house('almshouse')).cp().enemy('crawler',.55,50,3.8)
 // The burnt house is roofless: across its west party wall, down its charred joists to the stair's half-landing, up its chimney breast to the east wall.
 // The schoolhouse: its porch roof on the west end, then a held jump up the gable wall onto the school.
 .sec('The schoolhouse').r(84,-44,70,T('school.porch',{k:'e'}))
 .r(0,-66,220,T('school',H(70)))
 .sec('The burnt house').r(90,50,36,T('burnt.west',H(40)))
 .r(34,58,112,{...C(.5,12),tag:'burnt.joists'})
 .r(26,44,72,T('burnt.landing',{k:'e'}))
 .r(30,-60,54,T('burnt.breast'))
 .r(28,-62,36,T('burnt.east',H(40)))
 // The market hall: its roof either side of the glazed lantern on its ridge, a patrol on the far side.
 .sec('The market hall').r(64,32,176,T('market')).cp()
 .r(0,-56,84,T('market.lantern',H(56)))
 .r(0,56,200,T('market')).enemy('crawler',.55,56,3.6)
 // The coaching inn is crossed along its galleries: the first floor's west range, then the second floor's east range up its stair.
 .sec('The coaching inn').r(70,56,210,T('inn.lower',{k:'e'})).enemy('crawler',.62,44,3.2)
 .r(26,-64,176,T('inn.upper',{k:'e'}))
 // The smithy's quench tank vents through its roof: wait for the steam to drop.
 .sec('The smithy').r(64,96,200,T('smithy')).cp().hz(i=>steam(i,.52,88,0,3.2))
 // The fish stall's awning against the smithy: hold the jump through the bounce to reach the weavers' roof.
 .sec('The fish stall').r(36,-4,64,T('stall',{k:'b',h:12}))
 .sec('The weavers’ cottages').r(30,-140,180,T('weavers'))
 .r(0,-40,170,T('weavers.east'))
 // The granary stands clear of the lane's rats on its staddle stones.
 .sec('The granary').r(120,18,150,T('granary'))
 // The lodging house: up its two-storey wing, its dormer, and onto the block.
 // The Lamb: over the public house, and down onto the roof of its skittle alley.
 .sec('The Lamb').r(84,10,170,T('pub',H(64)))
 .r(0,60,140,T('pub.alley'))
 .sec('The lodging house').r(90,-48,150,T('lodging.wing'))
 .r(0,-64,56,T('lodging.dormer',H(64)))
 .r(0,-66,200,T('lodging',H(70))).cp()
 // The bathhouse's iron tank on its roof is the run-up for the long jump to the corn warehouses.
 // The bathhouse boiler blows off through its roof before the tank.
 .sec('The bathhouse').r(120,128,170,T('baths')).hz(i=>steam(i,.42,88,1.1,3.4))
 .r(0,-58,96,T('baths.tank',H(58)))
 .sec('The corn warehouses').r(196,28,150,T('corn'))
 .r(0,40,140,T('corn.bridge',{k:'e'}))
 .r(0,-70,170,T('corn.east',H(80))).cp()
 // The glazier's glass roof cracks under the courier: across it before it goes, up onto his house.
 // The theatre: along its parapet, a held jump onto the fly tower, and the drop off its far side.
 .sec('The theatre').r(70,30,200,T('theatre'))
 .r(0,-64,90,T('theatre.fly',H(64)))
 .sec('The glazier’s').r(60,104,150,{...C(.6,12),tag:'glazier.glass'})
 .r(30,-50,140,T('glazier'))
 // The undertaker's house, then down onto the roof of his carriage house.
 .sec('The undertaker’s').r(64,30,150,T('undertaker',H(64)))
 .r(0,60,120,T('undertaker.coach'))
 .sec('The rope walk').r(70,6,460,T('ropewalk')).enemy('crawler',.3,60,3.4).enemy('crawler',.74,60,3,1.4)
 // The coal yard: up its hopper on its trestle, then the office roof.
 .sec('The coal yard').r(84,-60,70,T('coal.hopper',H(40)))
 .r(40,-44,130,T('coal'))
 .sec('The cart shed').r(70,90,200,T('cart')).enemy('crawler',.5,56,3.3,.8)
 .sec('The pump house').r(64,-20,80,T('pump'))
 // The parish watch house flies the lane's one flag; its lock-up is the low cell on its east end.
 .sec('The watch house').r(64,28,120,T('watch',H(72))).cp()
 .r(0,44,90,T('watch.cell'))
 // The roofers' store stands at the foot of the tall house; the hoist's pallet runs up the tall house's face.
 .sec('The roofers’ hoist').r(110,-8,120,house('store'))
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
