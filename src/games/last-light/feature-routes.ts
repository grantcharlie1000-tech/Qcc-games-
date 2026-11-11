import {spike,spikeAs,steam,laser,press,type CampaignRoute} from './campaign-types';

/** Signature spaces, authored in travel order. These are physical multi-storey
 * routes, not a height offset applied to the old horizontal obstacle pattern. */
export const FEATURE_ROUTES:Readonly<Record<number,CampaignRoute>>={
 // Ada's ferry puts in at the market stairs, the landing at the top of a
 // deep-cut canal quay; the water is a long way down and a miss into it is
 // the end. A wharf crane swings a pallet out over the cut to a warehouse
 // wing; its stack is the step to the tall warehouse, and from its roof a
 // long drop crosses the cut to the first roof of the market.
 // Market roofs over four streets. Every roof is the top of its own building
 // and every street between them is a real drop. An iron fire escape climbs
 // the tenement wall from below the start to its roof (jump up through the
 // landings; Down drops). A chimney stack stands at a gable end as a solid
 // step before each street; party walls between the houses' leads are capped
 // with bottle glass; a rook walks the roofs; a sign gantry, its board
 // painted for the corn merchant, reaches the long tenement, whose balconies
 // cross its front to a last fire escape; the route turns back along its
 // roof to the stair-house door, the way down to the east street.
 // Between the market roofs and the sign gantry is the arcade. Its lantern
 // has lost most of its glass: three cracked panes and one length of iron
 // walk are what is left over the lane, and each pane goes a moment after
 // you land on it. The bakehouse flue vents on the arcade's east flat, a
 // stack is the step before Market Street, where the stalls stand on the
 // cobbles either side of the market hall. A torn length of the hall's
 // ridge cresting lies across its leads, its clock turret is the step over
 // the ridge, and a rook keeps its east flat. Past Market Street the corn
 // loft's sack hoist is the only way up to its roof.
 3:{setting:'roofs',goal:'relay',water:1244,
  route:'24,1124,232,s;296,1048,64,l,52,1.2;440,1004,80,s;520,940,40,s,,,,64;600,924,160,s;840,1124,300,s;1188,1060,120,g;1188,996,120,g;1188,932,120,g;1188,868,120,g;1188,804,120,g;1188,740,120,g;1308,740,340,s;1648,676,48,s,,,,64;1832,772,296,s;2128,708,120,g;2128,644,120,g;2248,644,152,s;2400,580,48,s,,,,64;2656,612,160,s;2816,548,64,s,,,,64;2880,612,136,s;3112,676,136,s;3296,660,72,c,,,0.5,12;3416,660,56,g;3528,660,72,c,,,0.5,12;3664,660,72,c,,,0.5,12;3800,676,112,s;3912,612,48,s,,,,64;4100,708,260,s;4360,644,80,s,,,,64;4440,708,260,s;4820,676,120,s;4956,620,64,l,60,1.2;5036,536,160,s;5316,676,288,s;5484,612,120,g;5756,612,120,g;5924,612,120,g;6068,612,120,g;6068,548,120,g;6068,484,120,g;6068,420,120,g;6068,356,120,g;5756,356,312,s',
  branches:'1188,1124,120,g;2264,580,96,g;5956,292,96,g',memories:[0,1,2],
  stations:[],exit:.25,
  checkpoints:[4,12,14,19,22,29,32,35,39],sectors:[[0,'The market stairs'],[1,'The wharf crane'],[2,'Warehouse roofs'],[5,'The fire escape'],[12,'The rook’s ridge'],[14,'Market roofs'],[19,'Across the street'],[22,'The arcade lantern'],[28,'Market Street'],[29,'The market hall'],[32,'The corn loft'],[36,'The sign gantry'],[37,'The long tenement'],[44,'The east street stair']],
  hazards:[spikeAs('glass',14,.6,22),spikeAs('glass',44,.72,22),steam(27,.5,88,0,2.8),spikeAs('torn',29,.46,30)],
  enemies:[{ledge:12,at:.55,kind:'crawler',travel:80,period:4.2},{ledge:31,at:.55,kind:'crawler',travel:64,period:3.9},{ledge:35,at:.3,kind:'crawler',travel:50,period:3.6}],
 },
 // Launch up the orchard terraces, cross the canopy to the left, then make a
 // controlled descent through the open grates into the lower greenhouse.
 10:{setting:'garden',goal:'relay',
  route:'24,1100,300,s;534,1100,100,s;658,1100,95,b;963,972,130,s;1243,908,280,s;1703,844,100,c,,,0.56;1827,844,95,b;2132,716,120,s;2422,652,280,s;2142,588,100,g;2018,588,100,s;1508,524,300,s;1188,588,140,c,,,0.56;868,652,140,g;528,716,180,s;188,780,140,b;468,652,110,g;768,588,110,c,,,0.56;1078,524,140,b;1408,396,340,s',
  branches:'704,1172,64,s;2262,780,100,s;996,716,100,s',memories:[0,1,2],
  stations:[[4,'Orchard lamp'],[8,'Canopy lamp'],[14,'Glasshouse lamp']],checkpoints:[4,8,11,14],
  sectors:[[0,'Root-level launch'],[4,'The spring canopy'],[8,'Across the treetops'],[11,'Through the greenhouse'],[15,'The final spring']],
  hazards:[spike(3,.75,22),steam(7,.75,96,1,3),spike(10,.25,22),spike(12,.25,22),spike(17,.75,22)],
  enemies:[{ledge:8,at:.78,kind:'crawler',travel:26,period:3.5},{ledge:13,at:.5,kind:'moth',travel:27,period:3.8}],
 },
 // A press floor opens into a lift shaft; the return runs above the machines
 // before falling into a conveyor intake with a visible landing beneath it.
 18:{setting:'factory',goal:'relay',
  route:'24,1064,360,s;574,1000,300,s;1054,944,120,>;1198,944,100,g;1508,880,120,l,24,1.1;1798,816,300,s;2338,816,100,c,,,0.56;2462,816,100,g;2822,752,130,s;3192,688,320,s;2832,624,120,g;2688,624,120,s;2148,560,300,s;1828,624,120,c,,,0.56;1478,688,120,g;1158,624,150,s;828,560,140,>;498,496,320,s;168,432,100,b;448,304,120,g;718,240,160,s;1048,176,360,s',
  branches:'948,1064,100,s;2522,880,100,s;1642,944,84,s',memories:[0,1,2],
  stations:[[5,'Workshop relay'],[12,'Upper feed relay'],[17,'Intake relay']],checkpoints:[1,5,9,12,17],
  sectors:[[0,'The first press'],[2,'Lift shaft'],[9,'Upper pressure walk'],[12,'Over the machines'],[17,'Conveyor intake']],
  hazards:[press(1,.6,.3,3.4),spike(2,.75,22),laser(8,.75,104,.4,3),press(9,.6,1,3.2),spike(11,.75,22),steam(15,.75,96,.8,3),spike(20,.75,22)],
  enemies:[{ledge:5,at:.73,kind:'crawler',travel:26,period:3.5},{ledge:14,at:.5,kind:'moth',travel:24,period:3.4}],
 },
 // Alternating shelves wrap around a frozen hollow: climb, reverse, drop into
 // its middle, then leap back out through the right-hand ice chute.
 26:{setting:'cavern',goal:'signal',
  route:'24,1080,360,s;574,1080,100,i;698,1080,110,g;1018,1016,120,s;1318,952,280,s;1778,888,100,i;1902,888,100,c,,,0.5;2212,824,120,g;2512,760,300,s;2202,696,100,i;2058,696,120,g;1548,632,300,s;1248,696,120,g;948,760,140,i;618,824,180,s;278,760,160,g;588,696,120,s;898,632,140,i;1218,568,100,c,,,0.5;1498,504,120,b;1808,376,140,b;2148,248,340,s',
  branches:'704,1144,100,s;2034,936,64,s;1058,824,100,s',memories:[0,1,2],
  stations:[[4,'Lower lens'],[11,'Hollow lens'],[14,'Return lens']],checkpoints:[4,8,11,15],
  sectors:[[0,'The frozen hollow'],[4,'Ascending shelves'],[8,'Over the crevasse'],[11,'The inside turn'],[15,'Ice chute']],
  hazards:[steam(3,.75,100,.3,2.9),spike(5,.75,22),spike(10,.25,22),steam(13,.75,100,1,2.9),spike(17,.75,22),spike(20,.75,22)],
  enemies:[{ledge:8,at:.73,kind:'crawler',travel:28,period:3.2},{ledge:16,at:.5,kind:'moth',travel:24,period:3.4}],wind:-12,
 },
 // Two towers share an air bridge. The route goes up one, down the inside,
 // then spring-launches onto the other instead of repeating a flat sky run.
 34:{setting:'sky',goal:'relay',
  route:'24,1100,320,s;534,1100,96,i;830,1036,96,g;950,1036,100,l,18,1.15;1260,972,260,s;1690,908,80,c,,,0.5;1980,844,96,g;2100,844,110,b;2420,716,300,s;2100,652,96,g;1810,588,110,i;1676,588,110,s;1186,524,280,s;886,556,110,c,,,0.5;576,620,120,g;246,684,160,b;526,556,100,g;826,492,110,i;1136,428,96,c,,,0.5;1412,364,110,g;1712,300,130,s;2042,236,340,s',
  branches:'970,1138,64,b;1590,972,100,s;1902,364,100,s',memories:[0,1,2],
  stations:[[4,'South tower lamp'],[12,'Air bridge lamp'],[8,'North tower lamp']],checkpoints:[4,8,12,16],
  sectors:[[0,'The south tower'],[4,'The outside ascent'],[8,'Air bridge'],[11,'Inside the tower'],[15,'North tower launch']],
  hazards:[spike(1,.75,22),laser(6,.75,108,.6,3),spike(10,.75,22),steam(13,.75,108,1,3),spike(17,.75,22),spike(20,.75,22)],
  enemies:[{ledge:8,at:.75,kind:'crawler',travel:24,period:3.2},{ledge:12,at:.8,kind:'moth',travel:20,period:3}],wind:24,
 },
};

/** Other chapters receive distinct encounters at explicitly chosen quiet ledges.
 * Enemy sweeps never cover flags, conversations, cats or the exit. */
export const ENCOUNTER_ADDITIONS:Readonly<Record<number,{enemies?:CampaignRoute['enemies'];presses?:CampaignRoute['hazards']}>>={
 6:{presses:[press(2,.5,.4,3.6),press(6,.2,1.1,3.4),press(20,.3,.2,3.2)]},
 12:{enemies:[{ledge:15,at:.72,kind:'moth',travel:26,period:3.7}]},
 14:{presses:[press(5,.73,.5,3.4)]},
 16:{presses:[press(11,.72,.5,3.2)]},
 20:{enemies:[{ledge:17,at:.73,kind:'crawler',travel:28,period:3.4}]},
 23:{enemies:[{ledge:17,at:.72,kind:'moth',travel:24,period:3.2}]},
 24:{enemies:[{ledge:11,at:.75,kind:'crawler',travel:26,period:3.2}]},
 29:{enemies:[{ledge:17,at:.73,kind:'moth',travel:26,period:3.4}]},
 32:{enemies:[{ledge:19,at:.73,kind:'crawler',travel:28,period:3}]},
 36:{presses:[press(13,.73,.7,3)]},
};
