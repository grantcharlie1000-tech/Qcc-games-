import {uiIcon} from './icons';

/** Shared shell geometry and semantics; each owner supplies its destinations/actions. */
export function createSectionNavigation(scope:'app'|'movies',tone:'light'|'dark'){
  const root=document.createElement('nav');
  root.className=`${scope}-navigation section-navigation`;
  root.setAttribute('aria-label','Sections');
  const bar=document.createElement('div');
  bar.className=`${scope==='app'?'app-tabbar':'movies-mobile-nav'} section-tabbar ui-tabbar arcade-glass`;
  bar.dataset.glassTone=tone;
  const menu=document.createElement('button');
  menu.type='button';menu.className=`${scope==='app'?'app-menu':'movies-menu'} section-menu ui-tab arcade-glass glass-control`;
  menu.dataset.glassTone=tone;menu.dataset.action='menu';
  menu.setAttribute('aria-label','Open menu');menu.setAttribute('aria-haspopup','dialog');menu.innerHTML=uiIcon('menu');
  root.append(bar,menu);
  return {root,bar,menu};
}
