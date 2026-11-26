import {uiIcon} from './icons';
import {bindSectionLens} from './section-lens';
import './section-navigation.css';

/** Shared shell geometry and semantics; each owner supplies its destinations/actions. */
export function createSectionNavigation(scope:'app'|'movies'|'social'|'chat'|'predictions'){
  const root=document.createElement('nav');
  root.className=`${scope}-navigation section-navigation`;
  root.setAttribute('aria-label','Sections');
  const bar=document.createElement('div');
  bar.className=`${scope==='app'?'app-tabbar':scope==='movies'?'movies-mobile-nav':`${scope}-tabbar`} section-tabbar ui-tabbar arcade-glass`;
  bar.dataset.glassTone='light';
  const menu=document.createElement('button');
  menu.type='button';menu.className=`${scope==='app'?'app-menu':scope==='movies'?'movies-menu':`${scope}-menu`} section-menu ui-tab arcade-glass glass-control`;
  menu.dataset.glassTone='light';menu.dataset.action='menu';
  menu.setAttribute('aria-label','Open menu');menu.setAttribute('aria-haspopup','dialog');menu.innerHTML=uiIcon('menu');
  root.append(bar,menu);
  return {root,bar,menu};
}

/** The two browse scenes with paintable backdrops. Other routes use the shell's CSS glass. */
export function bindSectionNavigationLens(bar:HTMLElement,scroller:Window|HTMLElement):()=>void {
  if (new URLSearchParams(location.search).get('glass')==='fallback') return ()=>{};
  if (bar.classList.contains('app-tabbar')) {
    const host = document.querySelector<HTMLElement>('#content');
    // MOTION-7: the Games bar stays up through a route's loading page (main.ts tabHandover), so its lens paints that page too,
    // and its raised bubble keeps falling on the release spring instead of dropping to the CSS pill.
    if (host) return bindSectionLens(bar,host,()=>host.querySelector(':scope > :is(.game-grid,.loading)')?host:null);
  }
  if (bar.classList.contains('movies-mobile-nav') && scroller instanceof HTMLElement) {
    // The nested Movies scroller has visible alignment evidence in Chromium.
    // WebKit keeps the compositor frost for this scene.
    return bindSectionLens(bar,scroller,()=>bar.dataset.glass==='backdrop'
      ? scroller.querySelector<HTMLElement>(':scope > .movies-browse')
      : null);
  }
  return ()=>{};
}
