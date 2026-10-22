/**
 * Corn Clicker content and balancing tables. Every number a designer might tune lives here;
 * economy.ts only interprets these records.
 */
import type {ProducerId,SkinId,VarietyId} from './art';
export type {ProducerId,SkinId,VarietyId};

// ───────────────────────── Producers ─────────────────────────
export interface Producer {id:ProducerId;name:string;plural:string;baseCost:number;baseRate:number;desc:string}
export const PRICE_GROWTH=1.15;
export const PRODUCERS:Producer[]=[
 {id:'farmhand',name:'Farmhand',plural:'Farmhands',baseCost:15,baseRate:0.1,desc:'Picks one kernel at a time and hums about it.'},
 {id:'patch',name:'Corn Patch',plural:'Corn Patches',baseCost:100,baseRate:1,desc:'A modest square of dirt with big dreams.'},
 {id:'field',name:'Cornfield',plural:'Cornfields',baseCost:1100,baseRate:8,desc:'Rows and rows of rustling optimism.'},
 {id:'tractor',name:'Tractor',plural:'Tractors',baseCost:12000,baseRate:47,desc:'Ploughs, plants and occasionally pops a wheelie.'},
 {id:'combine',name:'Combine Harvester',plural:'Combine Harvesters',baseCost:130000,baseRate:260,desc:'Eats a field before lunch, asks for seconds.'},
 {id:'greenhouse',name:'Greenhouse',plural:'Greenhouses',baseCost:1.4e6,baseRate:1400,desc:'Permanent summer under glass. Corn wears sunglasses.'},
 {id:'irrigation',name:'Irrigation Network',plural:'Irrigation Networks',baseCost:2e7,baseRate:7800,desc:'Pipes that know exactly how thirsty every stalk is.'},
 {id:'factory',name:'Corn Factory',plural:'Corn Factories',baseCost:3.3e8,baseRate:44000,desc:'Turns raw kernels into slightly more official kernels.'},
 {id:'lab',name:'Agricultural Lab',plural:'Agricultural Labs',baseCost:5.1e9,baseRate:260000,desc:'Scientists asking the big question: why not more corn?'},
 {id:'hydroponic',name:'Hydroponic Tower',plural:'Hydroponic Towers',baseCost:7.5e10,baseRate:1.6e6,desc:'Skyscrapers for stalks. Soil is optional, ambition is not.'},
 {id:'robot',name:'Robot Plantation',plural:'Robot Plantations',baseCost:1e12,baseRate:1e7,desc:'Tireless machines that say "beep" in a farmer accent.'},
 {id:'weather',name:'Weather Station',plural:'Weather Stations',baseCost:1.4e13,baseRate:6.5e7,desc:'Orders sunshine by the gallon and rain by the drop.'},
 {id:'megafarm',name:'Underground Megafarm',plural:'Underground Megafarms',baseCost:1.7e14,baseRate:4.3e8,desc:'Miles of glowing caverns where moles are middle management.'},
 {id:'orbital',name:'Orbital Farm',plural:'Orbital Farms',baseCost:2.1e15,baseRate:2.9e9,desc:'Zero-gravity corn grows in every direction at once.'},
 {id:'lunar',name:'Lunar Plantation',plural:'Lunar Plantations',baseCost:2.6e16,baseRate:2.1e10,desc:'The moon was always made of corn. We just checked.'},
 {id:'cloner',name:'Corn Cloner',plural:'Corn Cloners',baseCost:3.1e17,baseRate:1.5e11,desc:'Copies the perfect cob. Then copies the copies.'},
 {id:'time',name:'Time Harvester',plural:'Time Harvesters',baseCost:7.1e19,baseRate:1.1e12,desc:'Harvests next year\'s crop and sends it back with a note.'},
 {id:'dimension',name:'Dimensional Farm',plural:'Dimensional Farms',baseCost:1.2e22,baseRate:8.3e12,desc:'Borrows corn from universes that will not miss it.'},
 {id:'singularity',name:'Corn Singularity',plural:'Corn Singularities',baseCost:1.9e24,baseRate:6.4e13,desc:'So much corn in one place that it folds space into popcorn.'},
 {id:'corniverse',name:'Corniverse',plural:'Corniverses',baseCost:5.4e26,baseRate:5.1e14,desc:'Everything that ever was, is, or will be: corn.'},
];
export const PRODUCER_IDS=PRODUCERS.map(p=>p.id);
export const producerById=Object.fromEntries(PRODUCERS.map(p=>[p.id,p])) as Record<ProducerId,Producer>;

// ───────────────────────── Upgrades ─────────────────────────
export type Effect=
 |{kind:'producer';target:ProducerId;mult:number}
 |{kind:'click';mult:number}
 |{kind:'clickCps';fraction:number}
 |{kind:'manyHands';value:number}
 |{kind:'global';pct:number}
 |{kind:'synergy';low:ProducerId;high:ProducerId;lowPerHigh:number;highPerLow:number}
 |{kind:'golden';freq:number;life:number;duration:number}
 |{kind:'butter';perAchievement:number}
 |{kind:'unlock';feature:Feature};
export type Feature='garden'|'festival'|'scarecrow'|'cornpocalypse';
export type Requirement=
 |{type:'owned';producer:ProducerId;count:number}
 |{type:'pair';low:ProducerId;high:ProducerId;count:number}
 |{type:'clicks';count:number}
 |{type:'earned';amount:number}
 |{type:'golden';count:number}
 |{type:'achievements';count:number};
