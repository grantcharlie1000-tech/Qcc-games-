/**
 * Garden panel: plots, seed tray (tap-to-select or drag into a plot), selected-plot details and
 * the collection book. Pointer dragging and tapping share one code path; buttons keep it keyboard-accessible.
 */
import {plantSvg} from './art';
import {format} from './big';
import {VARIETIES,varietyById,type VarietyId} from './data';
import type {CornGame} from './model';
import {duration} from './text';

export interface GardenHost {
  game():CornGame;
  style():'short'|'long'|'scientific';
  feedback(kind:'plant'|'harvest'|'deny',text:string,at?:HTMLElement):void;
  changed():void;
}
const effectLabel=(id:VarietyId)=>{
  const v=varietyById[id];
  return v.effect==='harvest'?'Big harvest':v.effect==='production'?`+${v.pct}% production`:v.effect==='click'?`+${v.pct}% clicks`:v.effect==='goldenFreq'?`+${v.pct}% golden cobs`:`+${v.pct}% golden effect time`;
};

export class GardenView {
  private selectedSeed:VarietyId|null=null;
  private selectedPlot:number|null=null;
  private drag:{id:VarietyId;pointer:number;startX:number;startY:number;ghost?:HTMLElement;source:HTMLElement}|null=null;
  private sig='';
  private grid:HTMLElement;private tray:HTMLElement;private details:HTMLElement;private book:HTMLElement;private locked:HTMLElement;private help:HTMLElement;
  private readonly art=new Map<string,string>();
  constructor(private readonly root:HTMLElement,private readonly host:GardenHost){
    root.innerHTML=`<p class="cc-garden-locked" hidden></p>
      <div class="cc-garden-main"><div class="cc-garden-grid" role="group" aria-label="Garden plots"></div>
      <div class="cc-garden-side"><h3 class="cc-h3" id="cc-seed-title">Seeds</h3><div class="cc-seed-tray" role="group" aria-labelledby="cc-seed-title"></div>
      <p class="cc-garden-help"></p><div class="cc-plot-details" aria-live="polite"></div></div></div>
      <h3 class="cc-h3">Collection book</h3><ul class="cc-book"></ul>`;
    this.locked=root.querySelector('.cc-garden-locked')!;this.grid=root.querySelector('.cc-garden-grid')!;
    this.tray=root.querySelector('.cc-seed-tray')!;this.details=root.querySelector('.cc-plot-details')!;this.book=root.querySelector('.cc-book')!;this.help=root.querySelector('.cc-garden-help')!;
    this.tray.addEventListener('pointerdown',this.onSeedDown);
    this.tray.addEventListener('click',this.onSeedClick);
    this.grid.addEventListener('click',this.onPlotClick);
    this.details.addEventListener('click',this.onDetailsClick);
  }
  private plant(id:VarietyId,stage:0|1|2|3){const key=id+stage;let svg=this.art.get(key);if(!svg){svg=plantSvg(id,stage);this.art.set(key,svg);}return svg;}

