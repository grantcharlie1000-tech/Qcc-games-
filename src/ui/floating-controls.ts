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
  const surfaces=[...root.querySelectorAll<HTMLElement>('.floating-glass-group')].map(bindGlass);
  return{dispose(){for(const surface of surfaces)surface.dispose();}};
}