export type UpgradeGroup='producer'|'click'|'global'|'synergy'|'golden'|'butter'|'feature';
export interface Upgrade {id:string;name:string;flavour:string;price:number;effect:Effect;req:Requirement;group:UpgradeGroup}

export const MILESTONES=[10,25,50,100,200];
/** Price of a tier upgrade as a multiple of the producer's base cost. */
export const MILESTONE_PRICE:Record<number,number>={1:10,10:60,25:600,50:5e4,100:5e6,200:5e10};
const TIER_NAMES:Record<ProducerId,string[]>={
 farmhand:['Sturdy Overalls','Sunrise Shifts','Husking Gloves','Folk Songs of the Furrow','Union of Agrarian Hands','Farmhand Folklore Festival'],
 patch:['Raked Rows','Worm Welcome Mat','Companion Beans','Mulch Mountains','Patchwork Prosperity','Soil Whisperer'],
 field:['Straight-ish Rows','Scarecrow Interns','Crop Circles (Legitimate)','Maize Maze Tourism','Field of Reams','Endless Acreage'],
 tractor:['Cup Holders','Turbo Diesel Hum','Tractor Pull Champions','Hover Tyres','Self-Driving Sundays'],
 combine:['Wider Headers','Kernel Funnel','Night Headlights','Cabin Karaoke','The Combine Combine'],
 greenhouse:['Double Glazing','Misting Mornings','Grow Lights','Pollinator Playlists','Glass Cathedrals'],
 irrigation:['Leak-Free Joints','Rain Barrels','Drip Wisdom','Aquifer Agreements','Rivers on Demand'],
 factory:['Popping Presses','Conveyor Choreography','Cornflake Annex','Round-the-Clock Husking','Industrial Butter Lines'],
 lab:['Lab Coats with Pockets','Kernel Sequencing','Peer-Reviewed Popcorn','Recombinant Cob','Nobel Ear'],
 hydroponic:['Nutrient Soup','Vertical Thinking','Root Spa','Stacked to the Clouds','Floating Fields'],
 robot:['Fresh Oil Change','Polite Programming','Robot Choir','Self-Repairing Servos','Robot Union Contract'],
 weather:['Barometer Bribes','Cloud Seeding','Sunshine Scheduling','Hurricane Herding','Climate Concierge'],
 megafarm:['Glow-Worm Lighting','Bigger Shovels','Magma Greenhouses','Mole Partnerships','Hollow Earth Harvest'],
 orbital:['Zero-G Tassels','Solar Sails','Slingshot Delivery','Ring of Rows','Low Orbit Granary'],
 lunar:['Crater Composting','Moon Boots','Tidal Irrigation','Far Side Fields','Harvest Moon (Literal)'],
 cloner:['Copy-Paste Kernels','Clone Name Tags','Identical Twin Cobs','Mass Replication','Cloneception'],
 time:['Early Bird Protocol','Yesterday\'s Harvest','Paradox Insurance','Seasons on Fast-Forward','Harvest Before Planting'],
 dimension:['Portal Draught Excluders','Parallel Plots','Mirror-Universe Maize','Multiversal Co-op','Every Possible Field'],
 singularity:['Event Horizon Silos','Spaghettified Stalks','Hawking Popcorn','Dense Kernel Matter','Infinite Density Snacks'],
 corniverse:['Big Bang Popcorn','Cosmic Cob Background','Galactic Husk Filaments','Dark Maize Energy','The Last Kernel'],
};
const EARLY=new Set<ProducerId>(['farmhand','patch','field']);
function producerUpgrades():Upgrade[] {
  const out:Upgrade[]=[];
  for(const p of PRODUCERS){
    const milestones=EARLY.has(p.id)?[1,...MILESTONES]:MILESTONES;
    milestones.forEach((count,i)=>out.push({
      id:`${p.id}-${count}`,name:TIER_NAMES[p.id][i],group:'producer',
      flavour:`${p.plural} learn a new trick at ${count} owned.`,
      price:p.baseCost*MILESTONE_PRICE[count],effect:{kind:'producer',target:p.id,mult:2},
      req:{type:'owned',producer:p.id,count},
    }));
  }
  return out;
}
const CLICK_UPGRADES:Upgrade[]=[
 {id:'click-1',name:'Calloused Thumbs',flavour:'Years of husking finally pay off.',price:100,effect:{kind:'click',mult:2},req:{type:'clicks',count:15},group:'click'},
 {id:'click-2',name:'Ambidextrous Picking',flavour:'Two hands. Twice the corn. Basic agronomy.',price:600,effect:{kind:'click',mult:2},req:{type:'clicks',count:150},group:'click'},
 {id:'click-3',name:'Corn-Fed Fingers',flavour:'You are what you eat. You are now very fast.',price:12000,effect:{kind:'click',mult:2},req:{type:'clicks',count:800},group:'click'},
 {id:'cps-1',name:'Golden Grip',flavour:'Each pick borrows a little of the whole farm\'s rhythm.',price:5e4,effect:{kind:'clickCps',fraction:0.01},req:{type:'earned',amount:1e4},group:'click'},
 {id:'cps-2',name:'Novelty Cob Holders',flavour:'Little plastic corns stuck in the big corn. Recursive.',price:5e6,effect:{kind:'clickCps',fraction:0.01},req:{type:'earned',amount:1e6},group:'click'},
 {id:'cps-3',name:'Deluxe Cob Holders',flavour:'Now with ergonomic grips and a tiny cup holder.',price:5e8,effect:{kind:'clickCps',fraction:0.01},req:{type:'earned',amount:1e8},group:'click'},
 {id:'cps-4',name:'Titanium Tongs',flavour:'Aerospace engineering, applied to snacks.',price:5e10,effect:{kind:'clickCps',fraction:0.01},req:{type:'earned',amount:1e10},group:'click'},
 {id:'cps-5',name:'Diamond-Studded Tongs',flavour:'Purely functional. The sparkle is a side effect.',price:5e12,effect:{kind:'clickCps',fraction:0.01},req:{type:'earned',amount:1e12},group:'click'},
 {id:'cps-6',name:'Antimatter Tongs',flavour:'Do not touch the regular tongs with these.',price:5e15,effect:{kind:'clickCps',fraction:0.01},req:{type:'earned',amount:1e15},group:'click'},
 {id:'cps-7',name:'Quantum Tongs',flavour:'Picks every kernel and none of them until observed.',price:5e18,effect:{kind:'clickCps',fraction:0.01},req:{type:'earned',amount:1e18},group:'click'},
 {id:'cps-8',name:'Tongs of Destiny',flavour:'Forged in the heart of a dying popcorn star.',price:5e21,effect:{kind:'clickCps',fraction:0.01},req:{type:'earned',amount:1e21},group:'click'},
];
const MANY_HANDS:Upgrade[]=[
 {id:'hands-1',name:'Many Hands',flavour:'Farmhands lend a hand to every building on the farm.',price:1e5,effect:{kind:'manyHands',value:0.1},req:{type:'owned',producer:'farmhand',count:25},group:'click'},
 {id:'hands-2',name:'Many, Many Hands',flavour:'More hands than strictly anatomically advisable.',price:1e7,effect:{kind:'manyHands',value:5},req:{type:'owned',producer:'farmhand',count:50},group:'click'},
 {id:'hands-3',name:'A Thousand Helping Hands',flavour:'The farmhands have formed a very polite swarm.',price:1e9,effect:{kind:'manyHands',value:10},req:{type:'owned',producer:'farmhand',count:100},group:'click'},
 {id:'hands-4',name:'Hands Across the Acres',flavour:'A human chain from the barn to the horizon.',price:1e11,effect:{kind:'manyHands',value:20},req:{type:'owned',producer:'farmhand',count:150},group:'click'},
 {id:'hands-5',name:'Hands Across the Galaxy',flavour:'They wave at the orbital farms on the way past.',price:1e14,effect:{kind:'manyHands',value:20},req:{type:'owned',producer:'farmhand',count:200},group:'click'},
 {id:'hands-6',name:'The Hand of the Corniverse',flavour:'One enormous hand, gently cupping all existence.',price:1e18,effect:{kind:'manyHands',value:20},req:{type:'owned',producer:'farmhand',count:300},group:'click'},
];
const FLAVOURS:[string,string,number][]=[
 ['Salted Kernels','A pinch of salt makes everything taste more productive.',5],
 ['Buttered Kernels','The farmhands insisted.',5],
 ['Caramel Glaze','Sticky, shiny and statistically superior.',5],
 ['Chilli-Lime Dust','Spicy corn grows faster out of sheer excitement.',5],
 ['Cheddar Snow','A blizzard of cheese over the north field.',5],
 ['Kettle Corn Recipe','Grandma\'s recipe, finally declassified.',10],
 ['Cinnamon Swirl','Smells like autumn, yields like summer.',10],
 ['Truffle Butter','Fancy corn for fancy markets.',10],
 ['Maple Pecan Crunch','Imported from a forest that owes us a favour.',15],
 ['Smoked Paprika Pop','Smokier, crunchier, faster.',15],
 ['Wasabi Whirl','Clears the sinuses and the silos.',15],
 ['Saffron Gold Coating','Worth its weight in kernels, which is a lot of kernels.',20],
 ['Starlight Seasoning','Collected from the tails of passing comets.',20],
 ['Nebula Nacho Dust','Contains trace amounts of new galaxies.',25],
 ['Antimatter Caramel','Annihilates boredom on contact.',25],
 ['Universal Umami','The fifth taste, and the final one.',30],
];
const GLOBALS:Upgrade[]=FLAVOURS.map(([name,flavour,pct],i)=>({
 id:`flavour-${i+1}`,name,flavour,group:'global',
 // Thresholds climb ~1.5 orders of magnitude so a new flavour appears through every stage.
 price:2e5*10**(i*1.5)*2,effect:{kind:'global',pct},req:{type:'earned',amount:2e5*10**(i*1.5)},
}));
const PAIRS:[ProducerId,ProducerId,string,string][]=[
 ['patch','tractor','Tractor-Tilled Patches','Small patches, big machinery.'],
 ['farmhand','combine','Ride-Along Harvests','Farmhands get a seat in the cab. Everybody wins.'],
 ['field','irrigation','Sprinkler Season','Every field gets its own personal rain cloud.'],
 ['tractor','factory','Factory-Fresh Tractors','Straight off the line and into the dirt.'],
 ['combine','robot','Autonomous Combines','The robots drive. The combines are relieved.'],
 ['greenhouse','weather','Climate-Controlled Glass','The forecast inside is always "corn".'],
 ['irrigation','megafarm','Underground Rivers','Water flows down to the caverns, corn flows up.'],
 ['factory','cloner','Cloned Assembly Lines','Every conveyor belt has a twin.'],
 ['lab','time','Results from Next Week','The lab already knows the answer: more corn.'],
 ['hydroponic','orbital','Trays in Orbit','Hydroponic towers make excellent space stations.'],
 ['patch','lunar','Moon Patches','A tiny corn patch in every crater.'],
 ['field','dimension','Fields Without End','Each field opens onto another field.'],
 ['farmhand','singularity','Hands That Bend Light','Farmhands learn to husk around the event horizon.'],
 ['greenhouse','corniverse','Greenhouse Galaxy','A pane of glass around the entire universe.'],
];
const SYNERGIES:Upgrade[]=PAIRS.map(([low,high,name,flavour])=>({
 id:`syn-${low}-${high}`,name,flavour,group:'synergy',price:producerById[high].baseCost*60,
 effect:{kind:'synergy',low,high,lowPerHigh:0.05,highPerLow:0.001},req:{type:'pair',low,high,count:15},
}));
const GOLDEN_UPGRADES:Upgrade[]=[
 {id:'golden-1',name:'Shiny Husk Polish',flavour:'Golden cobs can see their reflection in it.',price:7.77e5,effect:{kind:'golden',freq:0.25,life:0.25,duration:0},req:{type:'golden',count:3},group:'golden'},
 {id:'golden-2',name:'Golden Almanac',flavour:'Predicts golden weather with 77% accuracy.',price:7.77e8,effect:{kind:'golden',freq:0,life:0,duration:0.25},req:{type:'golden',count:7},group:'golden'},
 {id:'golden-3',name:'Midas Mulch',flavour:'Everything it touches turns golden, including some cobs.',price:7.77e11,effect:{kind:'golden',freq:0.25,life:0,duration:0},req:{type:'golden',count:27},group:'golden'},
];
const BUTTER:Upgrade[]=[
 {id:'churn-1',name:'Hand Churn',flavour:'Achievements now come with a side of butter.',price:9e6,effect:{kind:'butter',perAchievement:0.5},req:{type:'achievements',count:12},group:'butter'},
 {id:'churn-2',name:'Barrel Churn',flavour:'A bigger barrel for a bigger bonus.',price:9e9,effect:{kind:'butter',perAchievement:1},req:{type:'achievements',count:22},group:'butter'},
 {id:'churn-3',name:'Electric Churn',flavour:'Whirrs at the speed of indulgence.',price:9e12,effect:{kind:'butter',perAchievement:1.5},req:{type:'achievements',count:32},group:'butter'},
 {id:'churn-4',name:'Industrial Creamery',flavour:'Rivers of butter, carefully regulated.',price:9e16,effect:{kind:'butter',perAchievement:2},req:{type:'achievements',count:42},group:'butter'},
 {id:'churn-5',name:'Cosmic Dairy',flavour:'The Milky Way was just the start.',price:9e20,effect:{kind:'butter',perAchievement:3},req:{type:'achievements',count:52},group:'butter'},
];
const FEATURES:Upgrade[]=[
 {id:'feature-garden',name:'Kitchen Garden Plot',flavour:'A little plot to grow rare varieties by hand.',price:2.5e6,effect:{kind:'unlock',feature:'garden'},req:{type:'owned',producer:'greenhouse',count:1},group:'feature'},
 {id:'feature-scarecrow',name:'Adopt a Scarecrow',flavour:'He guards the farm and has opinions about it.',price:4e7,effect:{kind:'unlock',feature:'scarecrow'},req:{type:'owned',producer:'irrigation',count:1},group:'feature'},
 {id:'feature-festival',name:'Village Fair Permit',flavour:'Bunting, brass bands and very competitive husking.',price:6e8,effect:{kind:'unlock',feature:'festival'},req:{type:'owned',producer:'factory',count:1},group:'feature'},
 {id:'feature-cornpocalypse',name:'Forbidden Fertiliser',flavour:'The label says "do not". The label is very small.',price:6e18,effect:{kind:'unlock',feature:'cornpocalypse'},req:{type:'owned',producer:'cloner',count:1},group:'feature'},
];
export const UPGRADES:Upgrade[]=[...producerUpgrades(),...CLICK_UPGRADES,...MANY_HANDS,...GLOBALS,...SYNERGIES,...GOLDEN_UPGRADES,...BUTTER,...FEATURES];
export const upgradeById=new Map(UPGRADES.map(u=>[u.id,u]));

