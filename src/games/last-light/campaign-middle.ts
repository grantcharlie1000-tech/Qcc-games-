import {laser,saw,spike,steam,type CampaignRoute} from './campaign-types';

/** Chapters 17–32: pressure circuits, freight crossings, and the northern lens.
 * Coordinates are authored in travel order. Lower memory shelves provide an
 * optional stepping route across three marked dash gaps in each chapter. */
export const MIDDLE_ROUTES:readonly CampaignRoute[]=[
 // 17. First Shift, Last Shift — 7012px; 22 main ledges.
 {
  setting:'factory',goal:'engine',
  route:'24,500,300,s;398,500,220,>;692,500,300,s;1066,452,160,c;1300,452,200,s;1660,452,280,s;2014,404,200,>;2288,404,260,s;2622,404,300,s;2996,404,160,m,30,0.9;3230,404,200,s;3590,404,280,s;3944,456,200,<;4218,456,180,s;4472,456,260,s;4806,456,300,s;5180,456,160,c;5500,456,280,s;5854,400,200,s;6128,400,220,>;6422,400,200,s;6696,400,340,s',
  branches:'1520,502,110,s;3180,516,230,s;3450,454,110,s;5360,506,110,s',memories:[0,1,3],
  stations:[[7,"Boiler intake wheel"],[14,"Fan return wheel"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Boiler approach"],[6,"Pressure gallery"],[12,"Fan return"],[18,"Service gantry"]],
  hazards:[steam(2,.5,106,.35,3.4),spike(4,.52,28),steam(8,.5,106,1.5,3.4,0),saw(10,.55,24,.7,3.2),spike(13,.5,26),laser(15,.5,110,.8,3.6,1),saw(18,.52,24,1.8,3),spike(20,.55,28)],
 },
 // 18. The Clock Without Hands — 6892px; 22 main ledges.
 {
  setting:'tower',goal:'relay',
  route:'24,700,300,s;398,700,200,s;758,700,300,s;1132,700,160,m,28,0.9;1366,648,200,s;1640,596,280,s;1994,596,200,s;2268,544,220,s;2562,544,160,l,26,0.8;2796,544,300,s;3170,492,200,s;3444,492,280,s;3798,440,200,s;4158,440,180,c;4412,388,200,s;4686,388,300,s;5060,388,160,s;5380,388,280,s;5734,336,220,s;6028,336,200,>;6302,284,200,s;6576,284,340,s',
  branches:'618,750,110,s;4018,490,110,s;5240,438,110,s',memories:[0,1,2],
  stations:[[5,"Pendulum lamp"],[11,"Hour-wheel lamp"],[17,"Clock-face lamp"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Silent pendulum"],[6,"Hour-wheel ascent"],[12,"Empty dial"],[18,"Clock-face balcony"]],
  hazards:[steam(2,.5,104,.7,3.2),spike(4,.5,26),saw(7,.55,28,.4,3.2),laser(9,.5,110,1.6,3.6),spike(14,.5,28),steam(15,.5,104,.8,3.2),saw(18,.5,26,2,3.4),spike(20,.5,28)],
 },
 // 19. Someone on the Night Shift — 6952px; 22 main ledges.
 {
  setting:'factory',goal:'rescue',
  route:'24,400,300,s;398,400,200,<;672,400,300,s;1046,448,170,m,28,1;1290,448,200,s;1650,448,280,s;2004,500,220,<;2298,500,200,c;2572,500,300,s;2946,552,160,>;3180,552,200,s;3540,552,300,s;3914,552,200,>;4188,500,180,s;4442,500,220,s;4736,500,300,s;5110,500,170,>;5440,500,280,s;5794,448,220,s;6088,448,200,c;6362,448,200,s;6636,448,340,s',
  branches:'1510,498,110,s;3400,602,110,s;5300,550,110,s',memories:[0,1,2],
  stations:[[11,"Night worker · packing room"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Empty clock-in hall"],[6,"Night packing room"],[12,"Return conveyors"],[18,"Loading bay"]],
  hazards:[steam(2,.5,106,.4,3.2),spike(4,.5,28),steam(8,.5,108,1.8,3.4),saw(10,.5,24,1,3.1),spike(13,.5,26),laser(15,.5,110,.6,3.6),saw(18,.55,28,1.7,3.2),spike(20,.5,28)],
 },
 // 20. Teeth of the City — 6892px; 22 main ledges.
 {
  setting:'bridge',goal:'escape',
  route:'24,480,320,s;418,480,200,>;692,480,300,s;1066,424,160,c;1300,424,180,c;1640,424,280,s;1994,424,200,>;2268,424,160,c;2502,424,300,s;2876,480,200,<;3150,480,200,s;3510,480,280,s;3864,480,220,c;4158,480,180,c;4412,480,200,>;4686,424,300,s;5060,424,160,c;5380,424,280,s;5734,368,220,>;6028,368,200,c;6302,368,200,s;6576,368,340,s',
  branches:'1236,544,110,s;1360,544,140,s;1530,484,80,s;3370,530,110,s;5240,474,110,s',memories:[1,3,4],
  stations:[],
  checkpoints:[5,11,17],
  sectors:[[0,"Conveyor mouth"],[6,"Broken teeth"],[12,"Steam crossing"],[18,"Far abutment"]],
  hazards:[steam(2,.5,106,.8,3.2),spike(4,.52,26),steam(8,.5,108,1.7,3.4),saw(10,.5,24,.7,3),spike(13,.5,28),steam(15,.5,108,.4,3.2),saw(18,.5,24,1.4,3.1),spike(20,.52,28)],
  pressure:104,
 },
 // 21. The Unwinding — 7190px; 23 main ledges.
 {
  setting:'factory',goal:'engine',
  route:'24,620,300,s;394,620,200,>;664,620,300,s;1034,568,160,c;1264,568,180,s;1604,568,280,s;1954,516,200,<;2224,516,240,s;2534,516,300,s;2904,516,160,m,32,1.05;3134,464,200,s;3494,464,280,s;3844,464,200,>;4114,412,300,s;4484,412,160,c;4714,412,240,s;5024,412,300,s;5394,412,280,s;5744,360,160,<;5974,360,220,s;6264,360,180,s;6604,360,200,s;6874,360,340,s',
  branches:'1464,618,110,s;3354,514,110,s;6464,410,110,s',memories:[0,1,2],
  stations:[[7,"Engine feed wheel"],[15,"Upper return wheel"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Feed floor"],[6,"Light intake"],[12,"Reversing chamber"],[18,"Upper hatch"]],
  hazards:[steam(2,.5,106,.5,3.2),spike(4,.5,26),laser(8,.5,110,1.8,3.6,0),saw(10,.55,26,.8,3.2),steam(13,.5,106,1.2,3.3),steam(16,.5,108,.4,3.5,1),saw(19,.5,28,1.6,3.2),spike(21,.52,28)],
 },
 // 22. Cargo for the Morning — 6992px; 22 main ledges.
 {
  setting:'canal',goal:'ferry',
  route:'24,400,300,s;398,400,200,<;672,400,300,s;1046,448,160,m,32,0.9;1280,448,200,s;1640,448,280,s;1994,448,200,m,36,1.05;2268,448,200,<;2542,448,300,s;2916,400,180,s;3170,400,200,s;3530,400,280,s;3884,448,220,m,32,1.1;4178,448,180,>;4432,448,200,s;4706,448,300,s;5080,400,260,s;5414,400,280,s;5854,400,220,s;6148,352,180,m,28,0.95;6402,352,200,s;6676,352,340,s',
  branches:'1500,498,110,s;3390,450,110,s;5714,450,110,s',memories:[0,1,2],
  stations:[[16,"Freight departure bell"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Freight approach"],[6,"Warm-pipe crossing"],[12,"Bell wharf"],[18,"Ada’s barge"]],
  hazards:[steam(2,.5,104,.5,3.2),spike(4,.5,26),steam(8,.5,106,1.6,3.4),saw(10,.5,24,.8,3.2),spike(14,.55,28),laser(15,.5,110,.3,3.4),saw(18,.5,26,1.4,3.1),spike(20,.5,26)],
 },
 // 23. A Signal Through Steel — 7126px; 23 main ledges.
 {
  setting:'tower',goal:'signal',
  route:'24,760,300,s;398,760,220,c;778,760,300,s;1152,708,160,s;1386,656,180,s;1640,656,280,s;1994,604,220,>;2288,604,200,s;2562,552,160,l,26,0.85;2796,552,300,s;3170,552,200,s;3530,552,280,s;3884,500,220,s;4178,448,160,s;4412,448,200,c;4686,448,300,s;5060,396,180,s;5314,396,280,s;5668,344,220,s;6048,344,180,m,30,1.05;6302,292,200,s;6576,240,160,s;6810,188,340,s',
  branches:'638,810,110,s;3390,602,110,s;5908,394,110,s',memories:[0,1,2],
  stations:[[5,"Foundry signal"],[11,"Radio-room signal"],[17,"Antenna signal"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Foundry mast"],[6,"Radio-room stairs"],[12,"Aerial supports"],[18,"High antenna"]],
  hazards:[steam(2,.5,106,.4,3.3),spike(4,.5,26),saw(7,.5,24,1.1,3.2),laser(9,.5,110,1.7,3.5),spike(13,.5,24),laser(15,.5,110,.8,3.6),saw(18,.5,26,1.6,3.3),spike(20,.5,28)],
 },
 // 24. Let the Machines Dream — 6932px; 22 main ledges.
 {
  setting:'factory',goal:'relay',
  route:'24,400,320,s;418,400,200,>;692,400,300,s;1066,348,160,m,28,0.95;1300,348,200,s;1660,348,280,s;2014,348,220,<;2308,348,200,s;2582,348,160,c;2816,400,300,s;3190,400,200,s;3550,400,280,s;3904,452,220,>;4198,452,180,s;4452,452,200,c;4726,504,300,s;5100,504,160,<;5420,504,280,s;5774,556,220,s;6068,556,200,m,32,1.1;6342,556,200,s;6616,556,340,s',
  branches:'1520,398,110,s;3410,450,110,s;5280,554,110,s',memories:[0,1,2],
  stations:[[5,"Assembly safety light"],[11,"Inspection safety light"],[17,"Maintenance safety light"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Assembly hall"],[6,"Inspection crossing"],[12,"Quiet machines"],[18,"Maintenance arch"]],
  hazards:[steam(2,.5,106,.6,3.4),spike(4,.5,26),saw(7,.5,26,.8,3.1),laser(9,.5,110,1.8,3.6),spike(13,.5,26),steam(15,.5,108,.5,3.3),saw(18,.5,28,1.4,3.2),spike(20,.5,28)],
 },
 // 25. Footprints in the White — 6972px; 22 main ledges.
 {
  setting:'bridge',goal:'rescue',
  route:'24,500,300,s;398,500,220,i;692,500,300,s;1066,452,170,i;1310,452,200,s;1670,452,280,s;2024,404,220,i;2318,404,200,c;2592,404,300,s;2966,452,160,i;3200,452,200,s;3560,452,300,s;3934,452,220,i;4228,404,180,s;4482,404,200,i;4756,404,300,s;5130,404,170,c;5460,404,280,s;5814,352,220,s;6108,352,200,i;6382,352,200,s;6656,352,340,s',
  branches:'1530,502,110,s;2912,540,180,s;3132,580,224,s;3420,512,110,s;5320,454,110,s',memories:[0,2,4],
  stations:[[11,"Edda · broken ice bridge"]],
  checkpoints:[5,11,17],
  sectors:[[0,"First footprints"],[6,"Ice-bridge shelter"],[12,"Two sets of tracks"],[18,"Sheltered ridge"]],
  hazards:[laser(2,.5,110,.5,3.6),spike(4,.5,26),laser(8,.5,110,1.8,3.7),saw(10,.5,24,.6,3.2),spike(13,.5,26),steam(15,.5,104,.8,3.3),saw(18,.5,26,1.5,3.3),spike(20,.5,28)],
  wind:20,
 },
 // 26. The Frozen Intake — 7022px; 22 main ledges.
 {
  setting:'cavern',goal:'engine',
  route:'24,400,300,s;398,400,220,i;692,400,300,s;1066,452,160,i;1300,452,200,s;1660,452,280,s;2014,504,200,i;2288,504,260,s;2622,504,300,s;2996,556,170,l,28,0.8;3240,556,200,s;3600,556,280,s;3954,504,200,i;4228,504,180,s;4482,504,260,s;4816,504,300,s;5190,504,160,c;5510,504,280,s;5864,452,220,s;6158,452,200,i;6432,452,200,s;6706,452,340,s',
  branches:'1520,502,110,s;3460,606,110,s;5370,554,110,s',memories:[0,1,2],
  stations:[[7,"Frozen intake wheel"],[14,"Thaw return wheel"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Frozen mouth"],[6,"Intake chamber"],[12,"Thaw gallery"],[18,"Cavern shelter"]],
  hazards:[laser(2,.5,110,.7,3.5),spike(4,.5,26),steam(8,.5,108,1.8,3.4,0),saw(10,.5,26,.8,3.2),spike(13,.5,28),laser(15,.5,110,.4,3.6,1),saw(18,.5,28,1.3,3.3),spike(20,.5,28)],
  wind:0,
 },
 // 27. The Aurora Bells — 7126px; 23 main ledges.
 {
  setting:'tower',goal:'signal',
  route:'24,720,300,s;398,720,200,i;672,720,300,s;1046,668,160,c;1280,668,200,s;1640,668,280,s;1994,616,200,i;2268,616,220,s;2562,616,160,m,28,1;2796,564,300,s;3170,564,200,s;3530,564,280,s;3884,512,220,s;4178,512,160,i;4412,460,200,s;4686,460,300,s;5060,460,180,i;5314,460,280,s;5668,408,220,s;5962,408,180,c;6216,356,200,s;6576,356,160,i;6810,304,340,s',
  branches:'1500,718,110,s;3390,614,110,s;6436,406,110,s',memories:[0,1,2],
  stations:[[5,"Lower ridge signal"],[11,"Eastern balcony signal"],[17,"Bell-tower signal"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Cloth-wrapped bells"],[6,"Eastern balcony"],[12,"Aurora gallery"],[18,"Bell crown"]],
  hazards:[laser(2,.5,110,.6,3.5),spike(4,.5,28),saw(7,.5,26,.7,3.3),steam(9,.5,106,1.7,3.4),spike(12,.5,28),laser(15,.5,110,.4,3.7),saw(18,.5,28,1.4,3.2),spike(20,.5,28)],
  wind:22,
 },
 // 28. The Whiteout — 6922px; 22 main ledges.
 {
  setting:'bridge',goal:'escape',
  route:'24,500,320,s;418,500,220,i;712,500,300,s;1086,444,160,c;1320,444,180,s;1660,444,280,s;2014,388,220,i;2308,388,160,c;2542,388,300,s;2916,444,180,i;3170,444,200,s;3530,444,280,s;3884,500,220,i;4178,500,180,c;4432,500,200,i;4706,444,300,s;5080,444,170,c;5410,444,280,s;5764,388,220,s;6058,388,200,i;6332,388,200,s;6606,388,340,s',
  branches:'1520,494,110,s;3390,494,110,s;5270,494,110,s',memories:[0,1,2],
  stations:[],
  checkpoints:[5,11,17],
  sectors:[[0,"Storm lip"],[6,"Lower lee"],[12,"Whiteout crossing"],[18,"Storm shelter"]],
  hazards:[laser(2,.5,110,.6,3.4),spike(4,.5,26),steam(8,.5,106,1.7,3.2),saw(10,.5,26,.7,3.1),spike(13,.5,28),laser(15,.5,110,.5,3.6),saw(18,.5,28,1.5,3.2),spike(20,.5,28)],
  pressure:108,
  wind:28,
 },
 // 29. The Icebreaker — 7126px; 23 main ledges.
 {
  setting:'canal',goal:'ferry',
  route:'24,420,320,s;418,420,200,i;692,420,300,s;1066,468,160,m,32,0.95;1300,468,200,s;1660,468,280,s;2014,420,200,i;2288,420,220,s;2582,420,160,m,36,1.05;2816,420,300,s;3190,420,200,s;3550,420,280,s;3904,468,200,m,32,1.1;4178,468,160,i;4412,468,220,s;4706,468,300,s;5080,420,170,i;5324,420,280,s;5678,420,220,s;5972,368,170,m,28,0.9;6216,368,200,s;6576,368,160,i;6810,368,340,s',
  branches:'1520,518,110,s;2762,540,160,s;2982,540,220,s;3262,540,148,s;3430,480,90,s;6436,418,110,s',memories:[0,2,5],
  stations:[[17,"Icebreaker dock bell"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Sail-marked ice"],[6,"Frozen moorings"],[12,"Dock-bell shelter"],[18,"Icebreaker bow"]],
  hazards:[laser(2,.5,110,.5,3.5),spike(4,.5,26),saw(7,.5,26,.8,3.2),laser(9,.5,110,1.8,3.6),spike(14,.5,28),steam(15,.5,106,.7,3.3),saw(18,.5,28,1.4,3.2),spike(20,.5,28)],
  wind:24,
 },
 // 30. A Warmth Beneath — 6922px; 22 main ledges.
 {
  setting:'garden',goal:'relay',
  route:'24,460,300,s;398,460,220,i;692,460,300,s;1066,408,160,c;1300,408,200,s;1660,408,280,s;2014,356,220,i;2308,356,200,s;2582,356,160,c;2816,408,300,s;3190,408,200,s;3550,408,280,s;3904,460,220,i;4198,460,180,s;4452,460,200,i;4726,512,300,s;5100,512,170,i;5430,512,280,s;5784,564,220,s;6078,564,180,l,24,0.85;6332,564,200,s;6606,564,340,s',
  branches:'1520,458,110,s;3410,458,110,s;5290,562,110,s',memories:[0,1,2],
  stations:[[5,"Springhead light"],[11,"Hearthroot light"],[17,"Stone-arch light"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Snow-covered roots"],[6,"Warm springhead"],[12,"First snowdrop"],[18,"Lower stone arch"]],
  hazards:[laser(2,.5,110,.6,3.6),spike(4,.5,28),saw(7,.5,26,.9,3.2),steam(9,.5,106,1.7,3.3),spike(13,.5,26),steam(15,.5,108,.4,3.4),saw(18,.5,28,1.5,3.3),spike(20,.5,28)],
  wind:24,
 },
 // 31. The Keeper Who Stayed — 7176px; 23 main ledges.
 {
  setting:'cavern',goal:'rescue',
  route:'24,420,320,s;418,420,200,i;692,420,300,s;1066,472,160,m,28,0.95;1300,472,200,s;1660,472,280,s;2014,524,200,i;2288,524,220,s;2582,524,160,i;2816,576,300,s;3190,576,200,s;3550,576,300,s;3924,576,200,i;4198,524,180,s;4452,524,220,i;4746,524,300,s;5120,472,170,i;5364,472,280,s;5718,472,220,s;6012,420,180,c;6266,420,200,s;6626,420,160,m,30,1.05;6860,368,340,s',
  branches:'1520,522,110,s;3410,626,110,s;6486,470,110,s',memories:[0,1,2],
  stations:[[11,"Lens keeper · song chamber"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Blue-ice mouth"],[6,"Song chamber"],[12,"Keeper’s return"],[18,"Open cave"]],
  hazards:[laser(2,.5,110,.7,3.5),spike(4,.5,28),saw(7,.5,28,.9,3.2),steam(9,.5,108,1.8,3.4),spike(13,.5,28),laser(15,.5,110,.5,3.6),saw(18,.5,28,1.4,3.3),spike(20,.5,28)],
  wind:0,
 },
 // 32. North Star, Nearer — 7180px; 24 main ledges.
 {
  setting:'sky',goal:'signal',
  route:'24,760,300,s;394,760,200,i;664,760,300,s;1034,708,140,c;1244,708,160,s;1564,708,280,s;1914,656,200,i;2184,656,160,s;2414,656,200,m,30,1.05;2684,604,300,s;3054,604,160,s;3374,604,280,s;3724,552,200,i;3994,552,160,s;4224,552,160,c;4454,500,300,s;4824,500,200,s;5184,500,280,s;5534,448,160,s;5764,448,200,i;6034,396,300,s;6404,396,160,m,28,1.1;6634,344,160,s;6864,344,340,s',
  branches:'1424,758,110,s;3234,654,110,s;5044,550,110,s',memories:[0,1,2],
  stations:[[5,"Ridge star signal"],[11,"Cloud-break signal"],[17,"Observatory signal"]],
  checkpoints:[5,11,17],
  sectors:[[0,"Last ridge"],[6,"Cloud break"],[12,"Northern lens"],[18,"Mountain observatory"]],
  hazards:[laser(2,.5,110,.5,3.6),spike(4,.5,26),saw(7,.5,22,.8,3.1),laser(9,.5,110,1.8,3.7),spike(13,.5,24),steam(15,.5,108,.6,3.4),saw(18,.5,22,1.4,3.2),laser(20,.5,110,2.1,3.5),spike(22,.5,26)],
  wind:30,
 },
];
