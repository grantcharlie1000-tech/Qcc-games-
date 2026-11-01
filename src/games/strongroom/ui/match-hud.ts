import {GUNS,type Entity} from '../sim';
import {hudSymbols,matchMarkup} from './hud-markup';
import './match-hud.css';

export interface MatchPresentation{
 phase:string;round:number;scores:[number,number];timer:number;
 objective?:{site?:string;revealed?:boolean;carrier?:number|null;planted?:boolean;progress?:number;actor?:number|null;disabled?:boolean};
}
/** DOM reads are cached at construction. Values are only written when changed. */
export class MatchHUD{
 readonly root:HTMLElement;readonly controls:HTMLElement;readonly toast:HTMLElement;readonly feed:HTMLOListElement;
 private nodes=new Map<string,HTMLElement>();private values=new Map<string,string>();private rosterKey='';
 private toastTimer:ReturnType<typeof setTimeout>|undefined;private hitTimer:ReturnType<typeof setTimeout>|undefined;
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
 hit(){if(this.hitTimer)clearTimeout(this.hitTimer);const r=this.nodes.get('.reticle')!;r.classList.remove('fading');r.classList.add('hit');this.hitTimer=setTimeout(()=>{r.classList.add('fading');r.classList.remove('hit');},180);}
 update(entities:Entity[],local:number|null,state:MatchPresentation){
  this.root.hidden=state.phase==='menu';if(this.root.hidden)return;const e=entities.find(e=>e.seat===local),team=e?.team??0,attacking=(e as (Entity&{attacking?:boolean})|undefined)?.attacking??e?.team===1;
  const seconds=Math.max(0,Math.ceil(state.timer));this.set('.timer',`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`);this.set('.round-clock .eyebrow',`ROUND ${String(state.round).padStart(2,'0')}`);
  this.set('.phase-text',({roundEnd:'ROUND END',gameEnd:'MATCH END',planted:'CRACKER ACTIVE'} as Record<string,string>)[state.phase]??state.phase.toUpperCase());this.set('.phase-detail',attacking?'ATTACK':'DEFEND');
  const scoreNodes=this.root.querySelectorAll<HTMLElement>('[data-role$="-score"]');for(let i=0;i<2;i++){const value=String(state.scores[i===0?team:1-team]);if(scoreNodes[i].textContent!==value)scoreNodes[i].textContent=value;}
  const roster=entities.map(p=>`${p.seat}:${p.team}:${p.hp>0}`).join('|')+team;
  if(roster!==this.rosterKey){this.rosterKey=roster;this.nodes.get('.round-bar')!.dataset.size=String(entities.filter(p=>p.team===team).length);for(const [index,node] of [...this.root.querySelectorAll('.operators')].entries()){node.replaceChildren();for(const p of entities.filter(p=>index===0?p.team===team:p.team!==team)){const badge=document.createElement('span');badge.className='operator'+(p.hp>0?'':' dead');badge.setAttribute('role','listitem');badge.setAttribute('aria-label',`${p.name}, ${p.hp>0?'active':'eliminated'}`);badge.innerHTML=`<svg class="icon" aria-hidden="true"><use href="#sr-i-${p.hp>0?['watch','signal','pulse'][p.seat%3]:'dead'}"/></svg>`;node.append(badge);}}}
  if(e){this.set('#hp-value',String(Math.max(0,Math.ceil(e.hp))));this.set('#armour-value','0');this.set('#ammo-value',String(e.ammo).padStart(2,'0'));this.set('#reserve-value',String(e.reserve));this.set('#mag-count',String(Math.ceil(e.reserve/GUNS[e.weapon].mag)));this.set('#gadget-count','0');this.set('.weapon-heading .eyebrow',GUNS[e.weapon].name.toUpperCase());this.nodes.get('.reload-status')!.classList.toggle('is-active',e.reload>0);this.set('.reload-status span:last-of-type',`${e.reload.toFixed(1)} S`);this.scale('.hp-bar i',e.hp/100);this.scale('.armour-bar i',0);this.root.dataset.critical=String(e.hp<=25);this.nodes.get('.hp-bar')!.setAttribute('aria-valuenow',String(e.hp));this.nodes.get('.armour-bar')!.setAttribute('aria-valuenow','0');}
  this.controls.hidden=!e||e.hp<=0||state.phase==='roundEnd'||state.phase==='gameEnd';
  const o=state.objective;this.set('.site',o?.revealed||!attacking?o?.site??'—':'?');
  this.set('#objective-title',o?o.disabled?'CRACKER DISABLED':o.planted?'CRACKER PLANTED':o.progress?'INTERACTING':o.carrier===local?'CARRYING CRACKER':o.carrier===null?'CRACKER DROPPED':'CRACKER SECURED':'TEAM ELIMINATION');
  this.set('#objective-detail',o?o.planted?(attacking?'HOLD THE STRONGROOM':'HOLD INTERACT TO DISABLE'):o.revealed||!attacking?(attacking?'REACH THE STRONGROOM':'SECURE THE STRONGROOM'):'OBJECTIVE UNKNOWN':'HARBOR');
  const progress=Math.round((o?.progress??0)*100);this.set('#plant-percent',`${progress}%`);this.nodes.get('#plant-percent')!.classList.toggle('is-active',progress>0);this.nodes.get('.plant-bar')!.classList.toggle('is-active',progress>0);this.scale('.plant-bar i',progress/100);
  const gap=e&&Math.hypot(e.vx,e.vz)>1?6:3,path=`M${32-gap} 36h4M${36+gap} 36h4M36 ${32-gap}v4M36 ${36+gap}v4`;if(this.values.get('reticle')!==path){this.values.set('reticle',path);for(const el of this.root.querySelectorAll('.crosshair-strokes'))el.setAttribute('d',path);for(const el of this.root.querySelectorAll('.hit-strokes'))el.setAttribute('d','M23 23l5 5M44 44l5 5M49 23l-5 5M28 44l-5 5');}
 }
 dispose(){clearTimeout(this.toastTimer);clearTimeout(this.hitTimer);}
}