// ───────────────────────── Golden cobs ─────────────────────────
export type GoldenKind='lucky'|'bumper'|'storm';
export const GOLDEN={
 /** Seconds between spawns (uniform) before frequency bonuses divide them. */
 minDelay:150,maxDelay:330,firstDelay:[60,120] as [number,number],
 lifetime:13,
 /** Lucky payout: min(bank × fraction, production × seconds) + flat. */
 luckyBankFraction:0.15,luckySeconds:900,luckyFlat:13,
 effects:{
  lucky:{weight:46,name:'Lucky Harvest',desc:'Instant kernels: 15% of your bank, up to 15 minutes of production.'},
  bumper:{weight:44,name:'Bumper Crop',desc:'Production ×7 for 77 seconds.',mult:7,duration:77},
  storm:{weight:10,name:'Kernel Storm',desc:'Each click ×777 for 13 seconds.',mult:777,duration:13},
 },
} as const;

// ───────────────────────── Achievements ─────────────────────────
export type AchievementCheck=
 |{type:'clicks'|'runEarned'|'lifeEarned'|'cps'|'ownTotal'|'golden'|'upgrades'|'replants'|'seedsClaimed'|'harvests'|'mutations'|'discovered'|'pests'|'festivals'|'planted'|'offline'|'skinsChanged'|'clickBurst'|'clickEarned';target:number}
 |{type:'own';producer:ProducerId;target:number};
