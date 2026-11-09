import {laser,spike,steam,type CampaignRoute} from './campaign-types';

// The Afterglow asks for deliberate takeoffs, braking and timed landings.
// Safe flags and story fixtures remain broad; transit ledges are 40–104px.
// Lower memory paths reconnect with the same encounters, never the whole route.
export const FINAL_ROUTES:readonly CampaignRoute[]=[
 // 33. The City From Above
 // Four exposed gates alternate with short crumble hops, an ice dash, and a two-step ferry brake.
 {setting:'sky',goal:'shelter',
  route:'24,760,240,s;474,760,96,i;600,760,96,s;906,760,72,c,,,0.5;1154,760,84,i;1322,816,72,c,,,0.46;1510,816,280,s;'+
        '1866,760,72,m,30,1.35;2014,704,88,c,,,0.52;2312,704,96,i;2438,704,96,s;2744,704,72,c,,,0.48;2916,704,280,s;3268,648,80,>;'+
        '3424,592,104,s;3640,592,72,m,28,1.4;3922,592,96,i;4048,592,96,c,,,0.5;4354,592,96,s;4562,592,280,s;4918,536,72,m,22,1.4;'+
        '5062,480,104,s;5346,480,72,c,,,0.46;5486,424,64,m,24,1.45;5630,424,48,i;5770,368,340,s',
  branches:'928,856,88,s;1078,920,100,s;1240,928,76,s;1378,876,64,s;2116,768,80,s;5212,544,88,s',memories:[1,4,5],
  stations:[],
  checkpoints:[6,12,19],sectors:[[0,"Old skywalk"],[7,"Cloud ferries"],[13,"The wind stairs"],[20,"Keeper’s eaves"]],
  hazards:[laser(2,0.23,140,0.9,2.6,undefined,0.66),laser(2,0.79,140,0.58,2.6,undefined,0.66),laser(10,0.23,144,1.4,2.7,undefined,0.66),laser(10,0.79,144,1.08,2.7,undefined,0.66),laser(14,0.23,144,0.5,2.5,undefined,0.66),laser(14,0.79,144,0.18,2.5,undefined,0.66),laser(21,0.23,148,1.1,2.6,undefined,0.66),laser(21,0.79,148,0.78,2.6,undefined,0.66),spike(4,.9,18),spike(16,.9,18)],
  wind:30},
 // 34. A Sister in the Tower
 // The ascent alternates belt launches and quick ferry landings; the return reverses gate timing and icy takeoffs.
 {setting:'tower',goal:'rescue',
  route:'24,1360,240,s;474,1360,96,<;600,1360,96,s;906,1360,72,i;1154,1360,80,c,,,0.5;1302,1304,64,m,20,1.3;1450,1248,280,s;'+
        '1810,1192,80,>;1962,1136,72,c,,,0.48;2244,1136,96,i;2370,1136,208,s;2676,1136,104,s;2860,1080,72,c,,,0.5;3012,1024,340,s;'+
        '2868,968,72,i;2688,912,104,s;2548,856,64,c,,,0.46;2242,856,96,<;2116,856,96,m,22,1.4;1606,856,300,s;1454,800,72,>;'+
        '1274,744,104,s;1130,688,72,c,,,0.48;878,632,72,i;758,632,40,m,20,1.45;206,576,360,s',
  branches:'1022,1424,88,s;2048,1200,80,s;996,752,88,s',memories:[0,1,2],
  stations:[[13,"Mira"]],
  checkpoints:[6,13,19],sectors:[[0,"West tower stair"],[7,"Engine shadow"],[14,"The way together"],[20,"Open balcony"]],
  hazards:[laser(2,0.23,140,0.8,2.6,undefined,0.66),laser(2,0.79,140,0.48,2.6,undefined,0.66),laser(11,0.23,144,1.3,2.6,undefined,0.66),laser(11,0.79,144,0.98,2.6,undefined,0.66),laser(15,0.77,144,1.3,2.5,undefined,0.66),laser(15,0.21,144,0.98,2.5,undefined,0.66),laser(21,0.77,148,1.5,2.7,undefined,0.66),laser(21,0.21,148,1.18,2.7,undefined,0.66),spike(7,.86,18),spike(20,.14,18)],
  wind:24},
 // 35. All the Roads We Took
 // The gallery climb uses quick upward hops; its descending half demands braking before narrow ice and crumble landings.
 {setting:'sky',goal:'relay',
  route:'24,872,240,s;474,872,96,i;600,872,96,s;906,872,72,c,,,0.5;1154,872,80,i;1306,816,72,>;1458,760,280,s;'+
        '1814,704,72,m,26,1.35;1962,648,104,s;2138,592,72,c,,,0.5;2390,592,80,i;2680,592,96,m,22,1.4;2806,592,96,c,,,0.46;3112,592,300,s;'+
        '3516,648,80,<;3692,704,64,m,24,1.45;3860,760,104,s;4068,816,72,c,,,0.5;4350,816,96,i;4476,816,96,c,,,0.46;4782,816,280,s;'+
        '5166,872,72,<;5342,928,104,s;5622,928,64,m,24,1.4;5774,984,80,i;5938,1040,40,c,,,0.44;6094,1096,340,s',
  branches:'1022,936,88,s;2256,656,88,s;3596,768,104,s;3776,832,96,s;3948,880,88,s',memories:[0,1,3],
  stations:[[6,"Quarter sky lamp"],[13,"High gallery lamp"],[20,"Homeward sky lamp"]],
  checkpoints:[6,13,20],sectors:[[0,"Quarter replies"],[7,"High lantern gallery"],[14,"The returning light"],[21,"Lower sky arch"]],
  hazards:[laser(2,0.23,140,0.9,2.6,undefined,0.66),laser(2,0.79,140,0.58,2.6,undefined,0.66),laser(8,0.23,144,1.4,2.6,undefined,0.66),laser(8,0.79,144,1.08,2.6,undefined,0.66),laser(16,0.23,144,0.6,2.5,undefined,0.66),laser(16,0.79,144,0.28,2.5,undefined,0.66),laser(22,0.23,148,1.6,2.7,undefined,0.66),laser(22,0.79,148,1.28,2.7,undefined,0.66),spike(5,.86,18),spike(24,.9,18)],
  wind:28},
 // 36. When the Tower Lets Go
 // The fracture chain interleaves timed gates, two successive dash commitments, and short collapsing steps under pursuit.
 {setting:'bridge',goal:'escape',
  route:'24,848,240,s;344,792,72,s;488,736,104,s;668,680,72,i;950,680,96,m,22,1.3;1076,680,96,c,,,0.5;1382,680,300,s;'+
        '1892,680,96,i;2018,680,96,s;2324,680,64,c,,,0.56;2564,680,80,i;2816,680,72,>;2964,624,300,s;3340,568,72,s;'+
        '3484,512,104,s;3664,456,72,i;3946,456,96,m,22,1.4;4072,456,96,c,,,0.52;4378,456,96,i;4586,456,300,s;4962,400,72,>;'+
        '5102,344,80,c,,,0.56;5358,344,64,s;5558,288,104,s;5742,288,40,m,20,1.45;6010,232,360,s',
  branches:'754,744,80,s;2162,800,88,s;2330,808,258,s;2664,744,88,s;5226,408,88,s',memories:[0,2,4],
  stations:[],
  checkpoints:[6,12,19],sectors:[[0,"The first fracture"],[7,"Falling trusses"],[13,"Tethered spans"],[20,"Two on the far side"]],
  hazards:[laser(2,0.23,136,0.6,2.2,undefined,0.65),laser(2,0.79,136,0.28,2.2,undefined,0.65),laser(8,0.23,136,1.2,2.2,undefined,0.65),laser(8,0.79,136,0.88,2.2,undefined,0.65),laser(14,0.23,140,0.4,2.2,undefined,0.65),laser(14,0.79,140,0.08,2.2,undefined,0.65),laser(23,0.23,140,1,2.2,undefined,0.65),laser(23,0.65,140,0.68,2.2,undefined,0.65)],
  wind:28,pressure:134},
 // 37. The Heart, Unlocked
 // Both wheels shut down paired machinery; active pressure gates still bracket belt, crumble, and moving-ice combinations.
 {setting:'factory',goal:'engine',
  route:'24,872,240,s;474,872,96,<;600,872,96,s;906,872,72,i;1158,872,80,s;1342,928,104,s;1558,928,240,s;'+
        '1870,872,64,m,24,1.35;2010,816,240,s;2354,816,104,s;2534,760,72,>;2674,704,72,c,,,0.48;2922,704,80,i;3106,760,240,s;'+
        '3556,760,96,s;3682,760,96,s;3996,760,48,m,22,1.4;4120,704,72,i;4268,648,240,s;4612,648,104,s;4792,592,240,s;'+
        '5242,536,48,i;5314,536,48,c,,,0.5;5576,480,180,s;5818,480,96,s;5944,480,96,c,,,0.44;6250,480,320,s',
  branches:'1024,936,88,s;2790,768,88,s;5412,608,72,s',memories:[0,1,2],
  stations:[[8,"Heart feed wheel"],[18,"Heart return wheel"]],
  checkpoints:[6,13,20],sectors:[[0,"Outer pressure hall"],[7,"Feed wheel chamber"],[14,"The return works"],[21,"Heart chamber"]],
  hazards:[laser(2,0.23,140,0.7,2.6,undefined,0.66),laser(2,0.79,140,0.38,2.6,undefined,0.66),laser(5,0.23,140,1.2,2.6,undefined,0.66),laser(5,0.79,140,0.88,2.6,undefined,0.66),steam(9,0.23,144,0.4,2.6,0,0.66),steam(9,0.79,144,0.08,2.6,0,0.66),steam(15,0.23,144,0.9,2.5,undefined,0.66),steam(15,0.79,144,0.58,2.5,undefined,0.66),laser(19,0.23,144,0.6,2.6,1,0.66),laser(19,0.79,144,0.28,2.6,1,0.66),laser(24,0.23,148,1.4,2.7,undefined,0.66),laser(24,0.79,148,1.08,2.7,undefined,0.66),spike(10,.88,18),spike(23,.88,18)],
  wind:24},
 // 38. Everybody Aboard
 // Cargo shuttles feed a lift-and-gate crossing; the final gangway alternates a long icy leap with short moving steps.
 {setting:'sky',goal:'ferry',
  route:'24,704,240,s;474,704,96,m,24,1.3;600,704,96,s;906,704,96,i;1032,704,96,c,,,0.5;1314,648,104,s;1498,592,300,s;'+
        '1874,536,72,m,24,1.35;2022,480,80,c,,,0.52;2222,480,64,l,22,1.1;2382,480,104,s;2662,480,80,i;2846,536,300,s;3250,592,64,m,24,1.4;'+
        '3524,592,96,i;3650,592,208,s;3956,592,104,s;4240,592,72,i;4488,592,80,c,,,0.5;4672,592,340,s;5100,536,48,m,24,1.4;'+
        '5236,480,104,s;5550,480,96,i;5676,480,96,m,20,1.45;5982,480,80,c,,,0.46;6138,424,400,s',
  branches:'1096,768,88,s;2082,592,88,s;2230,656,104,s;2394,592,76,s;2522,536,72,s;4356,656,88,s',memories:[0,2,5],
  stations:[[19,"Sky dock bell"]],
  checkpoints:[6,12,19],sectors:[[0,"Lower moorings"],[7,"Cargo ferries"],[13,"Last sky dock"],[20,"Homeward gangway"]],
  hazards:[laser(2,0.23,140,0.8,2.6,undefined,0.66),laser(2,0.79,140,0.48,2.6,undefined,0.66),laser(10,0.23,144,1.4,2.7,undefined,0.66),laser(10,0.79,144,1.08,2.7,undefined,0.66),laser(16,0.23,144,0.5,2.6,undefined,0.66),laser(16,0.79,144,0.18,2.6,undefined,0.66),laser(21,0.23,148,1.2,2.6,undefined,0.66),laser(21,0.79,148,0.88,2.6,undefined,0.66),laser(5,.6,138,1,2.6)],
  wind:30},
 // 39. One Last Conversation
 // Double-crumble risers and opposing belts lead to the signal; the return puts moving steps between reversed gates.
 {setting:'tower',goal:'signal',
  route:'24,1488,264,s;498,1488,96,>;624,1488,96,s;930,1488,72,i;1182,1488,80,c,,,0.5;1330,1432,64,c,,,0.46;1470,1376,260,s;'+
        '1806,1320,72,m,24,1.35;1954,1264,104,s;2134,1208,72,i;2416,1208,96,c,,,0.5;2542,1208,96,c,,,0.46;2848,1208,260,s;3184,1152,72,<;'+
        '3336,1096,280,s;3200,1040,64,i;3020,984,104,s;2888,928,64,m,22,1.4;2732,872,80,c,,,0.48;2396,816,260,s;2264,760,64,c,,,0.46;'+
        '1908,704,280,s;1760,648,72,i;1454,648,96,s;1328,648,96,s;858,648,260,s;738,592,40,c,,,0.44;330,536,320,s',
  branches:'1048,1552,88,s;2220,1272,80,s;1666,712,80,s',memories:[0,1,2],
  stations:[[6,"West observatory light"],[14,"Horizon signal"],[21,"Homeward beam"]],
  checkpoints:[6,12,19,25],sectors:[[0,"Observatory approach"],[7,"Horizon gallery"],[15,"The high return stair"],[22,"Highest balcony"]],
  hazards:[laser(2,0.23,140,0.8,2.6,undefined,0.66),laser(2,0.79,140,0.48,2.6,undefined,0.66),laser(8,0.23,144,1.3,2.7,undefined,0.66),laser(8,0.79,144,0.98,2.7,undefined,0.66),laser(16,0.77,144,0.6,2.6,undefined,0.66),laser(16,0.21,144,0.28,2.6,undefined,0.66),laser(24,0.77,148,1.4,2.7,undefined,0.66),laser(24,0.21,148,1.08,2.7,undefined,0.66),spike(13,.12,18)],
  wind:26},
 // 40. What We Leave Alight
 // The last relay combines all four disciplines, ending in a long moving-to-ice landing followed by two short hops home.
 {setting:'sky',goal:'dawn',
  route:'24,816,220,s;454,816,96,i;580,816,96,s;886,816,72,c,,,0.5;1138,816,80,i;1286,760,72,>;1438,704,280,s;'+
        '1798,648,48,m,22,1.35;1930,592,104,s;2110,536,72,i;2358,536,80,c,,,0.5;2648,536,96,s;2774,536,96,c,,,0.46;3080,536,280,s;'+
        '3464,592,72,<;3640,648,104,s;3920,648,64,l,22,1.1;4052,592,72,c,,,0.46;4192,536,72,i;4444,536,80,c,,,0.5;4628,592,280,s;'+
        '5012,648,64,s;5180,704,104,s;5388,760,64,m,22,1.45;5628,816,72,i;5910,816,96,>;6036,816,96,c,,,0.44;6342,816,360,s',
  branches:'1004,880,88,s;2226,600,88,s;4310,600,88,s',memories:[0,1,2],
  stations:[[6,"Quarter dawn relay"],[13,"Garden dawn relay"],[20,"City return relay"]],
  checkpoints:[6,13,20],sectors:[[0,"The roofs remember"],[7,"A garden of replies"],[14,"The city returns"],[21,"A way home"]],
  hazards:[laser(2,0.23,144,0.9,2.6,undefined,0.66),laser(2,0.79,144,0.58,2.6,undefined,0.66),laser(8,0.23,144,1.4,2.6,undefined,0.66),laser(8,0.79,144,1.08,2.6,undefined,0.66),laser(15,0.23,148,0.5,2.5,undefined,0.66),laser(15,0.79,148,0.18,2.5,undefined,0.66),laser(22,0.23,148,1.3,2.6,undefined,0.66),laser(22,0.79,148,0.98,2.6,undefined,0.66),laser(11,.6,140,.8,2.6),spike(5,.88,18)],
  wind:28},
];
