import {spike,steam,type CampaignRoute} from './campaign-types';

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
 // 03 · The Last Ferry
 // It starts where level 2 ended: on the gallery outside the bell tower's
 // door, at the top. The tower stands with its foot in the canal, and its
 // outside stair is iron flights bolted to the face, most treads gone, with
 // landings on the clock hood and over the boat door. Off the stair's foot a
 // bracket, the cutwater and one dolphin of piles cross open water to the
 // stone quay in two long jumps; a miss there drowns. Then the canal, as it was:
 // One canal, travelled along its near quay. Everything stood on is a quay
 // built down into the water, a cluster of mooring piles, a timber staging
 // or a boat; the water under all of it is lethal. A barge tied off the
 // first quay shows riding. Mooring piles ask for braking, the staging end
 // is the first lethal dash (onto a moored lighter), two barges out of
 // phase ask for a timed dash, a bolt stands on one pile cap, and a raft on
 // a chain crosses a basin; a fast barge, a second bolt and a dash onto the
 // coal lighter lead on. Past the lighter is the long reach: an old pontoon
 // whose rotten sections break up under you between two dolphins, then a
 // lighter sunk by the head. Its wheelhouse roof and the two crosstrees left
 // on its mast are the climb; the dash off the masthead is to a beacon's
 // stage, and a last pontoon section and a raft on its chain reach Ada's
 // quay. A stepped footbridge over the last side canal comes down, 56 px a
 // landing, to the ferry stage at the waterline.
 {
  setting:'canal',goal:'ferry',
  route:'24,96,256,s;304,152,48,g;192,212,64,g;56,268,104,s;200,332,48,g;304,392,48,g;200,452,56,g;24,508,128,s;216,572,48,g;280,652,120,s;540,708,44,s;750,744,300,s;1082,770,112,m,20,.9;1226,744,240,s;1534,760,56,s;1658,756,56,s;1794,770,100,m,28,1;1986,744,260,s;2306,760,120,s;2622,770,120,s;2806,760,56,s;2930,744,220,s;3222,770,100,m,20,1.1;3526,770,110,m,16,1.3;3718,760,96,s;3878,744,200,s;4150,760,56,s;4274,756,56,s;4426,770,120,m,48,.8;4674,760,56,s;4814,770,96,m,36,1.4;5066,760,96,s;5226,756,48,s;5446,770,120,s;5666,758,48,s;5786,780,56,c,,,0.45,12;5922,780,56,c,,,0.45,12;6066,780,56,c,,,0.45,12;6218,758,48,s;6386,770,72,s;6458,706,88,s,,,,64;6578,650,56,g;6578,586,56,g;6842,574,44,s;6986,780,56,c,,,0.45,12;7130,772,96,m,44,1.1;7326,744,200,s;7526,680,72,s;7598,616,160,s;7758,672,72,s;7830,728,72,s;7918,784,180,s',
  branches:'1478,772,48,s;2750,772,48,s;4354,700,44,g',memories:[0,1,2],
  stations:[],
  checkpoints:[3,7,13,17,21,25,31,38,46],sectors:[[0,"The gallery"],[1,"The outside stair"],[3,"The clock hood"],[7,"The tower foot"],[11,"Stone quay"],[13,"Mooring piles"],[17,"The staging"],[21,"Two barges"],[25,"The chain raft"],[31,"The coal lighter"],[34,"The old pontoon"],[39,"The wreck"],[43,"The beacon"],[46,"Ada’s crossing"]],
  hazards:[spike(24,.78,22),spike(31,.8,22)],
 },
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
  setting:'tower',goal:'engine',
  // Past the crown landing the shaft goes on up over the sheaves: a grating
  // hung from the lift landing's girder, one across the top of the first
  // well (a miss there is the whole shaft), one hung from the roof by the
  // west wall, and the lift landing, where the counterweight lift rides one
  // storey up into the hoist house to its door. The culvert's stairwell
  // comes up into the pit at the start.
  route:'24,1500,208,s;242,1400,100,l,100,1.745;352,1300,240,s;712,1300,176,s;760,1236,128,g;760,1172,128,g;352,1140,240,s;242,1040,100,l,100,1.745;24,940,208,s;72,876,128,g;72,812,128,g;352,780,240,s;602,700,100,l,80,1.745;712,620,176,s;760,556,128,g;760,492,128,g;352,460,240,s;440,396,64,g;248,332,80,g;96,268,96,g;232,208,656,s',
  branches:'24,1300,208,s;24,1140,208,s;352,620,240,s',memories:[0,1,2],
  stations:[[6,"Lower brake wheel"],[11,"Upper brake wheel"]],exit:.7,
  checkpoints:[2,3,6,8,11,13,16],sectors:[[0,"The lift pit"],[2,"Counterweight walk"],[4,"The ladder"],[6,"The brake room"],[8,"The west landing"],[11,"The machine room"],[13,"Under the winding gear"],[16,"The lift crown"],[17,"Over the sheaves"],[20,"The lift landing"]],
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
 // back up to the roadway. The gatehouse stair climbs to the lookout and
 // the garden gate. Three bridge lamps are optional.
 {
  setting:'bridge',goal:'signal',water:760,exit:.6,
  route:'24,560,232,s;344,600,64,s;480,560,96,c,,,0.7;640,496,160,s;800,432,48,s,,,,64;1024,560,300,s;1420,560,120,s;1636,560,240,s;1972,496,200,s;2172,432,48,s,,,,64;2300,560,160,s;2500,560,100,c,,,0.7;2630,560,96,c,,,0.7;2930,560,96,s;3080,656,96,s;3236,716,110,m,30,1;3436,700,96,s;3436,636,96,g;3436,572,96,g;3566,560,240,s;3902,496,180,s;4082,432,48,s,,,,64;4266,496,120,s;4426,432,110,g;4426,368,110,g;4576,320,300,s',
  branches:'1556,656,72,s;1556,608,72,g;3700,700,96,s;4426,304,110,g',memories:[1,2,3],
  stations:[[7,"Quarter lamp"],[19,"Bridge lamp"],[22,"Garden gate lamp"]],
  checkpoints:[3,7,10,13,19,22],sectors:[[0,"The hoist house door"],[1,"The approach arches"],[3,"The toll house"],[5,"Bridge approach"],[8,"The first bridge house"],[10,"Broken middle span"],[14,"Down at the piers"],[19,"The far roadway"],[22,"Garden lookout"]],
  hazards:[spike(6,.8,22),spike(10,.5,22)],
  enemies:[{ledge:8,at:.5,kind:'crawler',travel:60,period:4.2},{ledge:20,at:.5,kind:'crawler',travel:50,period:3.8}],
 },
 // 09 · Water for the Living
 {
  setting:'garden',goal:'engine',
  route:'24,500,300,s;534,500,95,s;659,500,85,c,,,0.56;954,500,100,s;1259,460,125,s;1554,412,300,s;2004,412,340,s;2534,452,155,s;2769,476,90,c,,,0.56;3064,436,155,s;3394,436,300,s;3904,436,95,s;4029,436,90,c,,,0.56;4329,364,160,s;4669,348,340,s;5169,348,280,s;5644,372,90,c,,,0.56;5774,324,105,s;6089,324,100,s;6219,324,95,s;6524,284,300,s;6989,236,350,s',
  branches:'1114,524,84;2751,540,110,s;5859,388,84;2923,580,95,c,,,0.56;3080,532,105,<;3247,500,85,s',memories:[0,3,2],
  stations:[[6,"Garden intake wheel"],[14,"Glasshouse return wheel"]],
  checkpoints:[5,10,15,20],sectors:[[0,"Dry beds"],[5,"Irrigation head"],[10,"Root terrace"],[15,"Glasshouse channel"]],
  hazards:[spike(3,.75,24),steam(4,.75,128,.4,2.7),steam(7,.75,124,.5,2.7,0),spike(9,.28,24),spike(9,.76,24),steam(11,.75,128,1.2,2.6),spike(13,.28,26),spike(13,.75,26),steam(16,.75,124,1.8,2.7,1),spike(18,.28,24),spike(18,.76,24),spike(19,.75,24),spike(26,.8,20)],
 },
 // 10 · A Voice in the Reeds
 {
  setting:'canal',goal:'rescue',
  route:'24,400,300,s;534,400,95,s;659,400,85,c,,,0.56;954,400,100,s;1259,512,125,s;1554,560,300,s;2044,592,90,m,40,1.2;2214,592,150,s;2569,624,110,c,,,0.56;2874,624,155,s;3199,624,340,s;3749,624,95,s;3874,624,90,m,20,1.2;4174,552,165,s;4524,504,110,s;4799,504,300,s;5299,464,90,c,,,0.56;5429,424,110,s;5749,424,100,s;5879,424,95,s;6184,376,300,s;6649,328,350,s',
  branches:'1114,576,84;3519,688,84;5519,488,84',memories:[0,1,2],
  stations:[[10,"Pip"]],
  checkpoints:[5,10,15,20],sectors:[[0,"Reed steps"],[5,"The sunken garden"],[10,"Pip’s hideaway"],[15,"Back to the bank"]],
  hazards:[spike(3,.75,24),spike(7,.27,24),spike(7,.76,24),steam(9,.75,128,1.6,2.7),spike(11,.75,24),spike(13,.28,26),spike(13,.75,26),spike(14,.75,24),steam(17,.75,128,.5,2.6),spike(18,.28,26),spike(18,.75,26),spike(19,.75,24)],
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