export interface Achievement {id:string;name:string;desc:string;check:AchievementCheck;secret?:boolean}
const OWN_NAMES:Record<ProducerId,string>={farmhand:'Hired Help',patch:'Patchwork Quilt',field:'Field Day',tractor:'Tractor Beam',combine:'Combine and Conquer',greenhouse:'Glass Half Full',irrigation:'Pipe Dreams',factory:'Factory Settings',lab:'Lab Rats',hydroponic:'Tower of Flower',robot:'Do Androids Dream of Electric Corn?',weather:'Under the Weather',megafarm:'Deep Roots',orbital:'Space Cadet',lunar:'Over the Moon',cloner:'Seeing Double',time:'Timeless Classic',dimension:'Interdimensional Cable Corn',singularity:'Event Horizon Harvest',corniverse:'Corn of Everything'};
const tiers=(type:'runEarned'|'cps',values:number[],names:string[],unit:string):Achievement[]=>values.map((target,i)=>({id:`${type}-${i}`,name:names[i],check:{type,target},desc:type==='cps'?`Produce ${unit} ${target.toExponential(0).replace('e+','e')} kernels per second.`:`Harvest ${target.toExponential(0).replace('e+','e')} kernels in one run.`}));
export const ACHIEVEMENTS:Achievement[]=[
 {id:'click-1',name:'First Pick',desc:'Click the cob once.',check:{type:'clicks',target:1}},
 {id:'click-2',name:'Getting a Grip',desc:'Click the cob 100 times.',check:{type:'clicks',target:100}},
 {id:'click-3',name:'Repetitive Strain Harvest',desc:'Click the cob 1,000 times.',check:{type:'clicks',target:1000}},
 {id:'click-4',name:'Ten Thousand Taps',desc:'Click the cob 10,000 times.',check:{type:'clicks',target:10000}},
 {id:'click-5',name:'The Clicking Never Stops',desc:'Click the cob 50,000 times.',check:{type:'clicks',target:50000}},
 {id:'clickearn-1',name:'Hands-On Farming',desc:'Earn 1 million kernels by clicking (lifetime).',check:{type:'clickEarned',target:1e6}},
 {id:'clickearn-2',name:'Artisanal Harvest',desc:'Earn 1 trillion kernels by clicking (lifetime).',check:{type:'clickEarned',target:1e12}},
 {id:'burst',name:'Kernel Panic',desc:'Click 15 times in under two seconds.',check:{type:'clickBurst',target:15},secret:true},
 ...tiers('runEarned',[1e2,1e4,1e6,1e9,1e12,1e15,1e18,1e21,1e24,1e30],['A Handful','A Bucketful','A Barnful','Silo Shaped','Grain Elevator','Corn Mountain','Continental Crop','Planetary Pantry','Stellar Stockpile','Popcorn Big Bang'],''),
 ...tiers('cps',[10,1e3,1e6,1e9,1e12,1e15],['Steady Trickle','Kernel Creek','Maize River','Corn Cascade','Torrent of Cobs','Cosmic Firehose'],''),
 ...PRODUCERS.map(p=>({id:`own-${p.id}`,name:OWN_NAMES[p.id],desc:`Own 50 ${p.plural}.`,check:{type:'own' as const,producer:p.id,target:50}})),
 {id:'total-1',name:'Small Holding',desc:'Own 100 producers in total.',check:{type:'ownTotal',target:100}},
 {id:'total-2',name:'Agribusiness',desc:'Own 500 producers in total.',check:{type:'ownTotal',target:500}},
 {id:'total-3',name:'Corn Conglomerate',desc:'Own 1,000 producers in total.',check:{type:'ownTotal',target:1000}},
 {id:'upgrades-1',name:'Tinkerer',desc:'Buy 10 upgrades in one run.',check:{type:'upgrades',target:10}},
 {id:'upgrades-2',name:'Improver',desc:'Buy 50 upgrades in one run.',check:{type:'upgrades',target:50}},
 {id:'golden-1',name:'Fool\'s Gold? No, Real Gold',desc:'Collect a golden cob.',check:{type:'golden',target:1}},
 {id:'golden-2',name:'Lucky Seven',desc:'Collect 7 golden cobs.',check:{type:'golden',target:7}},
 {id:'golden-3',name:'Gold Rush',desc:'Collect 27 golden cobs.',check:{type:'golden',target:27}},
 {id:'golden-4',name:'King Midas Farms',desc:'Collect 77 golden cobs.',check:{type:'golden',target:77}},
 {id:'garden-1',name:'Green Fingers',desc:'Plant something in the garden.',check:{type:'planted',target:1}},
 {id:'garden-2',name:'Home Grown',desc:'Harvest 10 garden plants.',check:{type:'harvests',target:10}},
 {id:'garden-3',name:'It\'s Alive!',desc:'Discover a variety through mutation.',check:{type:'mutations',target:1}},
 {id:'garden-4',name:'Complete Collection',desc:'Discover all 8 corn varieties.',check:{type:'discovered',target:8}},
 {id:'prestige-1',name:'Fresh Furrows',desc:'Replant for the first time.',check:{type:'replants',target:1}},
 {id:'prestige-2',name:'Crop Rotation',desc:'Replant 5 times.',check:{type:'replants',target:5}},
 {id:'prestige-3',name:'Seed Bank',desc:'Claim 100 Golden Seeds in total.',check:{type:'seedsClaimed',target:100}},
 {id:'prestige-4',name:'Seed Vault',desc:'Claim 2,500 Golden Seeds in total.',check:{type:'seedsClaimed',target:2500}},
 {id:'festival-1',name:'Fun at the Fair',desc:'Enjoy a harvest festival.',check:{type:'festivals',target:1}},
 {id:'festival-2',name:'Festival Regular',desc:'Enjoy 10 harvest festivals.',check:{type:'festivals',target:10}},
 {id:'pests-1',name:'Pest Control',desc:'Pop a mutant pest.',check:{type:'pests',target:1}},
 {id:'pests-2',name:'Exterminator Extraordinaire',desc:'Pop 50 mutant pests.',check:{type:'pests',target:50}},
 {id:'offline-1',name:'Farming in My Sleep',desc:'Return to offline earnings.',check:{type:'offline',target:1}},
 {id:'skin-1',name:'Dress Up',desc:'Change your cob\'s skin.',check:{type:'skinsChanged',target:1}},
];
export const achievementById=new Map(ACHIEVEMENTS.map(a=>[a.id,a]));
/** Production bonus per achievement, before churn upgrades (percent). */
export const BUTTER_BASE_PER_ACHIEVEMENT=1;
export interface Skin {id:SkinId;name:string;achievements:number}
export const SKINS:Skin[]=[
 {id:'classic',name:'Classic Gold',achievements:0},{id:'butter',name:'Butter Glaze',achievements:5},
 {id:'ruby',name:'Ruby Red',achievements:10},{id:'bluemoon',name:'Blue Moon',achievements:18},
 {id:'prism',name:'Prism Gem',achievements:26},{id:'frost',name:'Hoarfrost',achievements:34},
 {id:'midnight',name:'Midnight Sky',achievements:44},{id:'golden',name:'Solid Gold',achievements:55},
];

