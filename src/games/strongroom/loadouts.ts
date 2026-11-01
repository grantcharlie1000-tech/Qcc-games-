export type GunId='ak47'|'m4a1'|'mp5'|'smg'|'awp'|'px12'|'glock'|'usp'|'deagle';
export type OperatorId='cinder'|'wren'|'hush'|'latch'|'cadet';
export interface LoadoutSelection{operator:OperatorId;primary:GunId;secondary:GunId}
export type BulletSource='rifle'|'smg'|'pistol'|'shotgun';
export interface Gun{
 id:GunId;model:string;name:string;source:BulletSource;damage:number;headshotMult:number;rpm:number;mag:number;reserve:number;reload:number;
 falloffStart:number;falloffEnd:number;falloffMinScale:number;spreadBase:number;adsFov:number;moveSpeedMult:number;penetration:number;
 semi:boolean;pellets:number;shellReload:boolean;spray:readonly {pitch:number;yaw:number}[];recovery:number;
}
/** Ten rounds climb four degrees for rifles or three for SMGs at recoil scale 1. */
function sprayPattern(degrees:number){return Array.from({length:30},(_,n)=>({pitch:(degrees*Math.PI/180)/10,yaw:n<5?0:Math.sin(n*.9)*.0018}));}
const gun=(id:GunId,model:string,name:string,source:BulletSource,damage:number,headshotMult:number,rpm:number,mag:number,reserve:number,reload:number,falloffStart:number,falloffEnd:number,falloffMinScale:number,spreadBase:number,adsFov:number,moveSpeedMult:number,penetration:number,semi=false,pellets=1,shellReload=false):Gun=>({id,model,name,source,damage,headshotMult,rpm,mag,reserve,reload,falloffStart,falloffEnd,falloffMinScale,spreadBase,adsFov,moveSpeedMult,penetration,semi,pellets,shellReload,spray:sprayPattern(source==='smg'?3:4),recovery:9});
export const GUN_CATALOG:Readonly<Record<GunId,Gun>>=Object.freeze({
 ak47:gun('ak47','ak47','KR-7 Rifle','rifle',41,4,600,30,120,2.7,20,40,.7,.006,58,.92,.9),
 m4a1:gun('m4a1','m4a1','TC-5 Carbine','rifle',34,4,720,30,150,2.6,22,40,.7,.005,58,.94,.85),
 mp5:gun('mp5','mp5','MX-9 SMG','smg',28,4.5,800,30,150,2.2,12,28,.6,.0045,62,1,.4),
 smg:gun('smg','smg','VK-10 SMG','smg',24,5.5,950,32,160,2.1,10,25,.6,.0055,62,1,.35),
 awp:gun('awp','awp','MR-4 Marksman','rifle',64,2.5,220,10,50,3,40,70,.85,.02,40,.88,.95,true),
 px12:gun('px12','pump','PX-12 Pump','shotgun',14,1.5,70,7,35,.55,5,15,.3,.045,66,.95,.2,false,8,true),
 glock:gun('glock','glock','P-9 Service','pistol',28,4.5,420,17,85,1.9,12,30,.55,.0035,66,1,.25,true),
 usp:gun('usp','usp','S-45 Suppressed','pistol',33,4,360,12,72,2,14,32,.55,.003,66,1,.3,true),
 deagle:gun('deagle','deagle','HC-50','pistol',56,2.5,160,7,42,2.3,18,40,.6,.0045,64,.98,.6,true),
});
export const GUN_IDS=Object.freeze(Object.keys(GUN_CATALOG) as GunId[]);
export const OPERATOR_IDS:readonly OperatorId[]=['cinder','wren','hush','latch','cadet'];
export const OPERATORS=Object.freeze({
 cinder:{name:'Cinder',side:'attack',body:'heavy'},wren:{name:'Wren',side:'attack',body:'light'},
 hush:{name:'Hush',side:'defend',body:'standard'},latch:{name:'Latch',side:'defend',body:'light'},cadet:{name:'Cadet',side:'both',body:'standard'},
} as const);
const allSecondaries:GunId[]=['glock','usp','deagle'];
export function allowedLoadout(attacking:boolean,operator:OperatorId):{primaries:GunId[];secondaries:GunId[]}{
 switch(operator){
  // PX-12 remains an authored stat entry, with the required first-primary fallback until M7 art.
  case 'cinder':return attacking?{primaries:['ak47'],secondaries:['glock','deagle']}:{primaries:[],secondaries:[]};
  case 'wren':return attacking?{primaries:['m4a1','awp'],secondaries:['glock','usp']}:{primaries:[],secondaries:[]};
  case 'hush':return attacking?{primaries:[],secondaries:[]}:{primaries:['smg'],secondaries:['usp','deagle']};
  case 'latch':return attacking?{primaries:[],secondaries:[]}:{primaries:['mp5','m4a1'],secondaries:['glock','usp']};
  case 'cadet':return{primaries:attacking?['ak47','m4a1','awp']:['mp5','smg','m4a1'],secondaries:[...allSecondaries]};
 }
}
export const defaultLoadout=(_attacking:boolean):LoadoutSelection=>({operator:'cadet',primary:'m4a1',secondary:'usp'});
export function validateLoadout(attacking:boolean,selection:unknown):LoadoutSelection|null{
 if(!selection||typeof selection!=='object')return null;
 const s=selection as LoadoutSelection;if(!OPERATOR_IDS.includes(s.operator))return null;
 const allowed=allowedLoadout(attacking,s.operator);
 return allowed.primaries.includes(s.primary)&&allowed.secondaries.includes(s.secondary)?{operator:s.operator,primary:s.primary,secondary:s.secondary}:null;
}
export function gunFor(entity:{weapon:number;primary?:GunId;secondary?:GunId}):Gun{return GUN_CATALOG[entity.weapon===1?entity.secondary??'usp':entity.primary??'m4a1'];}
export function damageAt(gun:Gun,distance:number,head:boolean){
 const t=Math.max(0,Math.min(1,(distance-gun.falloffStart)/(gun.falloffEnd-gun.falloffStart)));
 return Math.round(gun.damage*(1-t*(1-gun.falloffMinScale))*(head?gun.headshotMult:1));
}
export function bodyFor(operator:OperatorId|undefined){return operator==='cinder'?{hp:125,speed:.93}:operator==='wren'||operator==='latch'?{hp:100,speed:1.06}:{hp:112,speed:1};}
