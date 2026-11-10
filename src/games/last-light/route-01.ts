import {spike,steam} from './campaign-types';
import {trail,C,G,H,L,M,T} from './route-build';

/** 01 · The Window Left Open
 * One terrace to Nell's window, as it always was: the alleys teach the run-up
 * jump over lean-tos and a back yard, a dormer eave rewards the short hop,
 * and the first tooth and the first lethal drop wait across the street. Her
 * gable stack is a held jump up, and Bell Lane is one long jump down from it.
 * From there the level is the lane itself, roof by roof to the bell tower
 * with the black's lane under all of it: the bakehouse and its three flues,
 * the coopers' row over its alleys and the barrel sling across the widest, the cowls of the maltings, the roofers'
 * hoist up the tall house, the studio's cracked skylights, the laundry's
 * travelling basket, a fire escape down into Chandlers' Yard and its wall
 * tops, the landings round the brewery's great stack, the sack hoist to the
 * hay loft, the pigeon lofts, the tannery's drying racks, the gutters under
 * two dormer eaves, the glazier's panes, a tenement's fire escape, the
 * almshouse stacks, the line posts, the plank footbridge, the bell
 * founder's flues and crane, the chapel, the sign gantry, and the sexton's
 * yard under the tower forecourt. */
const stack=T('stack',H(64)),pane=T('pane',C(.6)),board=T('board',G),escape=T('escape',G),rung=T('rung',G),loft=T('loft'),cote=T('cote'),rack=T('rack',{k:'e'}),post=(h=56)=>T('post',H(h)),wall=(h=48)=>T('wall',H(h)),cowl=(h=56)=>T('cowl',H(h));
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
 // The lane: one long jump down onto the bakehouse, short of its ridge tooth. Its three flues vent out of step.
 .sec('The bakehouse').place('bakehouse').at(3440,376,168).cp().hz(i=>spike(i,.7,22))
 .r(64,-32,330,T('flues')).hz(i=>steam(i,.3,88,0,3.2)).hz(i=>steam(i,.56,88,1.6,3.2)).hz(i=>steam(i,.82,88,0,3.2))
 .r(72,0,140)
 .r(0,-64,48,stack)
 .sec('Coopers’ Row').place('row').r(136,64,180).cp()
 .r(148,0,150)
 // The coopers' barrel sling rides its rail across the widest alley.
 .r(110,8,64,T('sling',M(60,1.4,12)))
 .r(110,-8,120)
 .r(104,0,110)
 .r(120,-32,110)
 .r(0,-64,48,stack)
 .r(140,96,130)
 .r(96,-48,96)
 .r(110,48,200).hz(i=>spike(i,.55,22))
 .r(0,-64,48,stack)
 .r(150,96,160)
 // The maltings: the kiln roofs carry their cowls in a row, each a narrow cap at its own height.
 .sec('The maltings').place('maltings').r(70,-24,44,cowl()).r(78,-24,44,cowl(80)).r(82,24,44,cowl()).r(78,-40,44,cowl(96))
 .r(90,64,400,T('flues')).cp().hz(i=>steam(i,.2,88,0,3.6)).hz(i=>steam(i,.42,88,1.8,3.6)).hz(i=>steam(i,.64,88,0,3.6)).hz(i=>steam(i,.86,88,1.8,3.6))
 .r(74,-32,44,cowl(72))
 .r(84,32,150)
 // The roofers' hoist: one pallet on a rope, the whole height of the tall house. Two boards of the scaffold are off it.
 .sec('The roofers’ hoist').place('scaffold').r(90,0,120,T('store')).cp()
 .r(8,-170,64,T('hoist',L(170,1.2,12))).off(-88,62,72,board).off(-88,-48,72,board,true)
 .r(8,-174,300,T('tall')).hz(i=>spike(i,.4,22)).enemy('crawler',.72,44,4.2).cp()
 .sec('The skylights').place('studio').r(56,16,64,pane).r(40,0,64,pane).r(40,0,64,pane)
 .r(48,-16,140)
 .r(44,16,64,pane).r(40,0,64,pane)
 .r(44,-16,120)
 .r(0,-64,48,stack)
 .r(150,96,150).cp()
 .sec('The laundry').place('laundry').r(80,32,96,loft)
 .r(180,8,72,T('basket',M(140,1,12)))
 .r(180,-8,120,loft)
 .r(64,32,96)
 .r(72,32,140).cp()
 .sec('Chandlers’ Yard').place('yard').r(24,56,88,escape).r(16,56,88,escape).l(16,56,88,escape).r(16,56,88,escape)
 .r(16,24,150,T('shed'))
 .r(60,-24,40,wall()).r(72,0,40,wall())
 .r(72,24,120,T('shed'))
 .r(84,-24,40,wall(64))
 .r(90,16,160,T('store')).cp()
 // The brewery's great stack: iron landings climb round it to the cap, and the far side is three long steps down.
 .sec('The brewer’s stack').place('greatstack').r(40,-24,64,rung).r(-20,-60,64,rung).r(-108,-60,64,rung).r(-20,-60,64,rung)
 .r(-108,-60,64,rung)
 .r(30,-36,150,T('cap',H(40)))
 .r(120,88,110).r(130,88,120)
 .r(120,64,150,T('store')).cp()
 .sec('The hay loft').place('hayloft').r(8,-130,64,T('hoist',L(130,1.5,12)))
 .r(8,-134,260,loft).enemy('crawler',.55,50,3.8).cp()
 .sec('The pigeon lofts').place('lofts').r(70,16,56,cote).r(76,-24,48,cote).r(84,32,56,cote).r(72,-16,48,cote).r(80,24,56,cote).r(76,-32,48,cote).r(84,24,56,cote).r(78,-24,48,cote).r(82,32,56,cote).r(84,16,150).cp()
 // The drying racks of the tannery: six rails, a hide's width each, stepping down and up again.
 .sec('The drying racks').place('racks').r(56,16,84,rack).r(60,16,84,rack).r(64,16,84,rack).r(64,-16,84,rack).r(60,-16,84,rack).r(64,-16,84,rack).r(62,16,84,rack).r(64,-16,84,rack)
 .r(60,0,160).cp()
 // Down the tannery's fire escape to the low houses, and their gutters under two dormer eaves.
 .sec('The long gutters').place('gutters').r(24,56,88,escape).r(16,56,88,escape).l(16,56,88,escape).r(16,56,88,escape)
 .r(60,24,120)
 .r(96,0,200).off(-32,-87,172,{k:'e'})
 .r(96,0,160).off(-32,-87,150,{k:'e'})
 .r(110,0,110)
 .r(96,0,180).off(-32,-87,160,{k:'e'})
 .r(0,-64,48,stack)
 .r(150,96,180).cp()
 .sec('The glazier’s').place('glazier').r(48,16,60,pane).r(36,0,60,pane)
 .r(36,-16,44,T('mullion',H(40)))
 .r(36,16,60,pane).r(36,0,60,pane)
 .r(36,-16,44,T('mullion',H(40)))
 .r(36,16,60,pane)
 .r(48,-16,160)
 // The tenement's fire escape, up its end wall.
 .sec('The tenement').place('tenement').r(40,-8,88,escape).r(-40,-60,88,escape).r(-136,-60,88,escape).r(-40,-60,88,escape)
 .r(20,-40,220,T('tall')).hz(i=>spike(i,.5,22)).cp()
 .r(130,48,120)
 .sec('Almshouse Row').place('almshouse').r(0,-64,48,stack)
 .r(160,96,140)
 .r(120,-32,96)
 .r(0,-64,48,stack)
 .r(165,96,120).cp()
 .r(110,-32,100)
 .r(0,-64,48,stack)
 .r(150,96,130)
 .r(130,32,150).hz(i=>steam(i,.55,88,1.2,2.8))
 .r(140,0,96)
 .r(100,32,180).cp()
 .sec('The line posts').place('posts').r(70,-24,28,post()).r(84,-16,28,post(72)).r(84,16,28,post(56)).r(90,-24,28,post(80)).r(86,24,28,post(56)).r(84,-16,28,post(72)).r(88,16,28,post(56)).r(84,-24,28,post(80))
 .r(80,48,140).cp()
 // The slaters' scaffold on the corn exchange: boards up its front, one of them cracked, a hoist for the top lift, and the fire escape down its far end.
 .sec('The slaters’ scaffold').place('scaffold').r(20,-56,72,board).r(-28,-60,72,board).r(-116,-60,72,T('cracked',C(.6)))
 .r(8,-70,64,T('hoist',L(70,1.3,12)))
 .r(8,-74,240,T('tall')).hz(i=>spike(i,.55,22)).cp()
 .r(24,56,88,escape).r(16,56,88,escape).l(16,56,88,escape).r(16,56,88,escape).l(16,56,88,escape)
 .r(120,24,140)
 .sec('The footbridge').place('footbridge').r(40,-16,110,T('plank',{k:'e'})).r(28,0,56,T('plank',C(.5))).r(28,0,110,T('plank',{k:'e'})).r(28,0,56,T('plank',C(.5))).r(28,0,90,T('plank',{k:'e'}))
 .r(48,16,150).cp()
 // The bell founder's: the casting shed's flues in a row along its ridge, then the yard crane's pallet up to the pattern loft.
 .sec('The bell founder’s').place('foundry').r(96,16,360,T('flues')).hz(i=>steam(i,.24,88,0,3.4)).hz(i=>steam(i,.5,88,1.7,3.4)).hz(i=>steam(i,.76,88,.4,3.4))
 .r(110,32,120,T('store'))
 .r(8,-110,64,T('hoist',L(110,1.6,12)))
 .r(8,-114,180,loft).cp()
 .r(130,-16,96)
 .sec('The chapel').place('chapel').r(110,-32,340).hz(i=>spike(i,.3,22)).hz(i=>spike(i,.62,22)).enemy('crawler',.82,36,3.8)
 .r(0,-64,56,T('bellcote',H(64))).off(-8,-72,72,{k:'e'},true)
 .r(140,112,140,T('vestry')).cp()
 .r(110,-24,120).r(120,16,130)
 .sec('The sign gantry').place('gantry').r(40,24,72,T('gantry',G)).r(48,16,72,T('gantry',G)).r(48,-16,72,T('gantry',G)).r(56,16,72,T('gantry',G)).r(52,-16,72,T('gantry',G)).r(48,-16,72,T('gantry',G)).r(56,32,72,T('gantry',G)).r(52,-16,72,T('gantry',G)).r(48,16,72,T('gantry',G))
 .r(60,24,160)
 .sec('The sexton’s yard').place('yard').r(24,56,88,escape).r(16,56,88,escape).l(16,56,88,escape)
 .r(16,24,120,T('shed'))
 .r(64,-24,40,wall()).r(76,-16,40,wall(64)).r(76,16,40,wall())
 .r(72,24,110,T('shed'))
 .r(70,-24,40,wall()).r(76,24,40,wall()).r(74,-24,40,wall(64)).r(72,24,110,T('shed'))
 .r(70,-24,40,wall()).r(78,-24,40,wall(64))
 .r(70,0,160)
 .r(0,-64,48,stack)
 // Down off the last stack: the sexton's house, its lean-to, and the forecourt's gate pier, a narrow held jump back up.
 .sec('The tower forecourt').place('forecourt').r(160,96,168).cp().hz(i=>spike(i,.7,22))
 .r(82,64,96,T('lean'))
 .r(64,-48,56,T('pier',H(64)))
 .r(0,64,300,T('court'))
 .done({setting:'roofs',goal:'shelter'});