// ───────────────────────── Prestige ─────────────────────────
export const PRESTIGE={
 /** Total seeds ever available = floor(cbrt(lifetime kernels earned / unit)). */
 seedUnit:1e9,
 /** Permanent production bonus per seed ever claimed (spending seeds keeps it). */
 bonusPerSeed:0.04,
 offlineBaseHours:8,offlineBaseRate:0.5,
};
export type PermEffect=
 |{kind:'click';mult:number}|{kind:'clickCps';fraction:number}|{kind:'stormDuration';pct:number}
 |{kind:'start';producers:Partial<Record<ProducerId,number>>}|{kind:'offlineHours';hours:number}|{kind:'offlineRate';rate:number}
 |{kind:'global';pct:number}|{kind:'producerDiscount';pct:number}|{kind:'upgradeDiscount';pct:number}
 |{kind:'goldenFreq';pct:number}|{kind:'goldenLife';pct:number}|{kind:'goldenDuration';pct:number}|{kind:'goldenTwin';chance:number}
 |{kind:'gardenGrowth';pct:number}|{kind:'scarecrowSlot'}|{kind:'festivalFreq';pct:number}|{kind:'butter';pct:number}|{kind:'keepUpgrades';group:UpgradeGroup};
export type PermPath='active'|'idle'|'golden'|'general';
export interface PermUpgrade {id:string;name:string;desc:string;cost:number;path:PermPath;effect:PermEffect;requires?:string}
export const PERMS:PermUpgrade[]=[
 {id:'green-thumbs',name:'Green Thumbs',desc:'Clicks are worth ×2.',cost:1,path:'active',effect:{kind:'click',mult:2}},
 {id:'seedling-start',name:'Seedling Start',desc:'Begin every replant with 10 Farmhands and 5 Corn Patches.',cost:3,path:'idle',effect:{kind:'start',producers:{farmhand:10,patch:5}}},
 {id:'long-lunch',name:'Long Lunch',desc:'Offline allowance +4 hours (8 → 12 hours).',cost:2,path:'idle',effect:{kind:'offlineHours',hours:4}},
 {id:'clover-seeds',name:'Four-Leaf Seeds',desc:'Golden cobs appear 15% more often.',cost:4,path:'golden',effect:{kind:'goldenFreq',pct:15}},
 {id:'compost',name:'Compost Heap',desc:'All production +10%.',cost:5,path:'general',effect:{kind:'global',pct:10}},
 {id:'callused-palms',name:'Callused Palms',desc:'Each click also earns 1% of your production.',cost:5,path:'active',effect:{kind:'clickCps',fraction:0.01},requires:'green-thumbs'},
 {id:'heirloom',name:'Heirloom Seeds',desc:'Garden plants grow 25% faster.',cost:6,path:'general',effect:{kind:'gardenGrowth',pct:25}},
 {id:'lingering-shine',name:'Lingering Shine',desc:'Golden cobs stay on screen 50% longer.',cost:8,path:'golden',effect:{kind:'goldenLife',pct:50},requires:'clover-seeds'},
 {id:'night-shift',name:'Night Shift',desc:'Offline production 50% → 75%.',cost:10,path:'idle',effect:{kind:'offlineRate',rate:0.75},requires:'long-lunch'},
 {id:'festival-planner',name:'Festival Planner',desc:'Harvest festivals come around 40% sooner.',cost:12,path:'general',effect:{kind:'festivalFreq',pct:40}},
 {id:'steady-hands',name:'Steady Hands',desc:'Kernel Storm lasts 50% longer.',cost:15,path:'active',effect:{kind:'stormDuration',pct:50},requires:'callused-palms'},
 {id:'producer-discount',name:'Bulk Buyer\'s Club',desc:'Producers cost 5% less.',cost:20,path:'idle',effect:{kind:'producerDiscount',pct:5}},
 {id:'long-boosts',name:'Long Golden Hour',desc:'Golden cob effects last 20% longer.',cost:25,path:'golden',effect:{kind:'goldenDuration',pct:20},requires:'lingering-shine'},
 {id:'upgrade-discount',name:'Haggling Lessons',desc:'Upgrades cost 10% less.',cost:30,path:'general',effect:{kind:'upgradeDiscount',pct:10}},
 {id:'butter-vault',name:'Butter Vault',desc:'Butter Bonus from achievements +50%.',cost:35,path:'general',effect:{kind:'butter',pct:50}},
 {id:'deep-storage',name:'Deep Storage',desc:'Offline allowance +16 hours.',cost:40,path:'idle',effect:{kind:'offlineHours',hours:16},requires:'night-shift'},
 {id:'golden-touch',name:'Golden Touch',desc:'Clicks are worth ×3.',cost:50,path:'active',effect:{kind:'click',mult:3},requires:'steady-hands'},
 {id:'rich-soil',name:'Rich Soil',desc:'All production +25%.',cost:50,path:'general',effect:{kind:'global',pct:25},requires:'compost'},
 {id:'scarecrow-pact',name:'Scarecrow Pact',desc:'Your scarecrow can hold two bonuses at once.',cost:60,path:'general',effect:{kind:'scarecrowSlot'}},
 {id:'golden-twins',name:'Golden Twins',desc:'Collected golden cobs have a 10% chance to drop a twin.',cost:100,path:'golden',effect:{kind:'goldenTwin',chance:0.1},requires:'long-boosts'},
 {id:'full-night-shift',name:'Night Owls',desc:'Offline production 75% → 100%.',cost:150,path:'idle',effect:{kind:'offlineRate',rate:1},requires:'deep-storage'},
 {id:'corn-reflexes',name:'Corn Reflexes',desc:'Each click also earns 3% more of your production.',cost:200,path:'active',effect:{kind:'clickCps',fraction:0.03},requires:'golden-touch'},
];
export const permById=new Map(PERMS.map(p=>[p.id,p]));

