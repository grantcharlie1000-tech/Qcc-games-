import {bindGlass} from './glass';
import {uiIcon,type UiIcon} from './icons';
import {statElement,type DisplayStat} from './stats';
import './floating-controls.css';

export type DockPlacement='top-left'|'top-center';
export type DockStats=readonly [DisplayStat]|readonly [DisplayStat,DisplayStat]|readonly [DisplayStat,DisplayStat,DisplayStat];
export interface DockAction {id:string;label:string;icon:UiIcon;onPress:()=>void;disabled?:boolean;pressed?:boolean}
export type DockActions=readonly []|readonly [DockAction]|readonly [DockAction,DockAction];
export interface GameDockApi {
  setStats(stats:DockStats):void;
  setActions(actions:DockActions):void;
  setPlacement(placement:DockPlacement):void;
}
export interface GameDock extends GameDockApi {
  root:HTMLElement;back:HTMLAnchorElement;hud:HTMLDivElement;menu:HTMLButtonElement;
  /** Existing games use the read-only caption adapter until they supply typed stats. */
  mirrorStats(stats:readonly DisplayStat[]):void;
  bind():void;dispose():void;
}

/** Compact presentation only. Callers retain actions, pause and model ownership.
 * The original options and root/back/hud/menu return fields remain compatible. */
