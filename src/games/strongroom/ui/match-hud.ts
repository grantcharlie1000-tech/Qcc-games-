import {type Entity} from '../sim';
import type {HUDMarker} from '../hud-markers';
import {gunFor,bodyFor} from '../loadouts';
import {hudSymbols,matchMarkup} from './hud-markup';
import './match-hud.css';

export interface MatchPresentation{
 phase:string;round:number;scores:[number,number];timer:number;
 objective?:{site?:string|null;revealed?:boolean;carrier?:number|null;state?:string;progress?:number;interaction?:'plant'|'disable'|null};
 winner?:0|1;tools?:unknown;aiming?:boolean;context?:{title:string;detail:string;progress:number;active:boolean};outcome?:string|null;map?:string;
}
/** DOM reads are cached at construction. Values are only written when changed. */
export class MatchHUD{
 readonly root:HTMLElement;readonly controls:HTMLElement;readonly toast:HTMLElement;readonly feed:HTMLOListElement;
 private nodes=new Map<string,HTMLElement>();private values=new Map<string,string>();private rosterKey='';
 private toastTimer:ReturnType<typeof setTimeout>|undefined;private hitTimer:ReturnType<typeof setTimeout>|undefined;
 private markers=new Map<number,HTMLElement>();
 constructor(parent:HTMLElement,onMenu:()=>void){
  parent.insertAdjacentHTML('beforeend',hudSymbols+matchMarkup);this.root=parent.querySelector('.sr-match-hud')!;this.root.hidden=true;
  for(const el of this.root.querySelectorAll<HTMLElement>('[id]'))this.nodes.set('#'+el.id,el);
  for(const selector of ['.timer','.round-clock .eyebrow','.phase-text','.phase-detail','.weapon-heading .eyebrow','.reload-status','.reload-status span:last-of-type','.hp-bar i','.armour-bar i','.hp-bar','.armour-bar','.plant-bar','.plant-bar i','.reticle','.round-bar','.site'])this.nodes.set(selector,this.root.querySelector(selector)!);
  this.controls=this.root.querySelector('.touch-controls')!;this.toast=this.root.querySelector('.toast')!;this.feed=this.root.querySelector('.kill-feed')!;this.toast.classList.add('is-hidden');
  this.root.querySelector('.menu-button')!.addEventListener('click',onMenu);
 }
 private set(selector:string,value:string){if(this.values.get(selector)===value)return;this.values.set(selector,value);this.nodes.get(selector)!.textContent=value;}
 private scale(selector:string,value:number){const key=selector+'scale',v=`scaleX(${Math.max(0,Math.min(1,value))})`;if(this.values.get(key)!==v){this.values.set(key,v);this.nodes.get(selector)!.style.transform=v;}}
 notice(text:string){if(this.toastTimer)clearTimeout(this.toastTimer);const node=this.toast.querySelector('span')!;if(node.textContent!==text)node.textContent=text;this.toast.classList.toggle('is-hidden',!text);if(text)this.toastTimer=setTimeout(()=>this.toast.classList.add('is-hidden'),2000);}
 hit(head=false,eliminated=false){if(this.hitTimer)clearTimeout(this.hitTimer);const r=this.nodes.get('.reticle')!;r.dataset.head=String(head);r.dataset.eliminated=String(eliminated);r.classList.remove('fading');r.classList.add('hit');this.hitTimer=setTimeout(()=>{r.classList.add('fading');r.classList.remove('hit');},180);}
 track(points:HUDMarker[]){
  for(const [seat,node]of this.markers)if(!points.some(p=>p.seat===seat)){node.remove();this.markers.delete(seat);}
  for(const p of points){let node=this.markers.get(p.seat);if(!node){node=document.createElement('span');node.className=p.kind==='cracker'?'sr-cracker-marker':'sr-spotted-marker';if(p.kind==='cracker')node.innerHTML='<svg class="icon" aria-hidden="true"><use href="#sr-i-gadget"/></svg><span></span>';else node.setAttribute('aria-label','Spotted opponent');this.root.append(node);this.markers.set(p.seat,node);}const left=p.x.toFixed(2)+'%',top=p.y.toFixed(2)+'%';if(node.style.left!==left)node.style.left=left;if(node.style.top!==top)node.style.top=top;if(p.kind==='cracker'){node.classList.toggle('is-edge',!!p.edge);const label=node.querySelector('span')!;if(label.textContent!==p.label)label.textContent=p.label??'';}}
 }
 update(entities:Entity[],local:number|null,state:MatchPresentation){
  this.root.hidden=state.phase==='menu';if(this.root.hidden)return;const e=entities.find(e=>e.seat===local),team=e?.team??0,attacking=(e as (Entity&{attacking?:boolean})|undefined)?.attacking??e?.team===1;
  const seconds=Math.max(0,Math.ceil(state.timer));this.set('.timer',`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`);this.set('.round-clock .eyebrow',`ROUND ${String(state.round).padStart(2,'0')}`);const roundLabel=`Round ${state.round}. Allies ${state.scores[team]}, opponents ${state.scores[1-team]}. ${seconds} seconds remaining.`;if(this.nodes.get('.round-bar')!.getAttribute('aria-label')!==roundLabel)this.nodes.get('.round-bar')!.setAttribute('aria-label',roundLabel);
  this.set('.phase-text',({roundEnd:'ROUND END',gameEnd:'MATCH END',planted:'CRACKER ACTIVE'} as Record<string,string>)[state.phase]??state.phase.toUpperCase());this.set('.phase-detail',e&&e.hp<=0?'OUT · WATCHING ALLY':attacking?'ATTACK':'DEFEND');
  const location=this.root.querySelector('.location');if(location){const title=state.map??'Customs House';const n=location.querySelector('.eyebrow')!,detail=location.querySelector('.location-name')!;if(n.textContent!==title.toUpperCase())n.textContent=title.toUpperCase();if(detail.textContent!=='STRONGROOM')detail.textContent='STRONGROOM';}
  const scoreNodes=this.root.querySelectorAll<HTMLElement>('[data-role$="-score"]');for(let i=0;i<2;i++){const value=String(state.scores[i===0?team:1-team]);if(scoreNodes[i].textContent!==value)scoreNodes[i].textContent=value;}
  const roster=entities.map(p=>`${p.seat}:${p.team}:${p.hp>0}:${p.operator}`).join('|')+team;
  if(roster!==this.rosterKey){this.rosterKey=roster;this.nodes.get('.round-bar')!.dataset.size=String(entities.filter(p=>p.team===team).length);for(const [index,node] of [...this.root.querySelectorAll('.operators')].entries()){node.replaceChildren();for(const p of entities.filter(p=>index===0?p.team===team:p.team!==team)){const badge=document.createElement('span');badge.className='operator'+(p.hp>0?'':' dead');badge.setAttribute('role','listitem');badge.setAttribute('aria-label',`${p.name}, ${p.hp>0?'active':'eliminated'}`);badge.innerHTML=`<svg class="icon" aria-hidden="true"><use href="#sr-i-${p.hp>0?({cinder:'watch',wren:'signal',hush:'pulse',latch:'assault',cadet:'shield'}as const)[p.operator]:'dead'}"/></svg>`;node.append(badge);}}}
  if(e){this.set('#hp-value',String(Math.max(0,Math.ceil(e.hp))));const armour=(e as Entity&{armour?:number}).armour??0;this.set('#armour-value',String(armour));this.set('#ammo-value',String(e.ammo).padStart(2,'0'));this.set('#reserve-value',String(e.reserve));this.set('#mag-count',String(Math.ceil(e.reserve/gunFor(e).mag)));const toolData=Array.isArray((state as any).tools)?(state as any).tools:null;const stock=toolData?.[4]?.find?.((row:number[])=>row[0]===e.seat);this.set('#gadget-count',String(stock?.[e.attacking?1:3]??2));this.set('.weapon-heading .eyebrow',gunFor(e).name.toUpperCase());const weaponIcon=this.root.querySelector('.weapon-heading use')!,icon=e.weapon===1?'#sr-i-pistol':'#sr-i-rifle';if(weaponIcon.getAttribute('href')!==icon)weaponIcon.setAttribute('href',icon);this.nodes.get('.reload-status')!.classList.toggle('is-active',e.reload>0);this.set('.reload-status span:last-of-type',`${e.reload.toFixed(1)} S`);this.scale('.hp-bar i',e.hp/bodyFor(e.operator).hp);this.scale('.armour-bar i',armour/50);this.root.dataset.critical=String(e.hp<=25);this.nodes.get('.hp-bar')!.setAttribute('aria-valuenow',String(e.hp));this.nodes.get('.hp-bar')!.setAttribute('aria-valuemax',String(bodyFor(e.operator).hp));this.nodes.get('.armour-bar')!.setAttribute('aria-valuenow',String(armour));}
  this.root.dataset.phase=state.phase;this.nodes.get('.reticle')!.hidden=!e||e.hp<=0||state.phase==='pick';const aim=this.root.querySelector('.touch-button.aim')!;if(aim.getAttribute('aria-pressed')!==String(!!state.aiming))aim.setAttribute('aria-pressed',String(!!state.aiming));
  const crouch=this.root.querySelector('.touch-button.crouch')!;if(crouch.getAttribute('aria-pressed')!==String(!!e?.crouch))crouch.setAttribute('aria-pressed',String(!!e?.crouch));
  const objectiveButton=this.root.querySelector<HTMLButtonElement>('.objective')!;objectiveButton.disabled=!state.context?.active;objectiveButton.setAttribute('aria-label',state.context?.title??'Cracker status');const use=objectiveButton.querySelector('use')!;use.setAttribute('href',state.context?.active?'#sr-i-interact':'#sr-i-gadget');
  const result=this.root.querySelector<HTMLElement>('.sr-round-result')!;result.hidden=state.phase!=='roundEnd';if(!result.hidden){const won=state.winner===team;result.dataset.won=String(won);const title=won?'ALLIES WIN':'OPPONENTS WIN',reasons:Record<string,string>={detonated:'CRACKER COMPLETE',defendersEliminated:'DEFENDERS ELIMINATED',attackersEliminated:'ATTACKERS ELIMINATED',timeout:'TIME EXPIRED',disabled:'CRACKER DISABLED'};const a=result.querySelector('strong')!,b=result.querySelector('span')!;if(a.textContent!==title)a.textContent=title;const text=reasons[state.outcome??'']??'ROUND COMPLETE';if(b.textContent!==text)b.textContent=text;}
  this.controls.hidden=state.phase==='pick'||!e||e.hp<=0||state.phase==='roundEnd'||state.phase==='gameEnd';
  const o=state.objective;this.set('.site',o?.revealed||!attacking?o?.site??'—':'?');
  const title=o?o.state==='disabled'?'CRACKER DISABLED':o.state==='planted'?'CRACKER PLANTED':o.progress?'INTERACTING':o.carrier===local?'CARRYING CRACKER':o.carrier===null?'CRACKER DROPPED':'CRACKER SECURED':'TEAM ELIMINATION';
  const detail=o?o.state==='planted'?(attacking?'HOLD THE STRONGROOM':'HOLD INTERACT TO DISABLE'):o.revealed||!attacking?(attacking?'REACH THE STRONGROOM':'SECURE THE STRONGROOM'):'OBJECTIVE UNKNOWN':state.map?.toUpperCase()??'CUSTOMS HOUSE';
  this.set('#objective-title',state.context?.title??title);this.set('#objective-detail',state.context?.detail??detail);
  const progress=Math.round((state.context?.progress??((o?.progress??0)/(o?.interaction==='disable'?6:5)))*100);this.set('#plant-percent',`${progress}%`);this.nodes.get('#plant-percent')!.classList.toggle('is-active',progress>0);this.nodes.get('.plant-bar')!.classList.toggle('is-active',progress>0);this.scale('.plant-bar i',progress/100);this.nodes.get('.plant-bar')!.setAttribute('aria-valuenow',String(progress));
  const gap=e&&Math.hypot(e.vx,e.vz)>1?6:3,path=`M${32-gap} 36h4M${36+gap} 36h4M36 ${32-gap}v4M36 ${36+gap}v4`;if(this.values.get('reticle')!==path){this.values.set('reticle',path);for(const el of this.root.querySelectorAll('.crosshair-strokes'))el.setAttribute('d',path);for(const el of this.root.querySelectorAll('.hit-strokes'))el.setAttribute('d','M23 23l5 5M44 44l5 5M49 23l-5 5M28 44l-5 5');}
 }
 dispose(){clearTimeout(this.toastTimer);clearTimeout(this.hitTimer);}
}