// ───────────────────────── Garden ─────────────────────────
export type GardenEffect='production'|'click'|'goldenFreq'|'goldenDuration'|'harvest';
export interface Variety {id:VarietyId;name:string;growSeconds:number;effect:GardenEffect;pct:number;plantSeconds:number;harvestMult:number;parents?:[VarietyId,VarietyId];mutationChance:number;desc:string}
/** Plant cost = production × plantSeconds (minimum 50 kernels); a ripe harvest returns that cost × harvestMult, fixed at planting. */
export const VARIETIES:Variety[]=[
 {id:'sweet',name:'Golden Sweetcorn',growSeconds:120,effect:'production',pct:2,plantSeconds:30,harvestMult:1.4,mutationChance:0,desc:'The dependable classic. Mature plants add +2% production.'},
 {id:'popcorn',name:'Pop-Pop Popcorn',growSeconds:180,effect:'click',pct:5,plantSeconds:60,harvestMult:1.5,parents:['sweet','sweet'],mutationChance:0.12,desc:'Pops with enthusiasm. Mature plants add +5% click power.'},
 {id:'bluemoon',name:'Blue Moon Maize',growSeconds:240,effect:'goldenFreq',pct:3,plantSeconds:120,harvestMult:1.5,parents:['sweet','popcorn'],mutationChance:0.1,desc:'Only ripens once in a blue moon. Mature plants make golden cobs 3% more frequent.'},
 {id:'candy',name:'Candy Stripe',growSeconds:300,effect:'harvest',pct:0,plantSeconds:300,harvestMult:2,parents:['sweet','bluemoon'],mutationChance:0.08,desc:'Grown for its harvest: pays back double its planting cost.'},
 {id:'ghost',name:'Ghost Corn',growSeconds:360,effect:'goldenDuration',pct:5,plantSeconds:240,harvestMult:1.6,parents:['bluemoon','bluemoon'],mutationChance:0.07,desc:'Barely there. Mature plants make golden effects last 5% longer.'},
 {id:'ember',name:'Ember Maize',growSeconds:360,effect:'click',pct:8,plantSeconds:240,harvestMult:1.6,parents:['popcorn','candy'],mutationChance:0.06,desc:'Warm to the touch. Mature plants add +8% click power.'},
 {id:'prism',name:'Prism Kernel',growSeconds:480,effect:'production',pct:4,plantSeconds:360,harvestMult:1.8,parents:['candy','bluemoon'],mutationChance:0.05,desc:'Every kernel a tiny gemstone. Mature plants add +4% production.'},
 {id:'starcob',name:'Starcob',growSeconds:720,effect:'goldenFreq',pct:6,plantSeconds:600,harvestMult:2,parents:['prism','ghost'],mutationChance:0.04,desc:'Grown from fallen starlight. Mature plants make golden cobs 6% more frequent.'},
];
export const varietyById=Object.fromEntries(VARIETIES.map(v=>[v.id,v])) as Record<VarietyId,Variety>;
export const GARDEN={size:3,bigSize:4,bigSizeGreenhouses:50,mutationInterval:10};

