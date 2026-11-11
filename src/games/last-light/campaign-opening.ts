import {spike,steam,type CampaignRoute,type HazardPlacement} from './campaign-types';
import {trail,C,G,H,M,T} from './route-build';

/** What hurts on the canal is what the canal has broken: the iron stub of a
 * mooring bolt sheared off a dolphin's cap, and the splintered ends of planks
 * torn up out of a builders' staging. Each box is exactly the drawn thing. */
const bolt=(ledge:number,at:number):HazardPlacement=>({ledge,at,kind:'spikes',height:20,width:16});
const torn=(ledge:number,at:number):HazardPlacement=>({ledge,at,kind:'spikes',height:10,width:28});

/** 03 · The Last Ferry
 * It starts where level 2 ended: on the gallery outside the bell tower's
 * door, at the top. The tower stands with its foot in the canal, and its
 * outside stair is iron flights bolted to the face, most treads gone, with
 * landings on the clock hood and over the boat door. Off the stair's foot a
 * bracket, the cutwater and one dolphin of piles cross open water to the
 * head of the near quay in two long jumps; a miss there drowns.
 *
 * Then one canal, travelled along its near quay. The quay is one wall from
 * the coping down into the canal, and it is cut only where something cuts
 * it: the mouth of a side canal, a breach where the wall fell in, a basin
 * let into the bank, the water steps at the coal tip. Each cut is crossed on
 * what lies in it: a moored boat, a dolphin of piles, a timber staging, a
 * raft on a chain. The water in every cut is lethal.
 *
 * Along the quay stand the warehouses that use it. The bonded store's upper
 * quay is a step up, and its post crane swings over the corn basin, where a
 * barge of sacks rides on its rope. The sack wharf's shed is followed by the
 * breach, crossed on the builders' staging with its torn-up planks. The coal
 * merchant's staging ends in the first lethal dash, onto a tarpaulined lighter.
 * The chandlers' loading dock is a step up, and from it two barges out of
 * phase ask for a timed dash to a dolphin with a sheared bolt on its cap. The
 * granary's water steps climb to its upper quay, descend through the loading
 * room and climb out again to the high take-off
 * for the chain basin's raft. On the customs quay a stack of crates is the step
 * up to the custom house landing, and its crane gantry's end is the long jump down onto a fast barge
 * in the customs cut; a dolphin and a dash reach the coal lighter, then the
 * coal tip's quay and its water steps go down into the old dock.
 *
 * The old dock is the long reach: a pontoon whose rotten sections break up
 * under you between two dolphins, then a lighter sunk by the head. Her
 * wheelhouse roof and the two crosstrees left on her mast are the climb; the
 * dash off the masthead is to the lit beacon's stage, and a last pontoon
 * section and a raft on its chain reach Ada's quay. A stepped footbridge over
 * the last side canal comes down, 56 px a landing, to the ferry stage at the
 * waterline. Every landing's tag names the thing it is the top of. */
