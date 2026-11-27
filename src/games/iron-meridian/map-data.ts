import type { NationDefinition, ProvinceDefinition } from './types';

// Original Meridian geography. Coordinates are authored in a 1600 by 1000 atlas.
export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 1000;

export const NATIONS: NationDefinition[] = [
  {
    "id": 0,
    "name": "Aster Republic",
    "short": "AST",
    "adjective": "Asterian",
    "color": "#7e9c82",
    "dark": "#344f43",
    "motto": "Liberty endures",
    "specialty": "Balanced industry"
  },
  {
    "id": 1,
    "name": "Vesper Commonwealth",
    "short": "VES",
    "adjective": "Vesperan",
    "color": "#7897b3",
    "dark": "#304c69",
    "motto": "A common horizon",
    "specialty": "Air power"
  },
  {
    "id": 2,
    "name": "Karsk Directorate",
    "short": "KAR",
    "adjective": "Karskan",
    "color": "#b7776b",
    "dark": "#713f3b",
    "motto": "Iron and resolve",
    "specialty": "Armored warfare"
  },
  {
    "id": 3,
    "name": "Helion Kingdom",
    "short": "HEL",
    "adjective": "Helionic",
    "color": "#c0a16a",
    "dark": "#735a32",
    "motto": "Keep the flame",
    "specialty": "Industrial growth"
  },
  {
    "id": 4,
    "name": "Nordmark Union",
    "short": "NOR",
    "adjective": "Nordmark",
    "color": "#9c91ae",
    "dark": "#574e6e",
    "motto": "Together through winter",
    "specialty": "Defensive warfare"
  },
  {
    "id": 5,
    "name": "Sund Federation",
    "short": "SUN",
    "adjective": "Sundic",
    "color": "#69a6a0",
    "dark": "#2e6264",
    "motto": "Across every tide",
    "specialty": "Naval power"
  }
];

export const LANDMASSES: [number, number][][] = [[[178,412],[204,360],[190,324],[235,295],[239,248],[283,236],[305,202],[363,214],[386,168],[424,181],[448,136],[500,156],[528,129],[555,177],[604,162],[642,187],[681,146],[713,181],[766,172],[800,214],[846,200],[878,238],[925,230],[956,267],[1014,253],[1044,288],[1095,295],[1120,340],[1160,365],[1138,409],[1178,447],[1161,491],[1118,516],[1130,548],[1084,566],[1076,611],[1120,647],[1102,697],[1059,719],[1044,766],[992,779],[967,822],[918,808],[884,853],[831,833],[793,864],[750,834],[693,851],[665,808],[619,822],[583,780],[539,790],[505,755],[468,786],[422,760],[388,781],[351,742],[303,751],[279,715],[231,700],[244,651],[202,624],[225,583],[187,553],[207,513],[173,472]],[[1292,291],[1324,253],[1360,270],[1380,242],[1414,269],[1448,268],[1473,307],[1458,339],[1490,373],[1471,409],[1496,449],[1470,480],[1490,515],[1456,539],[1470,583],[1432,605],[1414,650],[1377,654],[1360,691],[1324,666],[1285,681],[1269,641],[1237,626],[1252,587],[1230,552],[1256,515],[1238,481],[1263,448],[1248,410],[1280,377],[1266,335]]];