// ───────────────────────── Festivals, scarecrow, pests ─────────────────────────
export type FestivalId='husking'|'parade'|'butter';
export const FESTIVALS:Record<FestivalId,{name:string;desc:string;click:number;production:number;goldenFreq:number}>={
 husking:{name:'Husking Bee',desc:'Clicks ×3 while the brass band plays.',click:3,production:1,goldenFreq:1},
 parade:{name:'Popcorn Parade',desc:'Golden cobs appear 2.5× as often.',click:1,production:1,goldenFreq:2.5},
 butter:{name:'Butter Bash',desc:'All production ×1.5.',click:1,production:1.5,goldenFreq:1},
};
export const FESTIVAL={minDelay:900,maxDelay:1500,duration:150};
export type ScarecrowBonus='watchful'|'flapper'|'lucky'|'guard'|'gardener';
export const SCARECROW:Record<ScarecrowBonus,{name:string;desc:string;hat:'straw'|'top'|'wizard'}>={
 watchful:{name:'Watchful Eyes',desc:'All production +5%.',hat:'straw'},
 flapper:{name:'Arm Flapper',desc:'Click power +15%.',hat:'straw'},
 lucky:{name:'Lucky Hat',desc:'Golden cobs appear 15% more often.',hat:'top'},
 guard:{name:'Pest Guard',desc:'Mutant pests siphon half as much.',hat:'top'},
 gardener:{name:'Garden Gnome Mode',desc:'Garden plants grow 30% faster.',hat:'wizard'},
};
export const SCARECROW_COOLDOWN=60;
export const PESTS={minDelay:80,maxDelay:160,max:8,siphon:0.05,payout:1.25};

