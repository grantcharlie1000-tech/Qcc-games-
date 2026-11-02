import {allowedLoadout,GUN_CATALOG,OPERATORS,type GunId,type OperatorId} from '../loadouts';
export interface PickPlayer{seat:number;team:0|1;sideVote?:'attack'|'defend'|null;attacking:boolean;operator:OperatorId;primary:GunId;secondary:GunId;spawnChoice:'quay'|'yard';siteVote:'A'|'B';locked:boolean}
export interface PickRequest{operator?:OperatorId;primary?:GunId;secondary?:GunId;spawnChoice?:'quay'|'yard';siteVote?:'A'|'B';locked?:boolean}
const icons:Record<OperatorId,string>={cinder:'watch',wren:'signal',hush:'pulse',latch:'assault',cadet:'shield'};
/** A selection surface, independent of pause sheets: the host Pick clock keeps running. */
export class PickScreen{
 readonly root=document.createElement('section');private key='';private player:PickPlayer|null=null;
 constructor(parent:HTMLElement,private choose:(pick:PickRequest)=>void,private side:(side:'attack'|'defend')=>void){this.root.className='sr-pick ui-glass-sheet';this.root.hidden=true;this.root.setAttribute('aria-label','Choose your operator');parent.append(this.root);}
 update(player:PickPlayer|undefined,phase:string,round:number,stage:string,timer:number,overtime:boolean,sideVoteTeam:number|null){
  this.root.hidden=phase!=='pick'||!player;if(this.root.hidden||!player)return;this.player=player;
  const key=[round,stage,player.attacking,player.operator,player.primary,player.secondary,player.spawnChoice,player.siteVote,player.locked,sideVoteTeam,player.sideVote].join('/');
  if(key!==this.key){this.key=key;this.render(player,stage,overtime,player.team===sideVoteTeam);}
  const t=this.root.querySelector('.sr-pick-clock')!;const text=`${Math.max(0,Math.ceil(timer))} S`;if(t.textContent!==text)t.textContent=text;
 }
 private render(p:PickPlayer,stage:string,overtime:boolean,canVote:boolean){
  const heading=`${overtime?'DECIDER · ':''}${stage==='side'?'CHOOSE YOUR SIDE':p.attacking?'ATTACK THE STRONGROOM':'HOLD THE STRONGROOM'}`;
  this.root.innerHTML=`<header class="sr-pick-head"><div><p class="sr-eyebrow">CUSTOMS HOUSE</p><h2>${heading}</h2></div><strong class="sr-pick-clock"></strong></header>`;
  if(stage==='side'){const row=document.createElement('div');row.className='sr-side-pick';for(const s of ['attack','defend'] as const){const b=document.createElement('button');b.className='ui-tab arcade-glass glass-control';b.textContent=s==='attack'?'Attack':'Defend';b.disabled=!canVote;b.setAttribute('aria-pressed',String(p.sideVote===s));b.addEventListener('click',()=>this.side(s));row.append(b);}const text=document.createElement('p');text.className='muted';text.textContent=canVote?'Your team chooses its side.':'Opponents are choosing their side.';this.root.append(text,row);return;}
  const grid=document.createElement('div');grid.className='sr-pick-grid';const roster=document.createElement('div');roster.className='sr-operator-cards';
  for(const id of (p.attacking?['cinder','wren','cadet']:['hush','latch','cadet']) as OperatorId[]){const op=OPERATORS[id],b=document.createElement('button');b.className='sr-operator-card ui-tab arcade-glass glass-control';b.setAttribute('aria-pressed',String(id===p.operator));b.setAttribute('aria-label',`Choose ${op.name}`);b.innerHTML=`<svg class="sr-operator-mark" aria-hidden="true"><use href="#sr-i-${icons[id]}"/></svg><strong>${op.name}</strong><span>${op.body}</span>`;b.disabled=p.locked;b.addEventListener('click',()=>this.choose({operator:id}));roster.append(b);}
  const form=document.createElement('div');form.className='sr-pick-loadout';const allowed=allowedLoadout(p.attacking,p.operator);
  for(const [label,field,ids] of [['Primary','primary',allowed.primaries],['Secondary','secondary',allowed.secondaries]] as const){const row=document.createElement('label'),select=document.createElement('select');row.textContent=label;select.setAttribute('aria-label',label);for(const id of ids){const option=document.createElement('option');option.value=id;option.textContent=GUN_CATALOG[id].name;select.append(option);}select.value=p[field];select.disabled=p.locked;select.addEventListener('change',()=>this.choose({[field]:select.value} as PickRequest));row.append(select);form.append(row);}
  const label=document.createElement('label'),select=document.createElement('select');label.textContent=p.attacking?'Approach':'Strongroom';select.setAttribute('aria-label',label.textContent);for(const [value,text] of p.attacking?[['quay','Quay · North'],['yard','Yard · South east']]:[['A','A · Records Vault'],['B','B · Cash Cage']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=p.attacking?p.spawnChoice:p.siteVote;select.disabled=p.locked;select.addEventListener('change',()=>this.choose(p.attacking?{spawnChoice:select.value as 'quay'|'yard'}:{siteVote:select.value as 'A'|'B'}));label.append(select);form.append(label);
  const lock=document.createElement('button');lock.className='ui-tab arcade-glass glass-control sr-pick-lock';lock.textContent=p.locked?'Locked in · waiting for team':'Lock in';lock.disabled=p.locked;lock.addEventListener('click',()=>this.choose({locked:true}));form.append(lock);grid.append(roster,form);this.root.append(grid);
 }
 dispose(){this.root.remove();}
}