  /** Rebuild structure when something visible changed, then refresh timers. */
  update(){
    const g=this.host.game(),s=g.s.garden,style=this.host.style();
    const open=g.has('garden');
    this.locked.hidden=open;
    this.locked.textContent=open?'':'Buy the “Kitchen Garden Plot” upgrade to plant this run. Your collection book and discoveries are kept forever.';
    this.root.querySelector<HTMLElement>('.cc-garden-main')!.hidden=!open;
    const size=g.gardenSize();
    const sig=[open,size,[...s.discovered].join(),s.plots.map((p,i)=>p?`${p.v}${g.stage(i)}`:'-').join(),this.selectedSeed,this.selectedPlot].join('|');
    if(sig!==this.sig){this.sig=sig;this.render();}
    // Live text: growth timers, prices, affordability.
    this.grid.querySelectorAll<HTMLButtonElement>('.cc-plot').forEach(button=>{
      const i=Number(button.dataset.plot),p=s.plots[i],time=button.querySelector('.cc-plot-time')!;
      if(!p){time.textContent=this.selectedSeed?format(g.plantCost(this.selectedSeed),style):'';button.setAttribute('aria-label',`Empty plot ${i%4+1},${Math.floor(i/4)+1}${this.selectedSeed?`. Plant ${varietyById[this.selectedSeed].name}`:''}`);return;}
      const v=varietyById[p.v],left=(v.growSeconds-p.age)/g.growthMult();
      const mature=g.mature(i);
      time.textContent=mature?'Ripe!':duration(left);
      button.style.setProperty('--grow',String(Math.min(1,p.age/v.growSeconds)));
      button.setAttribute('aria-label',`${v.name}, ${mature?`ripe, harvest for ${format(g.harvestValue(i),style)} kernels`:`ripe in ${duration(left)}`}`);
    });
    this.tray.querySelectorAll<HTMLButtonElement>('.cc-seed').forEach(button=>{
      const id=button.dataset.seed as VarietyId,cost=g.plantCost(id);
      button.querySelector('.cc-seed-cost')!.textContent=format(cost,style);
      button.classList.toggle('cc-poor',g.s.kernels.lt(cost));
    });
    this.renderDetails();
  }
  private render(){
    const g=this.host.game(),s=g.s.garden,size=g.gardenSize();
    this.grid.style.setProperty('--size',String(size));
    let plots='';
    for(let i=0;i<16;i++){
      if(!g.plotActive(i))continue;
      const p=s.plots[i],stage=g.stage(i);
      plots+=`<button type="button" class="cc-plot${p?' cc-planted':''}${p&&g.mature(i)?' cc-ripe':''}${this.selectedPlot===i?' cc-selected':''}" data-plot="${i}">
        ${p?`<span class="cc-plot-art">${this.plant(p.v,stage)}</span>`:'<span class="cc-plot-empty" aria-hidden="true">+</span>'}
        <span class="cc-plot-bar" aria-hidden="true"></span><span class="cc-plot-time"></span></button>`;
    }
    this.grid.innerHTML=plots;
    this.tray.innerHTML=VARIETIES.filter(v=>s.discovered.has(v.id)).map(v=>`<button type="button" class="cc-seed" data-seed="${v.id}" aria-pressed="${this.selectedSeed===v.id}" aria-label="${v.name} seed: ${effectLabel(v.id)}, grows in ${duration(v.growSeconds)}">
      <span class="cc-seed-art">${this.plant(v.id,3)}</span><span class="cc-seed-name">${v.name}</span><span class="cc-seed-cost"></span></button>`).join('');
    this.help.textContent=this.selectedSeed
      ?`Tap an empty plot to plant ${varietyById[this.selectedSeed].name}, or drag the seed onto a plot.`
      :'Tap a seed then a plot, or drag a seed into a plot. Tap a ripe plant to harvest it. Leave an empty plot beside two ripe plants and something new may sprout.';
    this.book.innerHTML=VARIETIES.map(v=>{
      const known=s.discovered.has(v.id);
      const parentsKnown=v.parents?.every(p=>s.discovered.has(p));
      const recipe=v.parents?`${parentsKnown?`${varietyById[v.parents[0]].name} + ${varietyById[v.parents[1]].name}`:'??? + ???'}`:'Starter seed';
      return `<li class="cc-book-item${known?'':' cc-unknown'}"><span class="cc-book-art">${known?this.plant(v.id,3):''}</span><span><strong>${known?v.name:'Undiscovered variety'}</strong>
        <small>${known?`${v.desc} Grows in ${duration(v.growSeconds)}.`:'Grow next to the right parents to discover it.'}</small><small class="cc-recipe">Recipe: ${recipe}</small></span></li>`;
    }).join('');
  }
  private renderDetails(){
    const g=this.host.game(),i=this.selectedPlot,style=this.host.style();
    const p=i===null?null:g.s.garden.plots[i];
    if(i===null||!p){if(this.details.dataset.state!=='none'){this.details.dataset.state='none';this.details.innerHTML='';}return;}
    const v=varietyById[p.v],mature=g.mature(i),left=(v.growSeconds-p.age)/g.growthMult();
    const state=`${i}${p.v}${mature}`;
    if(this.details.dataset.state!==state){
      this.details.dataset.state=state;
      this.details.innerHTML=`<p><strong>${v.name}</strong> <span class="cc-detail-time"></span></p><p class="cc-muted">${v.desc}</p>
        <div class="cc-row">${mature?'<button type="button" class="cc-btn" data-act="harvest">Harvest</button>':'<button type="button" class="cc-btn cc-btn-quiet" data-act="remove">Pull up (no harvest)</button>'}<button type="button" class="cc-btn cc-btn-quiet" data-act="close">Close</button></div>`;
    }
    this.details.querySelector('.cc-detail-time')!.textContent=mature?`ripe: harvest for ${format(g.harvestValue(i),style)} kernels`:`ripe in ${duration(left)}`;
  }