// ───────────────────────── News ticker ─────────────────────────
export interface News {text:string;after?:ProducerId;minClicks?:number}
export const NEWS:News[]=[
 {text:'Local farmer insists the cob "looked at her funny". Experts unconcerned.'},
 {text:'Area child asks where corn comes from. Answer: "from clicking".'},
 {text:'Popcorn futures up 3% on rumours of a really good film this weekend.'},
 {text:'Weather forecast: sunny, with a 40% chance of kernels.'},
 {text:'Village council debates renaming the village "Cobsworth". Motion passes unanimously.'},
 {text:'Crow union files formal complaint about the new scarecrow\'s attitude.',after:'irrigation'},
 {text:'Farmhands vote to replace morning tea with morning corn.',after:'farmhand'},
 {text:'"I\'ve never seen so many patches," says patch inspector, adjusting patch.',after:'patch'},
 {text:'Cornfield reports "rustling noises". Investigators conclude: wind, probably.',after:'field'},
 {text:'Tractor sets land speed record for "slightly faster than walking".',after:'tractor'},
 {text:'Combine harvester spotted reading a self-help book titled "Reap What You Sow".',after:'combine'},
 {text:'Greenhouse tomatoes evicted to make room for more corn. Tomatoes "devastated".',after:'greenhouse'},
 {text:'Irrigation network now more complex than the city\'s actual plumbing.',after:'irrigation'},
 {text:'Corn factory accidentally produces one (1) carrot. Line halted for an inquiry.',after:'factory'},
 {text:'Lab breakthrough: corn that grows ON corn. Ethics board asks for a minute.',after:'lab'},
 {text:'Hydroponic tower so tall it now has its own weather. And its own corn.',after:'hydroponic'},
 {text:'Robots ask for weekends off. Granted: they now harvest at the weekend for fun.',after:'robot'},
 {text:'Weather station schedules a light drizzle for 3:15pm. It arrives at 3:15pm.',after:'weather'},
 {text:'Moles report record job satisfaction in the underground megafarm.',after:'megafarm'},
 {text:'Astronauts complain that every space meal is now corn. Every. Single. One.',after:'orbital'},
 {text:'The man in the moon has been replaced by the corn in the moon.',after:'lunar'},
 {text:'Corn cloner clones itself. The two cloners are not on speaking terms.',after:'cloner'},
 {text:'Time harvester brings back corn from 2087. Tastes "futuristic, a bit beige".',after:'time'},
 {text:'Dimensional farm opens portal to a universe made entirely of butter. Negotiations underway.',after:'dimension'},
 {text:'Physicists confirm the corn singularity "smells delicious, please stop".',after:'singularity'},
 {text:'The Corniverse expands. Somewhere, a single kernel says "pop".',after:'corniverse'},
 {text:'Nutritionists warn that eating "this much corn" is "a lot of corn".',after:'tractor'},
 {text:'Local bakery replaces all flour with cornflour. Customers notice nothing; everything is cornbread now.',after:'factory'},
 {text:'Shares in butter soar as Corn Clicker exports reach the neighbouring county.',after:'combine'},
 {text:'Cob-shaped cloud spotted over the farm. Meteorologists blame "the vibes".'},
 {text:'Finger-strengthening classes fully booked for the rest of the year.',minClicks:200},
 {text:'Interview: "I just clicked it and corn came out," says modest farmer.',minClicks:50},
 {text:'Seagulls form an orderly queue outside the barn. Experts baffled.'},
 {text:'Corn maze so large it has its own postcode and two lost tourists from 2019.',after:'field'},
 {text:'Report: 9 out of 10 dentists recommend flossing after this much corn.',after:'greenhouse'},
 {text:'Popcorn sales up at the cinema. Cinema now mostly a popcorn venue with occasional films.',after:'factory'},
 {text:'Golden cob sighting causes stampede of excited farmhands. No injuries, many kernels.'},
 {text:'Scientists discover new subatomic particle: the "kernelon".',after:'lab'},
 {text:'Galactic council recognises corn as the official currency of the Orion arm.',after:'orbital'},
 {text:'Mutant pests demand representation. Granted a small, sticky seat at the table.',after:'cloner'},
 {text:'Village fair judges award the giant marrow prize to a cob. Marrows protest.',after:'factory'},
 {text:'Historians agree: the first kernel was clicked by somebody, somewhere.'},
];