export const PROVINCES: ProvinceDefinition[] = [
  {"id":0,"name":"Ardenne","x":535.222,"y":457.061,"polygon":[[587.911,424.352],[555.636,404.972],[493.004,419.52],[472.878,449.899],[520.627,514.396],[574.161,502.969]],"neighbors":[4,5,28,61,63,68],"home":0,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":4,"oil":0,"civilian":0,"military":1,"dockyard":0},
  {"id":1,"name":"Marrow Bay","x":233.803,"y":535.766,"polygon":[[262.081,570.336],[275.644,513.84],[251.006,489.811],[199.568,504.038],[207.0,513.0],[187.0,553.0],[222.911,581.351]],"neighbors":[2,7,24,26],"home":0,"terrain":"city","capital":false,"port":true,"vp":3,"steel":5,"oil":0,"civilian":0,"military":0,"dockyard":1},
  {"id":2,"name":"Clarefen","x":305.932,"y":553.577,"polygon":[[333.176,510.093],[275.644,513.84],[262.081,570.336],[300.621,602.439],[350.368,577.476]],"neighbors":[1,3,7,8,26],"home":0,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":0,"military":1,"dockyard":0},
  {"id":3,"name":"Ternwick","x":382.462,"y":535.432,"polygon":[[351.118,487.292],[333.176,510.093],[350.368,577.476],[382.262,590.899],[433.586,569.731],[410.313,483.554]],"neighbors":[2,4,8,9,26,27],"home":0,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":0,"dockyard":0},
  {"id":4,"name":"Bellmere","x":462.646,"y":513.225,"polygon":[[433.586,569.731],[453.757,576.743],[497.509,561.732],[520.627,514.396],[472.878,449.899],[433.493,456.911],[410.313,483.554]],"neighbors":[0,3,5,9,10,27,28],"home":0,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":2,"dockyard":0},
  {"id":5,"name":"Cresswick","x":557.377,"y":556.28,"polygon":[[559.612,619.85],[607.811,578.774],[603.151,525.535],[574.161,502.969],[520.627,514.396],[497.509,561.732]],"neighbors":[0,4,6,10,11,68],"home":0,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":6,"name":"Valcairn","x":654.611,"y":551.136,"polygon":[[603.151,525.535],[607.811,578.774],[664.586,603.591],[713.541,554.81],[674.802,499.439]],"neighbors":[5,11,43,68,69],"home":0,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":0,"military":1,"dockyard":0},
  {"id":7,"name":"Elden","x":254.052,"y":613.116,"polygon":[[294.446,638.708],[300.621,602.439],[262.081,570.336],[222.911,581.351],[225.0,583.0],[202.0,624.0],[244.0,651.0],[242.577,656.365]],"neighbors":[1,2,8,12],"home":0,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":0,"military":0,"dockyard":0},
  {"id":8,"name":"Highfield","x":342.18,"y":627.525,"polygon":[[382.262,590.899],[350.368,577.476],[300.621,602.439],[294.446,638.708],[325.55,675.107],[379.214,667.175]],"neighbors":[2,3,7,9,12,13],"home":0,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":3,"civilian":1,"military":0,"dockyard":0},
  {"id":9,"name":"Asterfall","x":421.347,"y":630.666,"polygon":[[382.262,590.899],[379.214,667.175],[405.749,688.554],[465.588,672.287],[453.757,576.743],[433.586,569.731]],"neighbors":[3,4,8,10,13,14],"home":0,"terrain":"city","capital":true,"port":false,"vp":8,"steel":5,"oil":0,"civilian":1,"military":2,"dockyard":0},
  {"id":10,"name":"Goldfen","x":500.884,"y":622.377,"polygon":[[465.588,672.287],[486.019,682.223],[557.679,646.032],[559.612,619.85],[497.509,561.732],[453.757,576.743]],"neighbors":[4,5,9,11,14,15],"home":0,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":0,"dockyard":0},
  {"id":11,"name":"Mallow Reach","x":614.119,"y":631.134,"polygon":[[607.811,578.774],[559.612,619.85],[557.679,646.032],[594.868,683.427],[672.212,649.703],[664.586,603.591]],"neighbors":[5,6,10,15,17,43],"home":0,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":3,"civilian":0,"military":0,"dockyard":0},
  {"id":12,"name":"Dunwater","x":280.323,"y":683.478,"polygon":[[325.55,675.107],[294.446,638.708],[242.577,656.365],[231.0,700.0],[279.0,715.0],[297.283,742.425]],"neighbors":[7,8,13],"home":0,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":0,"military":0,"dockyard":0},
  {"id":13,"name":"Greymont","x":357.888,"y":715.987,"polygon":[[405.749,688.554],[379.214,667.175],[325.55,675.107],[297.283,742.425],[303.0,751.0],[351.0,742.0],[388.0,781.0],[391.384,778.91]],"neighbors":[8,9,12,14],"home":0,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":0,"military":0,"dockyard":0},
  {"id":14,"name":"Lowmere","x":448.997,"y":728.501,"polygon":[[486.019,682.223],[465.588,672.287],[405.749,688.554],[391.384,778.91],[422.0,760.0],[468.0,786.0],[503.745,756.052]],"neighbors":[9,10,13,15],"home":0,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":1,"military":0,"dockyard":0},
  {"id":15,"name":"Ashhaven","x":541.254,"y":709.278,"polygon":[[596.528,716.316],[594.868,683.427],[557.679,646.032],[486.019,682.223],[503.745,756.052],[505.0,755.0],[531.076,781.843]],"neighbors":[10,11,14,16,17],"home":0,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":0,"military":0,"dockyard":0},
  {"id":16,"name":"Rillstone","x":606.493,"y":769.955,"polygon":[[655.188,808.072],[653.553,752.425],[596.528,716.316],[531.076,781.843],[539.0,790.0],[583.0,780.0],[619.0,822.0],[653.724,811.432]],"neighbors":[15,17,49,53],"home":0,"terrain":"city","capital":false,"port":true,"vp":3,"steel":4,"oil":0,"civilian":0,"military":0,"dockyard":1},
  {"id":17,"name":"Bramble","x":650.435,"y":699.623,"polygon":[[653.553,752.425],[695.923,718.657],[698.801,670.309],[672.212,649.703],[594.868,683.427],[596.528,716.316]],"neighbors":[11,15,16,43,49,50],"home":0,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":0,"military":0,"dockyard":0},
  {"id":18,"name":"Lornhaven","x":381.762,"y":236.455,"polygon":[[349.98,288.714],[379.29,299.51],[437.458,240.38],[404.398,174.294],[386.0,168.0],[363.0,214.0],[323.709,205.871]],"neighbors":[19,21,22,23],"home":1,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":3,"civilian":1,"military":1,"dockyard":0},
  {"id":19,"name":"Westervale","x":469.466,"y":194.459,"polygon":[[437.458,240.38],[482.041,252.555],[513.572,227.177],[519.703,137.001],[500.0,156.0],[448.0,136.0],[424.0,181.0],[404.398,174.294]],"neighbors":[18,23,56,62],"home":1,"terrain":"city","capital":false,"port":true,"vp":3,"steel":5,"oil":0,"civilian":0,"military":1,"dockyard":1},
  {"id":20,"name":"Bracken","x":244.038,"y":331.249,"polygon":[[287.757,361.977],[294.454,318.672],[236.861,273.137],[235.0,295.0],[190.0,324.0],[204.0,360.0],[198.358,371.283]],"neighbors":[21,22,25],"home":1,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":1,"military":0,"dockyard":0},
  {"id":21,"name":"Veycross","x":297.007,"y":264.112,"polygon":[[294.454,318.672],[349.98,288.714],[323.709,205.871],[305.0,202.0],[283.0,236.0],[239.0,248.0],[236.861,273.137]],"neighbors":[18,20,22],"home":1,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":1,"military":1,"dockyard":0},
  {"id":22,"name":"Vespera","x":342.928,"y":347.299,"polygon":[[349.98,288.714],[294.454,318.672],[287.757,361.977],[314.011,406.925],[316.067,407.632],[385.875,380.978],[402.355,345.864],[379.29,299.51]],"neighbors":[18,20,21,23,25,26,27,28],"home":1,"terrain":"city","capital":true,"port":false,"vp":8,"steel":5,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":23,"name":"Coldwater","x":440.775,"y":298.341,"polygon":[[482.041,252.555],[437.458,240.38],[379.29,299.51],[402.355,345.864],[464.647,345.957],[494.569,313.881]],"neighbors":[18,19,22,28,61,62],"home":1,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":4,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":24,"name":"Wrenford","x":211.047,"y":456.709,"polygon":[[251.006,489.811],[256.534,447.251],[184.38,399.24],[178.0,412.0],[173.0,472.0],[199.568,504.038]],"neighbors":[1,25,26],"home":1,"terrain":"city","capital":false,"port":true,"vp":3,"steel":5,"oil":3,"civilian":0,"military":1,"dockyard":1},
  {"id":25,"name":"Dovemarch","x":251.046,"y":399.114,"polygon":[[256.534,447.251],[314.011,406.925],[287.757,361.977],[198.358,371.283],[184.38,399.24]],"neighbors":[20,22,24,26],"home":1,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":4,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":26,"name":"Mistwell","x":299.717,"y":468.887,"polygon":[[314.011,406.925],[256.534,447.251],[251.006,489.811],[275.644,513.84],[333.176,510.093],[351.118,487.292],[316.067,407.632]],"neighbors":[1,2,3,22,24,25,27],"home":1,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":0,"military":0,"dockyard":0},
  {"id":27,"name":"Tarn","x":374.73,"y":438.174,"polygon":[[385.875,380.978],[316.067,407.632],[351.118,487.292],[410.313,483.554],[433.493,456.911]],"neighbors":[3,4,22,26,28],"home":1,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":1,"military":0,"dockyard":0},
  {"id":28,"name":"Harrow Bay","x":440.99,"y":397.001,"polygon":[[464.647,345.957],[402.355,345.864],[385.875,380.978],[433.493,456.911],[472.878,449.899],[493.004,419.52]],"neighbors":[0,4,22,23,27,61],"home":1,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":0,"military":1,"dockyard":0},
  {"id":29,"name":"Vargan","x":829.737,"y":340.618,"polygon":[[885.863,357.915],[880.136,318.57],[839.746,289.548],[788.259,303.371],[774.701,359.816],[824.777,396.076]],"neighbors":[30,31,34,60,65,67],"home":2,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":0,"military":1,"dockyard":0},
  {"id":30,"name":"Drazna","x":887.013,"y":265.92,"polygon":[[839.746,289.548],[880.136,318.57],[950.163,260.033],[925.0,230.0],[878.0,238.0],[852.945,208.247]],"neighbors":[29,31,60],"home":2,"terrain":"city","capital":false,"port":true,"vp":3,"steel":5,"oil":0,"civilian":0,"military":0,"dockyard":1},
  {"id":31,"name":"Krestov","x":934.002,"y":328.729,"polygon":[[880.136,318.57],[885.863,357.915],[932.186,386.63],[975.675,375.912],[968.821,263.905],[956.0,267.0],[950.163,260.033]],"neighbors":[29,30,32,34,35],"home":2,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":32,"name":"Redbank","x":1009.128,"y":316.56,"polygon":[[975.675,375.912],[990.248,381.571],[1039.799,363.763],[1063.6,290.69],[1044.0,288.0],[1014.0,253.0],[968.821,263.905]],"neighbors":[31,33,35,36],"home":2,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":1,"military":0,"dockyard":0},
  {"id":33,"name":"Surov","x":1089.505,"y":346.869,"polygon":[[1039.799,363.763],[1090.226,395.597],[1159.348,364.592],[1120.0,340.0],[1095.0,295.0],[1063.6,290.69]],"neighbors":[32,36,37],"home":2,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":0,"military":0,"dockyard":0},
  {"id":34,"name":"Orsken","x":877.043,"y":416.29,"polygon":[[932.186,386.63],[885.863,357.915],[824.777,396.076],[825.748,453.88],[908.553,470.618]],"neighbors":[29,31,35,38,67],"home":2,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":35,"name":"Karsgrad","x":961.034,"y":439.328,"polygon":[[982.38,494.932],[1013.282,459.816],[990.248,381.571],[975.675,375.912],[932.186,386.63],[908.553,470.618],[919.957,488.14]],"neighbors":[31,32,34,36,38,39,40],"home":2,"terrain":"city","capital":true,"port":false,"vp":8,"steel":4,"oil":3,"civilian":1,"military":1,"dockyard":0},
  {"id":36,"name":"Varn","x":1042.092,"y":415.517,"polygon":[[1039.799,363.763],[990.248,381.571],[1013.282,459.816],[1073.567,463.953],[1080.423,459.197],[1090.226,395.597]],"neighbors":[32,33,35,37,40,41],"home":2,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":0,"dockyard":0},
  {"id":37,"name":"Voln","x":1126.608,"y":430.543,"polygon":[[1090.226,395.597],[1080.423,459.197],[1165.248,480.006],[1178.0,447.0],[1138.0,409.0],[1160.0,365.0],[1159.348,364.592]],"neighbors":[33,36,41],"home":2,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":0,"military":0,"dockyard":0},
  {"id":38,"name":"Rost Vale","x":858.451,"y":506.015,"polygon":[[850.318,566.378],[893.541,557.534],[919.957,488.14],[908.553,470.618],[825.748,453.88],[796.745,481.598],[795.224,499.02]],"neighbors":[34,35,39,42,45,67,69],"home":2,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":0,"military":1,"dockyard":0},
  {"id":39,"name":"Terek","x":949.799,"y":543.921,"polygon":[[1005.023,548.168],[982.38,494.932],[919.957,488.14],[893.541,557.534],[937.968,601.126],[972.188,600.255]],"neighbors":[35,38,40,45,46,47],"home":2,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":1,"military":1,"dockyard":0},
  {"id":40,"name":"Brask","x":1034.038,"y":506.181,"polygon":[[1005.023,548.168],[1073.072,553.606],[1073.567,463.953],[1013.282,459.816],[982.38,494.932]],"neighbors":[35,36,39,41,47],"home":2,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":1,"military":1,"dockyard":0},
  {"id":41,"name":"Keldan","x":1105.292,"y":507.422,"polygon":[[1080.423,459.197],[1073.567,463.953],[1073.072,553.606],[1086.205,565.137],[1130.0,548.0],[1118.0,516.0],[1161.0,491.0],[1165.248,480.006]],"neighbors":[36,37,40,47],"home":2,"terrain":"city","capital":false,"port":true,"vp":3,"steel":4,"oil":3,"civilian":0,"military":1,"dockyard":1},
  {"id":42,"name":"Solenne","x":792.508,"y":563.729,"polygon":[[732.383,557.057],[772.566,615.679],[825.831,607.66],[850.318,566.378],[795.224,499.02]],"neighbors":[38,43,44,45,69],"home":3,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":0,"military":0,"dockyard":0},
  {"id":43,"name":"Arcos","x":716.44,"y":615.451,"polygon":[[732.383,557.057],[713.541,554.81],[664.586,603.591],[672.212,649.703],[698.801,670.309],[753.047,654.347],[772.566,615.679]],"neighbors":[6,11,17,42,44,50,69],"home":3,"terrain":"mountain","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":0,"military":1,"dockyard":0},
  {"id":44,"name":"Levanto","x":807.049,"y":659.301,"polygon":[[805.281,723.351],[862.992,671.015],[825.831,607.66],[772.566,615.679],[753.047,654.347]],"neighbors":[42,43,45,50,51],"home":3,"terrain":"mountain","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":1,"military":0,"dockyard":0},
  {"id":45,"name":"Miravel","x":880.699,"y":613.804,"polygon":[[825.831,607.66],[862.992,671.015],[896.757,674.801],[937.968,601.126],[893.541,557.534],[850.318,566.378]],"neighbors":[38,39,42,44,46,51],"home":3,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":3,"civilian":1,"military":1,"dockyard":0},
  {"id":46,"name":"Orenza","x":955.272,"y":657.418,"polygon":[[937.968,601.126],[896.757,674.801],[929.459,714.716],[1004.709,686.128],[1010.172,646.286],[972.188,600.255]],"neighbors":[39,45,47,48,51,52],"home":3,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":1,"military":1,"dockyard":0},
  {"id":47,"name":"Cindrel","x":1031.234,"y":593.467,"polygon":[[1073.072,553.606],[1005.023,548.168],[972.188,600.255],[1010.172,646.286],[1085.358,618.657],[1076.0,611.0],[1084.0,566.0],[1086.205,565.137]],"neighbors":[39,40,41,46,48],"home":3,"terrain":"city","capital":false,"port":true,"vp":3,"steel":0,"oil":0,"civilian":0,"military":0,"dockyard":1},
  {"id":48,"name":"High Ember","x":1060.664,"y":671.435,"polygon":[[1010.172,646.286],[1004.709,686.128],[1052.894,738.134],[1059.0,719.0],[1102.0,697.0],[1120.0,647.0],[1085.358,618.657]],"neighbors":[46,47,52],"home":3,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":0,"military":0,"dockyard":0},
  {"id":49,"name":"Istren","x":698.78,"y":765.343,"polygon":[[655.188,808.072],[753.098,781.025],[759.056,762.325],[695.923,718.657],[653.553,752.425]],"neighbors":[16,17,50,53,54],"home":3,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":4,"oil":0,"civilian":0,"military":1,"dockyard":0},
  {"id":50,"name":"Pelagos","x":746.95,"y":707.814,"polygon":[[759.056,762.325],[803.414,734.315],[805.281,723.351],[753.047,654.347],[698.801,670.309],[695.923,718.657]],"neighbors":[17,43,44,49,51,54],"home":3,"terrain":"mountain","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":0,"military":1,"dockyard":0},
  {"id":51,"name":"Aurelia","x":869.167,"y":724.338,"polygon":[[854.187,781.465],[926.625,742.272],[929.459,714.716],[896.757,674.801],[862.992,671.015],[805.281,723.351],[803.414,734.315]],"neighbors":[44,45,46,50,52,54,55],"home":3,"terrain":"city","capital":true,"port":false,"vp":8,"steel":0,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":52,"name":"Korvale","x":987.107,"y":740.863,"polygon":[[1004.709,686.128],[929.459,714.716],[926.625,742.272],[974.752,808.667],[992.0,779.0],[1044.0,766.0],[1052.894,738.134]],"neighbors":[46,48,51,55],"home":3,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":1,"military":0,"dockyard":0},
  {"id":53,"name":"Orval","x":718.595,"y":816.615,"polygon":[[753.098,781.025],[655.188,808.072],[653.724,811.432],[665.0,808.0],[693.0,851.0],[750.0,834.0],[767.492,846.204]],"neighbors":[16,49,54],"home":3,"terrain":"city","capital":false,"port":true,"vp":3,"steel":0,"oil":3,"civilian":0,"military":0,"dockyard":1},
  {"id":54,"name":"Lanthea","x":803.235,"y":799.208,"polygon":[[854.187,781.465],[803.414,734.315],[759.056,762.325],[753.098,781.025],[767.492,846.204],[793.0,864.0],[831.0,833.0],[854.784,841.975]],"neighbors":[49,50,51,53,55],"home":3,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":4,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":55,"name":"Damaris","x":904.81,"y":796.979,"polygon":[[926.625,742.272],[854.187,781.465],[854.784,841.975],[884.0,853.0],[918.0,808.0],[967.0,822.0],[974.752,808.667]],"neighbors":[51,52,54],"home":3,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":56,"name":"Fjellmark","x":559.984,"y":197.669,"polygon":[[513.572,227.177],[588.67,250.905],[618.631,171.625],[604.0,162.0],[555.0,177.0],[528.0,129.0],[519.703,137.001]],"neighbors":[19,57,62],"home":4,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":0,"military":0,"dockyard":0},
  {"id":57,"name":"Rimefall","x":637.952,"y":231.623,"polygon":[[588.67,250.905],[596.926,269.257],[694.472,261.582],[691.766,234.735],[630.274,179.286],[618.631,171.625]],"neighbors":[56,58,59,62,64],"home":4,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":58,"name":"Isken","x":682.595,"y":189.594,"polygon":[[691.766,234.735],[725.151,178.937],[713.0,181.0],[681.0,146.0],[642.0,187.0],[630.274,179.286]],"neighbors":[57,59],"home":4,"terrain":"city","capital":false,"port":true,"vp":3,"steel":0,"oil":4,"civilian":1,"military":1,"dockyard":1},
  {"id":59,"name":"Fjordwatch","x":739.165,"y":223.247,"polygon":[[691.766,234.735],[694.472,261.582],[699.403,267.144],[756.857,269.509],[788.794,200.157],[766.0,172.0],[725.151,178.937]],"neighbors":[57,58,60,64,65],"home":4,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":4,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":60,"name":"Vale of Pines","x":807.894,"y":251.659,"polygon":[[756.857,269.509],[788.259,303.371],[839.746,289.548],[852.945,208.247],[846.0,200.0],[800.0,214.0],[788.794,200.157]],"neighbors":[29,30,59,65],"home":4,"terrain":"city","capital":false,"port":true,"vp":3,"steel":0,"oil":4,"civilian":0,"military":1,"dockyard":1},
  {"id":61,"name":"Hestvik","x":513.901,"y":365.664,"polygon":[[552.604,328.512],[494.569,313.881],[464.647,345.957],[493.004,419.52],[555.636,404.972]],"neighbors":[0,23,28,62,63],"home":4,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":0,"oil":3,"civilian":0,"military":0,"dockyard":0},
  {"id":62,"name":"Silvar","x":538.266,"y":278.202,"polygon":[[589.589,304.329],[596.926,269.257],[588.67,250.905],[513.572,227.177],[482.041,252.555],[494.569,313.881],[552.604,328.512]],"neighbors":[19,23,56,57,61,63,64],"home":4,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":4,"oil":0,"civilian":0,"military":1,"dockyard":0},
  {"id":63,"name":"Frostmere","x":593.273,"y":366.4,"polygon":[[589.589,304.329],[552.604,328.512],[555.636,404.972],[587.911,424.352],[618.439,415.489],[646.271,354.535]],"neighbors":[0,61,62,64,66,68],"home":4,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":0,"dockyard":0},
  {"id":64,"name":"Nordhaven","x":647.969,"y":302.6,"polygon":[[694.472,261.582],[596.926,269.257],[589.589,304.329],[646.271,354.535],[684.988,344.26],[699.403,267.144]],"neighbors":[57,59,62,63,65,66],"home":4,"terrain":"city","capital":true,"port":false,"vp":8,"steel":0,"oil":4,"civilian":1,"military":1,"dockyard":0},
  {"id":65,"name":"Tjorn","x":735.546,"y":319.176,"polygon":[[788.259,303.371],[756.857,269.509],[699.403,267.144],[684.988,344.26],[729.682,376.613],[774.701,359.816]],"neighbors":[29,59,60,64,66,67],"home":4,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":0,"dockyard":0},
  {"id":66,"name":"Veldheim","x":677.88,"y":400.338,"polygon":[[618.439,415.489],[683.798,459.722],[718.065,439.893],[729.682,376.613],[684.988,344.26],[646.271,354.535]],"neighbors":[63,64,65,67,68,69],"home":4,"terrain":"mountain","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":67,"name":"Ostervik","x":775.111,"y":419.365,"polygon":[[824.777,396.076],[774.701,359.816],[729.682,376.613],[718.065,439.893],[796.745,481.598],[825.748,453.88]],"neighbors":[29,34,38,65,66,69],"home":4,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":0,"military":0,"dockyard":0},
  {"id":68,"name":"Lysmark","x":624.391,"y":471.827,"polygon":[[674.802,499.439],[683.798,459.722],[618.439,415.489],[587.911,424.352],[574.161,502.969],[603.151,525.535]],"neighbors":[0,5,6,63,66,69],"home":4,"terrain":"hills","capital":false,"port":false,"vp":1,"steel":0,"oil":3,"civilian":0,"military":1,"dockyard":0},
  {"id":69,"name":"Dalvik","x":730.841,"y":496.582,"polygon":[[718.065,439.893],[683.798,459.722],[674.802,499.439],[713.541,554.81],[732.383,557.057],[795.224,499.02],[796.745,481.598]],"neighbors":[6,38,42,43,66,67,68],"home":4,"terrain":"mountain","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":0,"military":0,"dockyard":0},
  {"id":70,"name":"Sundhaven","x":1302.748,"y":345.362,"polygon":[[1318.714,396.859],[1343.821,331.008],[1298.268,283.556],[1292.0,291.0],[1266.0,335.0],[1280.0,377.0],[1265.438,392.017]],"neighbors":[71,73,74],"home":5,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":4,"oil":0,"civilian":0,"military":1,"dockyard":0},
  {"id":71,"name":"Alder Isle","x":1359.14,"y":289.105,"polygon":[[1343.821,331.008],[1386.686,328.546],[1414.006,269.0],[1414.0,269.0],[1380.0,242.0],[1360.0,270.0],[1324.0,253.0],[1298.268,283.556]],"neighbors":[70,72,74],"home":5,"terrain":"city","capital":false,"port":true,"vp":3,"steel":5,"oil":0,"civilian":0,"military":0,"dockyard":1},
  {"id":72,"name":"Tern Sound","x":1431.984,"y":320.306,"polygon":[[1386.686,328.546],[1416.481,370.802],[1478.635,360.925],[1458.0,339.0],[1473.0,307.0],[1448.0,268.0],[1414.006,269.0]],"neighbors":[71,74,76],"home":5,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":5,"oil":0,"civilian":0,"military":0,"dockyard":0},
  {"id":73,"name":"Veyra","x":1292.148,"y":442.414,"polygon":[[1322.563,491.125],[1331.092,483.241],[1333.745,411.856],[1318.714,396.859],[1265.438,392.017],[1248.0,410.0],[1263.0,448.0],[1238.0,481.0],[1238.778,482.469]],"neighbors":[70,74,75,77,78],"home":5,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":0,"dockyard":0},
  {"id":74,"name":"Mossbank","x":1367.151,"y":372.401,"polygon":[[1416.481,370.802],[1386.686,328.546],[1343.821,331.008],[1318.714,396.859],[1333.745,411.856],[1399.127,405.744]],"neighbors":[70,71,72,73,75,76],"home":5,"terrain":"forest","capital":false,"port":false,"vp":1,"steel":4,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":75,"name":"Sundholm","x":1372.055,"y":447.216,"polygon":[[1396.065,487.299],[1420.657,451.682],[1399.127,405.744],[1333.745,411.856],[1331.092,483.241]],"neighbors":[73,74,76,78,79],"home":5,"terrain":"city","capital":true,"port":false,"vp":8,"steel":5,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":76,"name":"Harrow Isle","x":1447.283,"y":409.92,"polygon":[[1416.481,370.802],[1399.127,405.744],[1420.657,451.682],[1490.243,455.864],[1496.0,449.0],[1471.0,409.0],[1490.0,373.0],[1478.635,360.925]],"neighbors":[72,74,75,79],"home":5,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":0,"dockyard":0},
  {"id":77,"name":"Bluewater","x":1282.038,"y":531.862,"polygon":[[1306.891,574.893],[1327.388,551.449],[1322.563,491.125],[1238.778,482.469],[1256.0,515.0],[1230.0,552.0],[1245.212,576.201]],"neighbors":[73,78,80,81],"home":5,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":0,"civilian":1,"military":1,"dockyard":0},
  {"id":78,"name":"Lantern Key","x":1365.145,"y":521.444,"polygon":[[1413.981,532.224],[1396.065,487.299],[1331.092,483.241],[1322.563,491.125],[1327.388,551.449],[1384.872,563.87]],"neighbors":[73,75,77,79,81,83],"home":5,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":3,"civilian":1,"military":1,"dockyard":0},
  {"id":79,"name":"Kelpstrand","x":1442.783,"y":494.423,"polygon":[[1420.657,451.682],[1396.065,487.299],[1413.981,532.224],[1456.672,541.113],[1456.0,539.0],[1490.0,515.0],[1470.0,480.0],[1490.243,455.864]],"neighbors":[75,76,78,83],"home":5,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":3,"civilian":1,"military":1,"dockyard":0},
  {"id":80,"name":"Gullhaven","x":1285.32,"y":619.876,"polygon":[[1326.406,624.024],[1306.891,574.893],[1245.212,576.201],[1252.0,587.0],[1237.0,626.0],[1269.0,641.0],[1285.0,681.0],[1307.877,672.201]],"neighbors":[77,81,82],"home":5,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":0,"military":1,"dockyard":0},
  {"id":81,"name":"Dunlin","x":1350.946,"y":588.667,"polygon":[[1327.388,551.449],[1306.891,574.893],[1326.406,624.024],[1395.182,615.221],[1384.872,563.87]],"neighbors":[77,78,80,82,83],"home":5,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":0,"military":1,"dockyard":0},
  {"id":82,"name":"Eastwatch","x":1360.864,"y":646.191,"polygon":[[1395.182,615.221],[1326.406,624.024],[1307.877,672.201],[1324.0,666.0],[1360.0,691.0],[1377.0,654.0],[1414.0,650.0],[1419.051,637.373]],"neighbors":[80,81,83],"home":5,"terrain":"city","capital":false,"port":true,"vp":3,"steel":5,"oil":0,"civilian":0,"military":0,"dockyard":1},
  {"id":83,"name":"Last Light","x":1423.878,"y":577.03,"polygon":[[1413.981,532.224],[1384.872,563.87],[1395.182,615.221],[1419.051,637.373],[1432.0,605.0],[1470.0,583.0],[1456.672,541.113]],"neighbors":[78,79,81,82],"home":5,"terrain":"plains","capital":false,"port":false,"vp":1,"steel":0,"oil":4,"civilian":0,"military":0,"dockyard":0}
];

// Ports connect across open water. These are deliberately not land neighbors.
export const SEA_LINKS: [number, number][] = [[1,19],[19,30],[30,47],[47,60],[60,16],[16,82],[41,82],[47,82],[60,71],[71,82]];

// Scenic centerlines follow the central watershed and historic trade corridors.
export const RIVERS: [number, number][][] = [[[702,295],[685,339],[715,379],[703,423],[740,467],[724,511],[757,555],[745,596],[778,641],[762,683],[799,728],[818,783],[831,833]],[[685,339],[643,359],[619,391],[577,404],[553,445],[508,460],[477,500],[427,514],[389,552],[340,574],[302,612],[244,651]]];
export const ROADS: number[][] = [[1,9,16],[19,22,24],[30,35,41],[47,51,53],[58,60,64],[71,75,82]];