  // ───── Input ─────
  private readonly onSeedClick=(event:MouseEvent)=>{
    const seed=(event.target as Element).closest<HTMLElement>('.cc-seed');if(!seed)return;
    if(this.suppressClick){this.suppressClick=false;return;}
    const id=seed.dataset.seed as VarietyId;
    this.selectedSeed=this.selectedSeed===id?null:id;this.selectedPlot=null;this.update();
    this.tray.querySelector<HTMLElement>(`[data-seed="${id}"]`)?.focus();
  };
  private suppressClick=false;
  private readonly onSeedDown=(event:PointerEvent)=>{
    const seed=(event.target as Element).closest<HTMLElement>('.cc-seed');
    if(!seed||event.button!==0)return;
    this.drag={id:seed.dataset.seed as VarietyId,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,source:seed};
    addEventListener('pointermove',this.onMove);addEventListener('pointerup',this.onUp);addEventListener('pointercancel',this.onCancel);
  };
  private readonly onMove=(event:PointerEvent)=>{
    const d=this.drag;if(!d||event.pointerId!==d.pointer)return;
    if(!d.ghost){
      if(Math.hypot(event.clientX-d.startX,event.clientY-d.startY)<8)return;
      d.ghost=document.createElement('div');d.ghost.className='cc-drag-ghost';d.ghost.innerHTML=this.plant(d.id,3);
      document.body.append(d.ghost);d.source.classList.add('cc-dragging');
    }
    event.preventDefault();
    d.ghost.style.transform=`translate(${event.clientX-28}px,${event.clientY-28}px)`;
    const plot=this.plotAt(event.clientX,event.clientY);
    this.grid.querySelectorAll('.cc-drop-target').forEach(el=>el.classList.remove('cc-drop-target'));
    plot?.classList.add('cc-drop-target');
  };
  private plotAt(x:number,y:number):HTMLElement|null {
    const el=document.elementsFromPoint(x,y).find(e=>e instanceof HTMLElement&&e.classList.contains('cc-plot'));
    return (el as HTMLElement|undefined)??null;
  }
  private readonly onUp=(event:PointerEvent)=>{
    const d=this.drag;if(!d||event.pointerId!==d.pointer)return;
    const dragged=!!d.ghost;
    this.endDrag();
    if(!dragged)return;
    this.suppressClick=true;setTimeout(()=>{this.suppressClick=false;},0);
    const plot=this.plotAt(event.clientX,event.clientY);
    if(plot)this.plantAt(Number(plot.dataset.plot),d.id,plot);
  };
  private readonly onCancel=()=>this.endDrag();
  private endDrag(){
    if(this.drag){this.drag.ghost?.remove();this.drag.source.classList.remove('cc-dragging');}
    this.drag=null;
    this.grid.querySelectorAll('.cc-drop-target').forEach(el=>el.classList.remove('cc-drop-target'));
    removeEventListener('pointermove',this.onMove);removeEventListener('pointerup',this.onUp);removeEventListener('pointercancel',this.onCancel);
  }
  private plantAt(i:number,id:VarietyId,at:HTMLElement){
    const g=this.host.game();
    if(g.s.garden.plots[i]){this.host.feedback('deny','That plot is already in use.',at);return;}
    const cost=g.plantCost(id);
    if(!g.plant(i,id)){this.host.feedback('deny',`Planting ${varietyById[id].name} costs ${format(cost,this.host.style())} kernels.`,at);return;}
    this.host.feedback('plant',`Planted ${varietyById[id].name}.`,at);this.host.changed();this.update();
    this.grid.querySelector<HTMLElement>(`[data-plot="${i}"]`)?.focus();
  }
  private readonly onPlotClick=(event:MouseEvent)=>{
    const button=(event.target as Element).closest<HTMLElement>('.cc-plot');if(!button)return;
    const i=Number(button.dataset.plot),g=this.host.game(),p=g.s.garden.plots[i];
    if(!p){
      if(this.selectedSeed)this.plantAt(i,this.selectedSeed,button);
      else this.host.feedback('deny','Choose a seed first, then tap this plot.',button);
      return;
    }
    if(g.mature(i)){this.harvest(i,button);return;}
    this.selectedPlot=this.selectedPlot===i?null:i;this.update();
    this.grid.querySelector<HTMLElement>(`[data-plot="${i}"]`)?.focus();
  };
  private harvest(i:number,at:HTMLElement){
    const g=this.host.game(),name=varietyById[g.s.garden.plots[i]!.v].name;
    const value=g.harvest(i);
    if(value){this.host.feedback('harvest',value.isZero()?`Pulled up ${name}.`:`Harvested ${name}: +${format(value,this.host.style())} kernels.`,at);this.host.changed();}
    this.selectedPlot=null;this.update();
    this.grid.querySelector<HTMLElement>(`[data-plot="${i}"]`)?.focus();
  }
  private readonly onDetailsClick=(event:MouseEvent)=>{
    const act=(event.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
    const i=this.selectedPlot;if(!act||i===null)return;
    const plot=this.grid.querySelector<HTMLElement>(`[data-plot="${i}"]`)!;
    if(act==='close'){this.selectedPlot=null;this.update();plot?.focus();return;}
    this.harvest(i,plot);
  };
  /** Clear selections that refer to plots that no longer exist (after a replant). */
  reset(){this.selectedPlot=null;this.sig='';}
  dispose(){this.endDrag();}
}