const CANAL:CampaignRoute=trail(24,96,256,T('tower')).here('The gallery')
 .sec('The outside stair').at(304,152,48,T('tower',G)).at(192,212,64,T('tower',G))
 .sec('The clock hood').at(56,268,104,T('tower')).cp()
 .at(200,332,48,T('tower',G)).at(304,392,48,T('tower',G)).at(200,452,56,T('tower',G))
 .sec('The tower foot').at(24,508,128,T('tower')).cp()
 .at(216,572,48,T('tower',G)).at(280,652,120,T('tower'))
 .at(540,708,44,T('piles'))
 // The bonded store and its upper quay; the crane swings over the corn basin.
 .place('wharf','The bonded quay',{house:1,crane:1,face:2}).sec('The bonded quay')
 .at(750,744,380,T('quay')).cp()
 .at(1130,704,230,T('quay'))
 .side(1000,648,56,T('sill'),true)
 .place('mouth','The corn basin').sec('The corn basin')
 .at(1400,770,120,T('barge.sacks',M(20,.9)))
 .side(1560,772,40,T('skiff'),true)
 .place('wharf','The sack wharf',{house:2,face:0,cart:1,lamp:1}).sec('The sack wharf')
 .at(1620,744,320,T('quay')).cp()
 .place('breach','The breach').sec('The breach')
 .at(2000,760,140,T('staging.torn')).hz(i=>torn(i,.55))
 .place('wharf','The coal stage',{house:3,face:1,fender:1,pier:1}).sec('The coal stage')
 .at(2200,744,220,T('quay')).cp()
 .place('mouth','The lighter dock')
 .at(2420,760,140,T('staging'))
 .sec('The tarpaulin lighter').at(2756,770,120,T('boat.tarp'))
 .place('wharf','Chandlers’ wharf',{house:4,face:3,rope:1}).sec('Chandlers’ wharf')
 .at(2960,744,220,T('quay')).cp()
 .at(3180,688,120,T('dock',H(56)))
 .place('basin','Two barges').sec('Two barges')
 .at(3360,770,100,T('barge.tiller',M(20,1.1)))
 .at(3550,770,110,T('barge.hatch',M(16,1.3)))
 .sec('The sheared bolt').at(3740,760,96,T('piles.bolt')).hz(i=>bolt(i,.5))
 .place('wharf','The granary quay',{house:5,face:2}).sec('The granary steps')
 .at(3880,744,150,T('quay')).cp()
 .at(4030,717,36,T('steps',H(27))).at(4066,690,36,T('steps',H(54)))
 .at(4102,664,72,T('quay'))
 .sec('Inside the granary').at(4174,704,36,T('steps',H(40)))
 .at(4210,744,80,T('quay.floor')).at(4290,704,36,T('steps',H(40)))
 .at(4326,664,36,T('quay'))
 .place('basin','The chain basin').sec('The chain basin')
 .at(4520,770,120,T('raft',M(48,.8)))
 .at(4790,760,56,T('piles'))
 .place('wharf','The customs quay',{house:6,gantry:1,face:0,customs:1}).sec('The customs quay')
 .at(4930,744,200,T('quay')).cp()
 .at(5130,704,48,T('crates',H(40)))
 .at(5178,672,262,T('quay'))
 .sec('The crane gantry').at(5300,608,190,T('gantry',G))
 .side(5524,690,44,T('spar',G),true)
 .place('mouth','The customs cut').sec('The customs cut')
 .at(5600,770,96,T('barge.deals',M(36,1.4)))
 .at(5810,758,48,T('piles'))
 .sec('The coal lighter').at(6030,770,150,T('boat.coal'))
 .place('wharf','The coal tip',{house:7,face:1,fender:1,pier:1}).sec('The coal tip')
 .at(6260,744,220,T('quay')).cp()
 .at(6480,760,32,T('steps',H(32))).at(6512,776,32,T('steps',H(16)))
 .place('basin','The old dock').sec('The old pontoon')
 .at(6620,780,56,T('pontoon',C(.45,12))).at(6756,780,56,T('pontoon',C(.45,12))).at(6900,780,56,T('pontoon',C(.45,12)))
 .at(7052,758,48,T('piles')).cp()
 .sec('The wreck').at(7220,770,72,T('wreck'))
 .at(7292,706,88,T('cabin',H(64)))
 .at(7412,650,56,T('mast',G)).at(7412,586,56,T('mast',G))
 .sec('The beacon').at(7676,574,44,T('beacon'))
 .at(7820,780,56,T('pontoon',C(.45,12)))
 .at(7964,772,96,T('raft',M(44,1.1)))
 .place('wharf','Ada’s quay',{face:0,lamp:3,lit:1}).sec('Ada’s crossing')
 .at(8160,744,200,T('quay')).cp()
 .place('bridge','The footbridge')
 .at(8360,680,72,T('bridge')).at(8432,616,160,T('bridge')).at(8592,672,72,T('bridge')).at(8664,728,72,T('bridge'))
 .at(8752,784,180,T('stage'))
 .done({setting:'canal',goal:'ferry'});


/** The Quarter teaches a movement language; Mossworks combines it into journeys.
 * Each route has authored encounter and rest beats, with every task on the road. */