export function createGameDock(options:{backHref:string;backIcon:string;menuIcon:string;pointerLock?:boolean;title?:string;placement?:DockPlacement}):GameDock{
  const root=document.createElement('nav');root.className='game-dock';root.setAttribute('aria-label','Game controls');root.dataset.dockPlacement=options.placement??'top-left';
  const events=new AbortController(),signal=events.signal;
  if(options.pointerLock){
    const activations=new Set<string>();
    root.addEventListener('keydown',event=>{
      if((event.key===' '||event.key==='Enter')&&event.target instanceof Element&&event.target.closest('button,a[href]')){if(!event.repeat)activations.add(event.code||event.key);event.stopPropagation();}
    },{signal});
    root.addEventListener('keyup',event=>{if(activations.delete(event.code||event.key))event.stopPropagation();},{signal});
    root.addEventListener('focusout',event=>{if(!(event.relatedTarget instanceof Node)||!root.contains(event.relatedTarget))activations.clear();},{signal});
  }
  const back=document.createElement('a');back.className='ui-tab arcade-glass game-glass';back.href=options.backHref;back.setAttribute('aria-label','Games');back.innerHTML=options.backIcon+'<span>Games</span>';
  const hud=document.createElement('div');hud.className='game-hud arcade-glass game-glass';hud.setAttribute('aria-label','Game information');
  const menu=document.createElement('button');menu.id='game-menu';menu.type='button';menu.className='ui-tab arcade-glass game-glass';menu.setAttribute('aria-label','Menu');menu.setAttribute('aria-haspopup','dialog');menu.setAttribute('aria-expanded','false');menu.innerHTML=options.menuIcon+'<span>Menu</span>';
  root.append(back,hud,menu);
  let owned=false,bound=false,disposed=false;
  const bindings=new Map<HTMLElement,ReturnType<typeof bindGlass>>();
  type Entry={button:HTMLButtonElement;glyph:HTMLSpanElement;action:DockAction};
  const actions=new Map<string,Entry>();
  const layout=()=>{
    if(disposed||!root.isConnected)return;
    const style=getComputedStyle(root),hs=getComputedStyle(hud),items=[...hud.querySelectorAll<HTMLElement>(':scope>.game-hud-item')];
    const available=(root.parentElement?.clientWidth??innerWidth)-(parseFloat(style.left)||0)-(parseFloat(style.right)||0);
    const textWidth=items.reduce((n,e)=>n+e.offsetWidth,0)+Math.max(0,items.length-1)*(parseFloat(hs.columnGap)||0)+(parseFloat(hs.paddingLeft)||0)+(parseFloat(hs.paddingRight)||0);
    const controls=[back,...[...actions.values()].map(a=>a.button),menu];
    const required=controls.reduce((n,e)=>n+e.offsetWidth,0)+Math.max(64,textWidth)+controls.length*(parseFloat(style.columnGap)||0);
    root.toggleAttribute('data-dock-wrap',required>available+1);
  };
  const resize=new ResizeObserver(layout);resize.observe(root);resize.observe(hud);
  window.addEventListener('resize',layout,{signal});void document.fonts.ready.then(layout);
  const bind=()=>{if(disposed)return;bound=true;for(const surface of root.querySelectorAll<HTMLElement>(':scope>.game-glass'))if(!bindings.has(surface))bindings.set(surface,bindGlass(surface));layout();};
  const render=(stats:readonly DisplayStat[])=>{
    const values=stats.length?stats:[{label:'',value:options.title??'Game'}],items=[...hud.querySelectorAll<HTMLElement>(':scope>.game-hud-item')];
    values.forEach((stat,i)=>{
      let item=items[i];if(!item){item=statElement(stat,'game-hud-item','small');hud.append(item);}
      const label=item.querySelector('small')!,value=item.querySelector('strong')!;
      if(label.textContent!==stat.label)label.textContent=stat.label;
      if(value.textContent!==String(stat.value))value.textContent=String(stat.value);
    });
    for(const item of items.slice(values.length))item.remove();layout();
  };
  render([]);
  return {
    root,back,hud,menu,bind,
    setStats(stats){if(disposed)return;if(stats.length<1||stats.length>3)throw new RangeError('A dock takes 1–3 stats');owned=true;render(stats);},
    mirrorStats(stats){if(!disposed&&!owned)render(stats.slice(0,3));},
    setPlacement(placement){if(disposed)return;root.dataset.dockPlacement=placement;layout();},
    setActions(next){
      if(disposed)return;
      if(next.length>2||new Set(next.map(a=>a.id)).size!==next.length)throw new RangeError('A dock takes up to two distinct actions');
      for(const [id,entry] of actions)if(!next.some(a=>a.id===id)){bindings.get(entry.button)?.dispose();bindings.delete(entry.button);entry.button.remove();actions.delete(id);}
      next.forEach((action,i)=>{
        let entry=actions.get(action.id);
        if(!entry){
          const button=document.createElement('button'),glyph=document.createElement('span');button.type='button';button.className='ui-tab arcade-glass game-glass game-dock-action';button.dataset.dockAction=action.id;glyph.className='game-action-glyph';button.append(glyph);
          entry={button,glyph,action};const current=entry;button.addEventListener('click',()=>current.action.onPress(),{signal});actions.set(action.id,entry);
        }
        if(entry.glyph.dataset.icon!==action.icon){entry.glyph.innerHTML=uiIcon(action.icon);entry.glyph.dataset.icon=action.icon;}
        entry.action=action;entry.button.setAttribute('aria-label',action.label);entry.button.title=action.label;entry.button.disabled=!!action.disabled;
        if(action.pressed!==undefined)entry.button.setAttribute('aria-pressed',String(action.pressed));else entry.button.removeAttribute('aria-pressed');
        const before=i===0?hud:menu;if(entry.button.nextSibling!==before)root.insertBefore(entry.button,before);
      });
      root.dataset.dockActions=String(next.length);if(bound)bind();else layout();
    },
    dispose(){if(disposed)return;disposed=true;events.abort();resize.disconnect();for(const binding of bindings.values())binding.dispose();bindings.clear();actions.clear();}
  };
}

/** Bounded regular-glass groups; no filtering or paint on their row wrapper. */
export function bindFloatingGroups(root:ParentNode):{dispose():void}{
  const labels:HTMLSpanElement[]=[];
  const surfaces=[...root.querySelectorAll<HTMLElement>('.floating-glass-group')].map(surface=>{
    // Give direct text the same small contrast footprint as existing icon
    // labels, without painting an entire header button or brand capsule.
    for(const parent of [surface,...surface.querySelectorAll('button,a,.ui-wordmark')]){
      for(const node of [...parent.childNodes])if(node.nodeType===Node.TEXT_NODE&&node.textContent?.trim()){
        const label=document.createElement('span');label.className='glass-label';node.replaceWith(label);label.append(node);labels.push(label);
      }
    }
    return bindGlass(surface);
  });
  return{dispose(){for(const surface of surfaces)surface.dispose();for(const label of labels)label.replaceWith(...label.childNodes);}};
}
