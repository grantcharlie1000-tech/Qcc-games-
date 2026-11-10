import {spike,steam,type CampaignRoute} from './campaign-types';

/** The Quarter teaches a movement language; Mossworks combines it into journeys.
 * Each route has authored encounter and rest beats, with every task on the road. */
export const OPENING_ROUTES:readonly CampaignRoute[]=[
 // 01 · The Window Left Open
 // One terrace to Nell’s door. Alleys teach the run-up jump over lean-tos and a
 // back yard; a dormer eave then rewards a short hop (a full jump clips its
 // edge and drops you into the yard, which only climbs back toward roof 5).
 // The first tooth and the only lethal drops wait across the street.
 {
  setting:'roofs',goal:'shelter',
  route:'24,440,300,s;372,440,180,s;616,440,200,s;912,440,160,s;1184,408,180,s;1484,408,140,s;1720,408,200,s;1992,344,300,s;2420,344,96,s;2628,344,200,s;2892,344,340,s',
  branches:'300,500,140,s;520,500,140,s;828,488,72,s;912,500,452,s;1364,468,60,s;1424,500,496,s;1688,321,172,e;1920,452,160,s',memories:[1,2,6],
  stations:[],
  checkpoints:[2,5,7,10],sectors:[[0,"Our roof"],[2,"Washing lines"],[5,"Low eaves"],[7,"The street"],[10,"Nell’s window"]],
  hazards:[spike(7,.5,22),spike(9,.72,22),spike(9,.89,22)],
 },
 // 02 · A Bell Above the Rain
 // The inside of the bell tower, climbed floor by floor. Each floor is oak
 // let into the walls; the stair between floors has lost most of its treads
 // (open treads: jump up through them, Down drops). Ropes and clock weights
 // hang down one open well through every floor into the flooded pit, so a
 // miss on a stair costs a flight and a miss over the well costs the run.
 // The clock room's broken floor is the first dash; frame beams cross the
 // well under the bells to Ivo's landing, and the gallery door is above.
 {
  setting:'tower',goal:'rescue',
  route:'24,1400,240,s;120,1340,56,g;40,1280,56,g;184,1224,80,s;384,1224,160,s;472,1164,56,g;552,1104,56,g;384,1048,80,s;24,1048,240,s;96,988,80,g;24,928,64,g;168,872,96,s;456,872,168,s;512,812,56,g;568,752,56,g;384,696,96,s;24,696,240,s;120,636,56,g;40,576,56,g;184,520,80,s;300,488,48,g;400,456,48,g;496,424,128,s;400,364,56,g;464,304,160,s',
  branches:'384,1400,240,s;480,1340,56,g;568,1280,56,g;104,812,56,g;400,244,56,g',memories:[2,3,4],
  stations:[[22,"Ivo"]],
  checkpoints:[4,8,11,16,22],sectors:[[0,"Bell stair"],[4,"The ringing floor"],[8,"The clock room"],[12,"Under the bells"],[22,"Ivo’s landing"]],
  hazards:[],water:1500,
 },
 // 03 · The Last Ferry
 // One canal, travelled along its near quay. Everything stood on is a quay
 // built down into the water, a cluster of mooring piles, a timber staging
 // or a boat; the water under all of it is lethal. A barge tied off the
 // first quay shows riding. Mooring piles ask for braking, the staging end
 // is the first lethal dash (onto a moored lighter), two barges out of
 // phase ask for a timed dash, a bolt stands on one pile cap, and a raft on
 // a chain crosses a basin; a fast barge, a second bolt and a dash onto the
 // coal lighter lead to Ada's quay. A stepped footbridge over the last side
 // canal comes down, 56 px a landing, to the ferry stage at the waterline.
 {
  setting:'canal',goal:'ferry',
  route:'24,512,300,s;356,538,112,m,20,.9;500,512,240,s;808,528,56,s;932,524,56,s;1068,538,100,m,28,1;1260,512,260,s;1580,528,120,s;1896,538,120,s;2080,528,56,s;2204,512,220,s;2496,538,100,m,20,1.1;2800,538,110,m,16,1.3;2992,528,96,s;3152,512,200,s;3424,528,56,s;3548,524,56,s;3700,538,120,m,48,.8;3948,528,56,s;4088,538,96,m,36,1.4;4340,528,96,s;4500,524,48,s;4720,538,120,s;4904,512,200,s;5104,448,72,s;5176,384,160,s;5336,440,72,s;5408,496,72,s;5496,552,180,s',
  branches:'752,540,48,s;2024,540,48,s;3628,468,44,g',memories:[0,1,2],
  stations:[],
  checkpoints:[2,6,10,14,20,23],sectors:[[0,"Stone quay"],[2,"Mooring piles"],[6,"The staging"],[10,"Two barges"],[14,"The chain raft"],[20,"The coal lighter"],[23,"Ada’s crossing"]],
  hazards:[spike(13,.78,22),spike(20,.8,22)],
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
 {
  setting:'roofs',goal:'escape',
  route:'24,620,300,s;324,620,104,c,,,0.9;428,620,180,s;636,620,100,c,,,0.7;766,620,96,c,,,0.7;892,588,170,s;1062,524,48,s,,,,64;1190,572,100,c,,,0.6;1340,572,150,s;1560,668,216,s;1776,604,120,g;1776,540,120,g;1896,540,140,s;2064,540,96,c,,,0.6;2190,540,96,c,,,0.6;2316,508,96,c,,,0.6;2452,476,160,s;2612,412,48,s,,,,64;2860,476,100,c,,,0.55;2990,476,140,s;3160,476,96,c,,,0.55;3290,444,96,c,,,0.55;3430,412,360,s',
  branches:'468,556,96,g;1776,668,120,g;3020,412,80,g',memories:[0,1,2],
  stations:[],exit:.72,
  checkpoints:[2,5,9,16,22],sectors:[[0,"The first crack"],[2,"Falling tiles"],[5,"The shored alley"],[9,"The tall house"],[16,"The lane"],[22,"Tomas’s chimney"]],
  hazards:[spike(12,.45,22),spike(19,.5,22)],
  pressure:88,
 },
 // 06 · Under the Sleeping City
 // The service culvert under the street: one brick vault, flooded, and the
 // water is lethal. Brick benches rise out of it, lengths of iron main turn
 // down into it, gratings hang from the vault. Steam leaves joints on the
 // mains: one to watch, one at the far end of a landing, a pair out of
 // phase past the stopped pumps, one in the lower duct under a grating. A
 // broken flange, a dash to a venting main and a ladder of gratings lead up
 // the shaft to the street stairwell. Three wall lamps are optional.
 {
  setting:'cavern',goal:'signal',water:700,
  route:'24,660,260,s;340,632,240,s;640,632,150,s;860,660,200,s;1116,604,96,g;1260,548,96,g;1420,548,180,s;1670,580,120,s;1850,612,120,g;1850,676,300,s;2230,660,180,s;2480,620,110,s;2670,572,100,s;2860,540,96,g;3156,540,160,s;3400,596,200,s;3640,548,110,g;3640,484,110,g;3640,420,110,g;3800,372,300,s',
  branches:'348,568,80,g;2010,612,100,g;3640,356,110,g',memories:[0,1,2],
  stations:[[3,"Culvert lamp"],[10,"Duct lamp"],[15,"Shaft lamp"]],
  checkpoints:[3,10,15,19],sectors:[[0,"The water main"],[3,"Sleeping pumps"],[8,"The lower duct"],[10,"The broken flange"],[15,"Street foundations"]],
  hazards:[steam(1,.5,96,0,3.2),steam(2,.8,96,.8,3),steam(6,.5,96,0,3),steam(7,.5,96,1.5,3),steam(9,.7,80,.4,3),spike(12,.8,22),steam(14,.75,96,1,3)],
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
  route:'24,1500,208,s;242,1400,100,l,100,1.745;352,1300,240,s;712,1300,176,s;760,1236,128,g;760,1172,128,g;352,1140,240,s;242,1040,100,l,100,1.745;24,940,208,s;72,876,128,g;72,812,128,g;352,780,240,s;602,700,100,l,80,1.745;712,620,176,s;760,556,128,g;760,492,128,g;352,460,240,s',
  branches:'24,1300,208,s;24,1140,208,s;352,620,240,s',memories:[0,1,2],
  stations:[[6,"Lower brake wheel"],[11,"Upper brake wheel"]],
  checkpoints:[2,3,6,8,11,13],sectors:[[0,"The lift pit"],[2,"Counterweight walk"],[4,"The ladder"],[6,"The brake room"],[8,"The west landing"],[11,"The machine room"],[13,"Under the winding gear"],[16,"The lift crown"]],
  hazards:[steam(13,.5,96,.4,2.8,0),steam(16,.8,96,0,3,1)],
 },
 // 08 · The Quarter’s Reply
 // A bridge between two built banks with its middle span fallen: a test of
 // the district with no new verb. Railing stubs sit behind the first
 // landing, a crawler walks the bank deck, two cracked planks hang before a
 // 200 px dash to the far pier, the bridge house asks for a short hop under
 // its eave, and iron landings climb the garden lookout. No bridge steam.
 {
  setting:'bridge',goal:'signal',
  route:'24,520,300,s;444,520,120,s;660,520,240,s;996,480,300,s;1392,480,180,s;1668,480,100,c,,,0.7;1798,480,95,c,,,0.7;2093,480,240,s;2413,416,120,s;2645,400,240,s;3021,400,240,s;3325,336,120,g;3325,272,120,g;3509,208,300,s',
  branches:'340,580,80,s;2597,329,128,e;3825,144,60,s',memories:[0,1,2],
  stations:[[2,"Quarter light"],[7,"Bridge light"],[10,"Garden gate light"]],
  checkpoints:[3,4,8,13],sectors:[[0,"Bridge approach"],[3,"The bank"],[4,"Broken middle span"],[8,"The bridge house"],[13,"Garden lookout"]],
  hazards:[spike(1,.86,22)],
  enemies:[{ledge:3,at:.6,kind:'crawler',travel:80,period:4.4}],
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