export const OPENING_ROUTES:readonly CampaignRoute[]=[
 // 01 · The Window Left Open
 // One terrace to Nell’s window, then Bell Lane to the tower's door. Alleys teach the run-up jump over lean-tos and a
 // back yard; a dormer eave then rewards a short hop (a full jump clips its
 // edge and drops you into the yard, which only climbs back toward roof 5).
 // The first tooth and the only lethal drops wait across the street.
 {
  setting:'roofs',goal:'shelter',
  // Past Nell's window is Bell Lane. Her gable stack is a held jump up; the
  // lane is one long jump down onto the bakehouse roof, short of its ridge
  // tooth; the sexton's lean-to is the low point; the forecourt's gate pier
  // is a narrow held jump back up, and the forecourt and the tower door are
  // across the head of its steps. The lane under all of it is the black's.
  route:'24,440,300,s;372,440,180,s;616,440,200,s;912,440,160,s;1184,408,180,s;1484,408,140,s;1720,408,200,s;1992,344,300,s;2420,344,96,s;2628,344,200,s;2892,344,340,s;3232,280,48,s,,,,64;3440,376,168,s;3690,440,96,s;3850,392,56,s,,,,64;3906,456,300,s',
  branches:'300,500,140,s;520,500,140,s;828,488,72,s;912,500,452,s;1364,468,60,s;1424,500,496,s;1688,321,172,e;1920,452,160,s',memories:[1,2,6],
  stations:[],
  checkpoints:[2,5,7,10,12],sectors:[[0,"Our roof"],[2,"Washing lines"],[5,"Low eaves"],[7,"The street"],[10,"Nell’s window"],[11,"Bell Lane"],[14,"The tower forecourt"]],
  hazards:[spike(7,.5,22),spike(9,.72,22),spike(9,.89,22),spike(12,.7,22)],
 },
 // 02 · A Bell Above the Rain
 // The inside of the bell tower, climbed floor by floor. Each floor is oak
 // let into the walls; the stair between floors has lost most of its treads
 // (open treads: jump up through them, Down drops). Ropes and clock weights
 // hang down one open well through every floor into the flooded pit, so a
 // miss on a stair costs a flight and a miss over the well costs the run.
 // The clock room's broken floor is the first dash; frame beams cross the
 // well under the bells to Ivo's landing, and the first of them is rotten.
 {
  setting:'tower',goal:'rescue',
  // Past Ivo the belfry goes on up, and the gallery door is across the top
  // of it. From the bell loft a rotten plank on the bell cage crosses the
  // well to the frame's west post; a wall tread and the west loft are held
  // jumps; staging on the tie beams and on the spire's first collars climbs
  // inside the spire, where the collar was cut away to pass the bell hoist.
  // The hoist's pallet still swings across that gap on its rope, with the
  // whole height of the tower under it. The east staging comes down to the
  // east loft and the gallery door.
  route:'24,1400,240,s;120,1340,56,g;40,1280,56,g;184,1224,80,s;384,1224,160,s;472,1164,56,g;552,1104,56,g;384,1048,80,s;24,1048,240,s;96,988,80,g;24,928,64,g;168,872,96,s;456,872,168,s;512,812,56,g;568,752,56,g;384,696,96,s;24,696,240,s;120,636,56,g;40,576,56,g;184,520,80,s;300,488,48,c,,,0.6,12;400,456,48,g;496,424,128,s;400,364,56,g;464,304,160,s;276,264,72,c,,,0.55,12;168,220,64,g;52,156,56,g;24,88,60,s;120,16,88,s,,,,12;64,-56,64,s,,,,12;292,-40,64,m,90,1.2,,12;520,-56,64,s,,,,12;320,16,88,s,,,,12;424,120,200,s',
  branches:'384,1400,240,s;480,1340,56,g;568,1280,56,g;104,812,56,g;568,248,56,g',memories:[2,3,4],
  stations:[[22,"Ivo"]],exit:.62,
  checkpoints:[4,8,11,16,22,24,28],sectors:[[0,"Bell stair"],[4,"The ringing floor"],[8,"The clock room"],[12,"Under the bells"],[22,"Ivo’s landing"],[24,"The bell loft"],[25,"Over the bells"],[28,"The west loft"],[29,"Inside the spire"],[31,"The bell hoist"],[34,"The gallery door"]],
  hazards:[],water:1500,
 },
 // 03 · The Last Ferry: see CANAL above.
 CANAL,
 // 04 · Windows, Not Stars
 {
  setting:'roofs',goal:'relay',
  route:'24,500,300,s;534,500,100,s;664,500,100,s;974,500,100,s;1274,428,165,s;1604,380,300,s;2089,412,100,c,,,0.62;2269,436,105,c,,,0.62;2574,404,165,s;2919,364,125,s;3214,364,300,s;3724,364,100,s;3854,364,100,s;4164,364,170,s;4514,420,125,s;4804,420,300,s;5299,372,120,s;5499,372,100,c,,,0.62;5799,372,165,s;6154,332,145,s;6474,332,300,s;6924,284,340,s',
  branches:'1127,492,94;3494,428,94;5652,436,94',memories:[0,1,2],
  stations:[[5,"Bakery light"],[10,"Market light"],[15,"East street light"]],
  checkpoints:[5,10,15,20],sectors:[[0,"Bakery roofs"],[5,"Laundry crossing"],[10,"Market awnings"],[15,"The east street"]],
  hazards:[spike(2,.27,24),spike(2,.75,24),steam(4,.74,116,.4,2.8),spike(8,.28,26),spike(8,.75,26),spike(9,.75,24),spike(13,.28,26),spike(13,.75,26),steam(16,.75,116,1.2,2.7),spike(18,.28,26),spike(18,.75,26),spike(19,.75,26)],
 },
 // 05 · The Roof That Remembers
 // The black is in the lane behind you, and the old roofs over the alleys
 // are failing. Every cracked span is slate on builders' shoring with the
 // alley under it: it drops a moment after you land and stays down, so a
 // fall costs the run. Chimney stacks are steps at the gable ends, a fire
 // escape climbs the tall house mid-way, a dash leaves the last stack for a
 // span that is already going, and Tomas's stair-house is on the far roof.
 // It opens at the east street stair-house where level 4 ended. Tomas's
 // stair is barred, so the run goes on with the black still behind it: his
 // wash-house, the linemen's stages on two wire poles, a shored span, and
 // the brewery's fire escape straight up its end wall. The copper vents on
 // the brewery roof; its stack is the step for a dash over Brewery Yard
 // onto a span that is already going; and the malthouse, the pump house
 // and two more shored spans come down the lane to the culvert steps in
 // its headwall, the mouth level 6 starts inside.
 {
  setting:'roofs',goal:'escape',
  route:'24,620,300,s;324,620,104,c,,,0.9;428,620,180,s;636,620,100,c,,,0.7;766,620,96,c,,,0.7;892,588,170,s;1062,524,48,s,,,,64;1190,572,100,c,,,0.6;1340,572,150,s;1560,668,216,s;1776,604,120,g;1776,540,120,g;1896,540,140,s;2064,540,96,c,,,0.6;2190,540,96,c,,,0.6;2316,508,96,c,,,0.6;2452,476,160,s;2612,412,48,s,,,,64;2860,476,100,c,,,0.55;2990,476,140,s;3160,476,96,c,,,0.55;3290,444,96,c,,,0.55;3430,412,360,s;3864,476,112,s;4040,524,40,g;4168,524,40,g;4296,540,96,c,,,0.55;4456,556,120,g;4456,492,120,g;4456,428,120,g;4456,364,120,g;4576,300,260,s;4836,236,48,s,,,,64;5104,364,96,c,,,0.5;5230,396,120,s;5414,460,96,c,,,0.55;5560,540,80,s;5704,604,96,c,,,0.55;5860,668,200,s',
  branches:'468,556,96,g;1776,668,120,g;3020,412,80,g',memories:[0,1,2],
  stations:[],exit:.3,
  checkpoints:[2,5,9,16,22,31,34],sectors:[[0,"The east street stair"],[1,"The first crack"],[2,"Falling tiles"],[5,"The shored alley"],[9,"The tall house"],[16,"The lane"],[22,"Tomas’s chimney"],[23,"The wire poles"],[27,"The brewery escape"],[31,"The brewery roof"],[33,"Brewery Yard"],[36,"Down to the culvert"]],
  hazards:[spike(12,.45,22),spike(19,.5,22),steam(31,.55,88,.3,2.4)],
  pressure:88,
 },
 // 06 · Under the Sleeping City
 // It opens in the lane where level 5 ended, at the culvert's mouth: the
 // gate in the headwall gives onto the outfall shaft, and a dog-leg stair of
 // landings and one hung grating goes down it to the water. A miss in the
 // shaft is the flood at its foot. Then the culvert, as it was:
 // The service culvert under the street: one brick vault, flooded, and the
 // water is lethal. Brick benches rise out of it, lengths of iron main turn
 // down into it, gratings hang from the vault. Steam leaves joints on the
 // mains: one to watch, one at the far end of a landing, a pair out of
 // phase past the stopped pumps, one in the lower duct under a grating. A
 // broken flange and a dash to a venting main lead to the sluice chamber.
 // Past it the inspection walk has rusted through: three lengths of it are
 // left hanging over the water, each good for a moment, with the sluice
 // gate's frame standing between them. A venting main, two hung gratings
 // and a dash to the pipe bridge cross the junction, and a ladder of
 // gratings climbs the shaft to the street stairwell. Three wall lamps are
 // optional.
 {
  setting:'cavern',goal:'signal',water:700,
  route:'24,380,192,s;264,436,96,s;408,500,80,g;264,564,72,s;408,628,96,s;584,660,260,s;900,632,240,s;1200,632,150,s;1420,660,200,s;1676,604,96,g;1820,548,96,g;1980,548,180,s;2230,580,120,s;2410,612,120,g;2410,676,300,s;2790,660,180,s;3040,620,110,s;3230,572,100,s;3420,540,96,g;3716,540,160,s;3960,596,200,s;4230,596,72,c,,,0.5,12;4366,596,72,c,,,0.5,12;4510,572,48,s,,,,128;4640,596,72,c,,,0.5,12;4790,580,150,s;5010,524,96,g;5176,468,96,g;5502,500,110,s;5690,596,200,s;5930,548,110,g;5930,484,110,g;5930,420,110,g;6090,372,300,s',
  branches:'908,568,80,g;2570,612,100,g;5930,356,110,g',memories:[0,1,2],
  stations:[[8,"Culvert lamp"],[15,"Duct lamp"],[20,"Shaft lamp"]],
  checkpoints:[3,8,15,20,25,29,33],sectors:[[0,"The culvert mouth"],[1,"The outfall stair"],[5,"The water main"],[8,"Sleeping pumps"],[13,"The lower duct"],[15,"The broken flange"],[20,"The sluice chamber"],[21,"The rusted walk"],[25,"The junction"],[28,"The pipe bridge"],[29,"Street foundations"]],
  hazards:[steam(6,.5,96,0,3.2),steam(7,.8,96,.8,3),steam(11,.5,96,0,3),steam(12,.5,96,1.5,3),steam(14,.7,80,.4,3),spike(17,.8,22),steam(19,.75,96,1,3),steam(25,.62,96,.5,2.8)],
 },
 // 07 · The Counterweight
 // The hoist tower: one brick shaft, two lift wells, the pit under both.
 // Cages ride guide rails on cables from the crown (their phase follows
 // platform id and a 3.6 s cycle, so each is low when boarded and high when
 // left). Landings are iron floors on girders across the shaft; ladders are
 // gratings on the side walls. A counterweight drops through two landings
 // on a telegraphed cycle (ENCOUNTER_ADDITIONS[6]) and is harmless raised.
 // Three dashes cross a well with nothing under them. Each brake wheel
 // shuts one steam vent further up.
 {
  setting:'tower',goal:'shelter',stationKind:'valve',
  // The culvert's stairwell comes up into the pit at the start. Past the
  // crown landing the climb goes on over the sheaves to the hoist house,
  // and the way out is the door in its wall, on its floor: no lift. A loose
  // plate lies on the trimmers of the east well; the east ladder climbs to
  // the sheave deck, a dash across that well; the last counterweight drops
  // through the deck; a second loose plate is the step for the jump over
  // the west well to the hatchway ladder, which comes up through the hoist
  // house floor beside the winding drums.
  route:'24,1500,208,s;242,1400,100,l,100,1.745;352,1300,240,s;712,1300,176,s;760,1236,128,g;760,1172,128,g;352,1140,240,s;242,1040,100,l,100,1.745;24,940,208,s;72,876,128,g;72,812,128,g;352,780,240,s;602,700,100,l,80,1.745;712,620,176,s;760,556,128,g;760,492,128,g;352,460,240,s;640,412,56,c,,,0.5,12;760,364,128,g;760,300,128,g;472,300,104,s,,,,12;352,300,72,c,,,0.5,12;72,252,128,g;72,188,128,g;200,124,688,s',
  branches:'24,1300,208,s;24,1140,208,s;352,620,240,s',memories:[0,1,2],
  stations:[[6,"Lower brake wheel"],[11,"Upper brake wheel"]],exit:.68,
  checkpoints:[2,3,6,8,11,13,16,19,22],sectors:[[0,"The lift pit"],[2,"Counterweight walk"],[4,"The ladder"],[6,"The brake room"],[8,"The west landing"],[11,"The machine room"],[13,"Under the winding gear"],[16,"The lift crown"],[17,"Over the sheaves"],[20,"The sheave deck"],[22,"The hatchway"],[24,"The hoist house"]],
  hazards:[steam(13,.5,96,.4,2.8,0),steam(16,.8,96,0,3,1)],
 },
 // 08 · The Quarter’s Reply
 // It opens at the door out of the hoist house, the top of the hoist tower
 // standing at the bridgehead. The approach arches come first: a pier stump
 // where an arch fell, a cracked plank on a trestle, the toll house and its
 // stack, then the approach roadway as it was.
 // The old bridge to the garden bank, with its arches gone and the river
 // under all of it. Each length of roadway is the top of its pier; bridge
 // houses stand on theirs, with a chimney stack as a step at the gable. A
 // rook walks each house roof. The middle is the test: two trestle planks,
 // a dash to a stump, down to a cutwater, a punt on a rope, and a scaffold
 // back up to the roadway. Past the far roadway a second span is down, at
 // the mill pier: the mill's roof and stack, a long jump to a pier stump,
 // then the starlings at the waterline with a cracked plank and a second
 // punt between them, and a scaffold back up to the last span. The
 // gatehouse on the garden bank is one building and its bridge gate is
 // barred: a scaffold on its wall walk climbs to the tower top, the tool
 // house against its garden side is the way down, and the garden gate is
 // in the wall along the bank. Three bridge lamps are optional.
 {
  setting:'bridge',goal:'signal',water:760,exit:.57,
  route:'24,560,232,s;344,600,64,s;480,560,96,c,,,0.7;640,496,160,s;800,432,48,s,,,,64;1024,560,300,s;1420,560,120,s;1636,560,240,s;1972,496,200,s;2172,432,48,s,,,,64;2300,560,160,s;2500,560,100,c,,,0.7;2630,560,96,c,,,0.7;2930,560,96,s;3080,656,96,s;3236,716,110,m,30,1;3436,700,96,s;3436,636,96,g;3436,572,96,g;3566,560,240,s;3902,560,96,s;4070,496,150,s;4220,432,48,s,,,,64;4488,560,56,s;4610,668,90,s;4760,700,56,c,,,0.5;4876,716,96,m,34,1.1;5066,668,90,s;5066,604,90,g;5066,540,90,g;5186,560,200,s;5482,496,180,s;5662,432,48,s,,,,64;5806,496,310,s;6006,432,110,g;6006,368,110,g;6132,320,244,s;6392,424,104,s;6384,560,520,s',
  branches:'1556,656,72,s;1556,608,72,g;3700,700,96,s;6006,304,110,g',memories:[1,2,3],
  stations:[[7,"Quarter lamp"],[19,"Bridge lamp"],[33,"Garden gate lamp"]],
  checkpoints:[3,7,10,13,19,24,30,33,36],sectors:[[0,"The hoist house door"],[1,"The approach arches"],[3,"The toll house"],[5,"Bridge approach"],[8,"The first bridge house"],[10,"Broken middle span"],[14,"Down at the piers"],[19,"The far roadway"],[20,"The mill pier"],[24,"The starlings"],[30,"The last span"],[33,"The gatehouse"],[37,"The garden side"],[38,"The garden gate"]],
  hazards:[spike(6,.8,22),spike(10,.5,22)],
  enemies:[{ledge:8,at:.5,kind:'crawler',travel:60,period:4.2},{ledge:31,at:.5,kind:'crawler',travel:50,period:3.8}],
 },
 // 09 · Water for the Living
 // It opens inside the garden gate level 8 ended at, on the path at the
 // foot of the garden bank, and climbs the bank's terraces to the glasshouse
 // at the top. A terrace is ground behind its retaining wall, so each step
 // up is a wall to jump. Twice the bank has slipped into the river and what
 // crosses the slip is the old irrigation launder: rotten lengths of timber
 // trough on trestles, each good for a moment, with nothing under them. The
 // cistern is dry and its inlet main crosses it, spraying from a burst
 // joint; the intake wheel on the cistern's wall shuts that off. A
 // water-balance hoist rides the high wall. The return wheel on the fifth
 // terrace shuts the jet on the glasshouse terrace. Neither wheel is needed
 // to reach the glasshouse door.
 {
  setting:'garden',goal:'shelter',stationKind:'valve',
  route:'24,1000,340,s;364,952,64,s,,,,76;428,904,260,s,,,,124;688,840,48,s,,,,188;736,776,300,s,,,,252;1100,792,72,c,,,0.55,12;1236,792,72,c,,,0.55,12;1380,760,56,s;1520,808,72,c,,,0.5,12;1660,776,56,s;1790,808,72,c,,,0.5,12;1950,840,64,s;2150,808,56,g;2150,744,56,g;2234,680,216,s,,,,364;2450,648,170,s,,,,12;2710,680,60,g;2810,680,240,s,,,,364;3066,640,64,l,60,1;3066,524,64,g;3066,460,64,g;3066,396,64,g;3156,368,220,s,,,,312;3376,304,48,s,,,,376;3424,240,200,s,,,,440;3690,256,72,c,,,0.5,12;3830,224,56,s;3960,240,72,c,,,0.5,12;4100,208,56,s;4230,224,72,c,,,0.5,12;4390,192,64,s;4670,208,200,s,,,,472;4870,144,400,s,,,,536',
  branches:'2450,916,360,s;2754,852,56,g;2754,788,56,g;2754,724,56,g;1380,696,56,g;3830,160,56,g',memories:[0,4,5],
  stations:[[14,"Garden intake wheel"],[24,"Glasshouse return wheel"]],exit:.6,
  checkpoints:[2,4,9,14,17,22,24,28,31],sectors:[[0,"Inside the garden gate"],[1,"Kitchen terraces"],[5,"The landslip"],[12,"The cistern rungs"],[14,"The dry cistern"],[17,"The water hoist"],[22,"The high terraces"],[25,"The broken launder"],[31,"The glasshouse terrace"]],
  hazards:[steam(15,.55,88,.4,2.7,0),steam(31,.7,96,1.2,2.7,1)],
 },
 // 10 · A Voice in the Reeds
 // It opens on the glasshouse path where level 9 ended, at the glasshouse's
 // far end, and goes down the water stairs into the reed beds: the garden's
 // old ponds, with the bank's water lying in them. A punt on its rope, pile
 // heads and two rotten duckboards reach the eel stage; its ladder climbs to
 // the boathouse roof for a dash to a lone post, and a second punt reaches
 // the drowned willow, whose two boughs are the climb for a dash to the
 // water-gate pier and the sunken garden's wall. The sunken garden is flooded to its coping:
 // the pergola's beams on their columns, or the stones under them, cross to
 // the plinth and Pip's summerhouse. The fountain's two bowls are the step
 // for the dash to the east wall. Beyond it is the lily court: an urn's
 // pedestal, one more length of pergola, a third punt, and two duckboards
 // to the sluice. The cascade, dry now, climbs from there to the upper bank
 // and the orchard gate.
 {
  setting:'canal',goal:'rescue',water:760,
  route:'24,560,300,s;388,640,80,s;540,712,64,s;684,728,96,m,30,1;890,712,56,s;1020,712,56,s;1150,716,72,c,,,0.5,12;1290,716,72,c,,,0.5,12;1430,696,120,s;1610,648,56,g;1610,584,56,g;1610,520,56,g;1666,456,180,s;2060,640,56,s;2190,712,64,s;2330,728,96,m,40,1.2;2520,712,60,s;2540,648,64,g;2540,584,64,g;2820,632,56,s;2950,680,150,s;3160,632,110,s,,,,8;3330,632,110,s,,,,8;3500,656,48,s;3620,696,260,s;3950,656,56,s;4070,600,48,s;4330,656,150,s;4560,640,48,s;4680,600,110,s,,,,8;4870,728,96,m,34,1.3;5060,712,60,s;5190,716,72,c,,,0.5,12;5330,716,72,c,,,0.5,12;5470,696,64,s;5600,640,80,s;5680,584,80,s,,,,84;5760,528,80,s,,,,140;5840,472,320,s,,,,196',
  branches:'770,656,44,g;2236,640,48,g;3190,716,56,s;3350,716,56,s;3630,632,48,g',memories:[0,1,4],
  stations:[[24,"Pip"]],exit:.6,
  checkpoints:[1,8,12,16,20,24,27,31],sectors:[[0,"The glasshouse path"],[1,"The water stairs"],[3,"The reed beds"],[8,"The eel stage"],[12,"The boathouse"],[16,"The drowned willow"],[20,"The sunken garden"],[24,"Pip’s summerhouse"],[25,"The fountain"],[27,"The east wall"],[28,"The lily court"],[35,"The cascade"],[38,"The orchard gate"]],
  hazards:[],
 },
 // 11 · The Orchard Circuit
 {
  setting:'garden',goal:'relay',
  route:'24,560,300,s;534,560,95,s;659,560,90,c,,,0.56;959,528,100,b;1234,416,135,s;1539,416,320,s;2054,376,110,s;2244,400,85,c,,,0.56;2534,376,160,s;2889,336,120,s;3179,336,320,s;3709,336,95,s;3834,336,90,s;4134,336,170,s;4494,448,110,s;4769,408,320,s;5289,408,85,c,,,0.56;5414,368,110,s;5734,368,100,s;5864,368,95,s;6169,328,300,s;6634,280,350,s',
  branches:'1412,480,84;3479,400,84;5504,432,84',memories:[0,1,2],
  stations:[[5,"Trellis light"],[10,"Orchard light"],[15,"Root arch light"]],
  checkpoints:[5,10,15,20],sectors:[[0,"Bending boughs"],[5,"The high orchard"],[10,"Rootward path"],[15,"The warm roots"]],
  hazards:[spike(4,.27,22),spike(4,.76,22),spike(6,.75,24),spike(8,.28,26),spike(8,.75,26),steam(9,.75,128,.6,2.7),spike(12,.75,22),steam(13,.74,128,.8,2.6),spike(14,.75,24),steam(17,.75,128,1.5,2.7),spike(18,.28,26),spike(18,.75,26),spike(19,.75,24)],
 },
 // 12 · A House Made of Glass
 {
  setting:'tower',goal:'shelter',
  route:'24,960,300,s;484,920,100,s;614,920,100,s;914,880,170,s;1264,832,95,c,,,0.56;1529,784,300,s;1989,728,105,s;2244,664,125,s;1954,600,115,s;1684,552,120,s;1234,552,300,s;944,504,100,c,,,0.56;809,504,100,s;529,456,110,c,,,0.56;204,408,125,s;24,344,100,b;294,220,115,s;584,172,300,s;1074,172,105,s;1209,172,95,s;1504,100,115,s;1799,28,350,s',
  branches:'1125,896,90;882,568,90;820,248,90',memories:[0,1,2],
  stations:[],
  checkpoints:[5,10,17],sectors:[[0,"Glasshouse stair"],[5,"Eastern windows"],[10,"The hanging room"],[17,"Elian’s roof"]],
  hazards:[spike(3,.28,26),spike(3,.75,26),steam(6,.75,128,.5,2.7),spike(8,.27,24),spike(9,.26,24),steam(12,.27,128,1.4,2.6),spike(14,.25,20),spike(14,.76,20),spike(19,.75,24),spike(20,.75,24)],
 },
 // 13 · Borrowed Ground
 {
  setting:'garden',goal:'escape',
  route:'24,500,300,s;534,500,95,s;659,500,85,c,,,0.56;954,500,100,c,,,0.56;1259,428,165,s;1594,428,300,s;2089,460,90,c,,,0.56;2259,428,85,c,,,0.56;2544,380,155,s;2894,380,110,s;3174,340,300,s;3684,340,95,s;3809,340,90,c,,,0.56;4109,340,90,c,,,0.56;4389,300,160,s;4714,300,300,s;5214,324,85,c,,,0.56;5339,300,90,c,,,0.56;5639,300,100,s;5769,300,95,s;6074,252,300,s;6539,212,350,s',
  branches:'1114,492,84;3454,404,84;5409,364,84',memories:[0,1,2],
  stations:[],
  checkpoints:[5,10,15,20],sectors:[[0,"Split trellis"],[5,"Pulling roots"],[10,"Stone cistern"],[15,"The new bank"]],
  hazards:[spike(1,.75,24),spike(4,.28,26),spike(4,.75,26),spike(8,.27,24),spike(8,.76,24),spike(9,.75,24),spike(11,.75,24),spike(14,.28,26),spike(14,.75,26),spike(18,.28,26),spike(18,.75,26),spike(19,.75,24)],
  pressure:100,
 },
 // 14 · The Rain Machine
 {
  setting:'factory',goal:'engine',
  route:'24,560,300,s;534,560,95,s;659,560,90,m,20,1.2;959,560,90,s;1244,560,120,s;1534,520,300,s;1989,520,340,s;2524,520,150,s;2754,488,90,l,24,1.15;3039,448,150,s;3364,448,300,s;3874,448,95,s;3999,448,90,m,20,1.2;4299,448,165,s;4644,448,340,s;5144,448,280,s;5634,448,100,>;5764,448,95,s;6069,408,165,s;6424,360,300,s;6894,360,120,s;7179,320,350,s',
  branches:'1104,624,84;3644,512,84;5434,512,84',memories:[0,1,2],
  stations:[[6,"Feed pump wheel"],[14,"Rain pump wheel"]],
  checkpoints:[5,10,15,19],sectors:[[0,"Moving trays"],[5,"The feed pump"],[10,"Rain lift"],[15,"Pressure walk"]],
  hazards:[spike(3,.75,24),steam(4,.75,128,.4,2.7),steam(7,.75,128,.6,2.6,0),steam(9,.75,128,1.9,2.7),spike(11,.75,24),spike(13,.28,26),spike(13,.75,26),steam(16,.75,128,1.6,2.6,1),steam(17,.75,128,.3,2.7),spike(18,.28,26),spike(18,.75,26),spike(20,.75,24)],
 },
 // 15 · Where the Roots Go
 {
  setting:'cavern',goal:'rescue',
  route:'24,380,300,s;534,380,95,s;659,380,95,s;964,380,100,s;1269,500,120,s;1559,548,300,s;2054,580,90,c,,,0.56;2224,620,150,s;2574,620,110,c,,,0.56;2879,652,150,s;3199,652,340,s;3749,652,95,s;3874,652,90,c,,,0.56;4174,580,165,s;4524,508,110,s;4799,492,300,s;5294,444,90,c,,,0.56;5424,404,110,s;5744,404,100,s;5874,404,95,s;6179,364,300,s;6644,316,350,s',
  branches:'1164,444,100,c,,,0.58;3519,716,84;5514,468,84;1324,612,120',memories:[3,1,2],
  stations:[[10,"The gardener"]],
  checkpoints:[5,10,15,20],sectors:[[0,"Cellar mouth"],[5,"Deep roots"],[10,"The gardener’s room"],[15,"Fresh air stair"]],
  hazards:[spike(2,.75,22),spike(3,.75,24),steam(4,.75,128,.5,2.7),steam(7,.75,128,1.2,2.7),spike(8,.75,24),spike(9,.27,24),spike(9,.76,24),spike(11,.75,24),steam(13,.75,128,.5,2.6),spike(14,.75,24),steam(17,.75,128,1.6,2.7),spike(18,.28,26),spike(18,.75,26),spike(19,.75,24)],
 },
 // 16 · The Garden’s Answer
 {
  setting:'garden',goal:'signal',
  route:'24,600,300,s;534,600,95,s;659,600,95,b;964,456,165,s;1329,456,120,s;1619,456,300,s;2114,480,85,c,,,0.56;2279,456,90,c,,,0.56;2569,416,155,s;2919,416,110,s;3199,376,320,s;3729,376,95,s;3854,376,90,m,20,1.2;4154,376,165,s;4504,368,110,s;4779,368,320,s;5274,392,95,b;5544,280,165,s;5919,280,100,s;6049,280,95,s;6354,320,300,s;6849,280,110,s;7039,280,155,s;7394,232,360,s',
  branches:'1187,520,84;3499,440,84;5689,344,84',memories:[0,1,2],
  stations:[[5,"Garden gate signal"],[10,"Hollow tree signal"],[15,"Crown signal"]],
  checkpoints:[5,10,15,20],sectors:[[0,"The moth stair"],[5,"The old trellis"],[10,"Hollow branches"],[15,"The great tree"]],
  hazards:[spike(3,.28,26),spike(3,.75,26),steam(4,.75,128,.4,2.6),spike(8,.27,24),spike(8,.76,24),spike(9,.75,24),steam(11,.75,128,1.3,2.7),spike(13,.28,26),spike(13,.75,26),spike(14,.75,24),spike(17,.28,26),spike(17,.75,26),steam(18,.75,128,1.5,2.6),spike(19,.75,24),steam(21,.75,128,1.9,2.6),spike(22,.27,24),spike(22,.76,24)],
 },
];
