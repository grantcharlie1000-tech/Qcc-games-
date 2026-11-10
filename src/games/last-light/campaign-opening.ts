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
 // One bell tower, climbed as switchbacks. Every miss falls one flight onto
 // stairs already climbed (the tower floor catches the first). The bell
 // frame's head beam repeats the eave rule, the broken flight is the first
 // dash over a landing below, and Ivo waits on the landing under the belfry.
 {
  setting:'tower',goal:'rescue',
  route:'24,1240,280,s;368,1200,120,s;560,1160,120,s;760,1120,120,s;952,1080,160,s;1176,1016,120,s;1000,952,120,s;784,952,120,s;576,952,120,s;384,952,96,s;200,888,96,s;360,824,96,s;640,824,120,s;824,784,120,s;1008,744,120,s;1192,680,120,s;1016,616,120,s;696,616,120,s;464,576,120,s;272,576,96,s;88,512,120,s;272,448,240,s;576,408,300,s',
  branches:'0,1300,1340,s;840,865,96,e;1376,744,64,s;24,448,64,s',memories:[0,2,3],
  stations:[[21,"Ivo"]],
  checkpoints:[6,11,16,21],sectors:[[0,"Bell stair"],[6,"The bell frame"],[11,"The broken flight"],[16,"Alternate sides"],[21,"Ivo’s landing"]],
  hazards:[],
 },
 // 03 · The Last Ferry
 // A stone quay along the canal. Barges drift on their mooring ropes; two
 // low timber footbridges ask for a short hop from a narrow deck (a full
 // jump clips the bridge and drops into the water). The first lethal dash
 // leaves a moored barge for a fender, the tow path behind it the retry.
 // Bolts stand only on pile tops. Ada's deck holds the optional bell.
 {
  setting:'canal',goal:'ferry',
  route:'24,436,300,s;356,436,112,m,20,.9;500,436,240,s;836,436,100,m,16,1;1060,436,96,s;1220,396,240,s;1492,396,100,m,20,1.1;1784,396,80,s;1992,396,96,m,16,1.2;2120,364,96,m,16,1.2;2424,364,120,s;2608,364,96,s;2768,364,96,s;2928,364,320,s;3280,364,150,s;3462,364,150,s;3644,364,220,s',
  branches:'1012,349,172,e;1928,309,140,e;3348,340,60,s',memories:[0,1,2],
  stations:[[13,"Departure bell"]],
  checkpoints:[2,5,7,13],sectors:[[0,"Stone quay"],[2,"Mooring ropes"],[5,"The tow path"],[7,"Two barges"],[13,"Ada’s crossing"]],
  hazards:[spike(11,.5,22),spike(12,.62,22)],
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
 // One long failing roof over a lane, with the dark behind. Cracked slate
 // drops after a dust tell and returns 2.5 s later. The first tiles sit over
 // a lower roof you can walk back along; past it, dormer eaves ask for a
 // short hop onto a cracked tile, the last pair hangs over the lane, and a
 // chimney stack leads to Tomas's roof. Teeth stand only at a roof edge.
 {
  setting:'roofs',goal:'escape',
  route:'24,460,300,s;388,460,100,c;552,460,140,s;722,460,100,c,,,0.7;852,460,95,c,,,0.7;977,460,150,s;1255,460,100,c,,,0.7;1451,420,120,s;1699,420,100,c,,,0.7;1829,420,95,c,,,0.7;2004,356,120,s;2260,356,200,s;2556,356,340,s',
  branches:'0,520,1040,s;1191,373,88,e;1635,333,214,e',memories:[0,1,2],
  stations:[],
  checkpoints:[2,5,7,12],sectors:[[0,"The first crack"],[2,"Falling tiles"],[5,"Dormer eaves"],[7,"The lane"],[12,"Tomas’s chimney"]],
  hazards:[spike(10,.86,22),spike(11,.9,22)],
  pressure:88,
 },
 // 06 · Under the Sleeping City
 {
  setting:'cavern',goal:'signal',
  route:'24,400,300,s;534,400,100,s;664,400,100,s;974,400,100,s;1274,488,145,s;1579,536,300,s;2069,568,100,c,,,0.62;2249,592,160,c,,,0.62;2599,552,125,s;2919,552,150,s;3229,504,300,s;3739,504,100,s;3869,504,100,c,,,0.62;4179,432,165,s;4524,416,140,s;4829,376,300,s;5324,328,115,s;5519,328,125,s;5844,328,165,s;6199,288,140,s;6509,240,340,s',
  branches:'1127,552,94;3509,568,94;5697,392,94',memories:[0,1,2],
  stations:[[5,"Pump passage signal"],[10,"Return stair signal"],[15,"Street signal"]],
  checkpoints:[5,10,15],sectors:[[0,"The water pipe"],[5,"Sleeping pumps"],[10,"The return stair"],[15,"Street foundations"]],
  hazards:[spike(2,.75,26),steam(3,.72,120,.5,2.7),spike(4,.75,24),spike(7,.28,26),spike(7,.75,26),steam(9,.72,120,.6,2.6),spike(13,.28,26),spike(13,.75,26),steam(16,.75,120,1.4,2.8),spike(18,.28,26),spike(18,.75,26),spike(19,.75,24)],
 },
 // 07 · The Counterweight
 {
  setting:'tower',goal:'engine',
  route:'24,650,300,s;534,650,100,s;664,650,100,s;974,634,100,s;1274,562,140,s;1579,514,300,s;2029,514,320,s;2534,474,145,s;2759,498,100,c,,,0.62;3059,450,165,s;3394,450,300,s;3904,450,100,s;4034,450,100,s;4344,378,165,s;4679,362,320,s;5154,322,260,s;5604,346,105,c,,,0.62;5789,298,125,c,,,0.62;6114,298,165,s;6464,298,300,s;6934,250,145,s;7239,210,340,s',
  branches:'1127,626,94;3674,514,94;5967,362,94',memories:[0,1,2],
  stations:[[6,"Intake wheel"],[14,"Return wheel"]],
  checkpoints:[5,10,15,19],sectors:[[0,"Weight room stair"],[5,"The intake wheel"],[10,"Counterweight walk"],[15,"The lift crown"]],
  hazards:[spike(2,.28,24),spike(2,.75,24),steam(3,.74,120,.4,2.7),spike(4,.75,24),steam(7,.72,124,.6,2.7,0),spike(9,.28,26),spike(9,.75,26),steam(12,.75,124,1.4,2.6),spike(13,.28,26),spike(13,.75,26),steam(16,.75,124,1.8,2.7,1),spike(18,.28,26),spike(18,.75,26),spike(20,.75,26)],
 },
 // 08 · The Quarter’s Reply
 {
  setting:'bridge',goal:'signal',
  route:'24,520,300,s;534,520,100,s;664,520,100,s;974,512,100,s;1279,440,140,s;1584,392,300,s;2079,416,100,c,,,0.62;2259,392,100,c,,,0.62;2559,352,165,s;2909,352,130,s;3209,304,300,s;3719,304,100,s;3849,304,100,s;4159,304,175,s;4519,296,130,s;4814,296,300,s;5314,256,100,c,,,0.62;5494,256,145,s;5844,256,165,s;6199,216,145,s;6519,216,300,s;6984,168,350,s',
  branches:'1130,504,94;3489,368,94;5694,320,94',memories:[0,1,2],
  stations:[[5,"Quarter light"],[10,"Bridge light"],[15,"Garden gate light"]],
  checkpoints:[5,10,15,20],sectors:[[0,"Bridge approach"],[5,"Broken middle span"],[10,"Signal houses"],[15,"Garden lookout"]],
  hazards:[spike(2,.28,24),spike(2,.75,24),steam(3,.74,120,.8,2.7),spike(4,.76,24),spike(8,.28,26),spike(8,.75,26),spike(9,.75,24),steam(12,.75,124,1.2,2.7),spike(13,.28,26),spike(13,.75,26),spike(14,.75,24),steam(17,.75,124,.4,2.6),spike(18,.28,26),spike(18,.75,26),spike(19,.75,24)],
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
