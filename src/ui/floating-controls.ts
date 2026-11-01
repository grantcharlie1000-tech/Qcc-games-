import {bindGlass} from './glass';
import './floating-controls.css';

/** Presentation-only dock. Callers own actions, HUD values and glass disposal.
 * Icons are trusted markup from the shared icon set, never user input. */
export function createGameDock(options:{backHref:string;backIcon:string;menuIcon:string}){
  const root=document.createElement('nav');root.className='game-dock';root.setAttribute('aria-label','Game controls');
  const back=document.createElement('a');back.className='ui-tab arcade-glass game-glass';back.href=options.backHref;back.setAttribute('aria-label','Games');back.innerHTML=options.backIcon+'<span>Games</span>';
  const hud=document.createElement('div');hud.className='game-hud arcade-glass game-glass';hud.setAttribute('aria-label','Game information');
  const menu=document.createElement('button');menu.id='game-menu';menu.type='button';menu.className='ui-tab arcade-glass game-glass';menu.setAttribute('aria-label','Menu');menu.setAttribute('aria-haspopup','dialog');menu.setAttribute('aria-expanded','false');menu.innerHTML=options.menuIcon+'<span>Menu</span>';
  root.append(back,hud,menu);return{root,back,hud,menu};
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
