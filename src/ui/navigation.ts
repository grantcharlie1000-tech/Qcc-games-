import {uiIcon} from './icons';
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
