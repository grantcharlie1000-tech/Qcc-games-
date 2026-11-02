import {uiIcon} from './icons';
import {bindFloatingGroups} from './floating-controls';
import './shell-header.css';

type MediaFilter='all'|'movie'|'tv'|'list';
/** Persistent shell utilities. Page owners supply contextual search/filter
 * actions; they never replace the header or own its glass and sheet lifetime. */
export function createShellHeader(mark:string){
  const root=document.createElement('header');root.className='section-header movies-top ui-header';
  root.setAttribute('aria-label','Site controls');
  root.innerHTML=`<div class="ui-header-inner"><a class="movies-brand ui-brand section-glass arcade-glass floating-glass-group" data-glass-tone="light" href="#/collection" aria-label="Mauri Study Notes home"><span class="ui-brand-tile">${mark}</span><span class="ui-wordmark">Mauri <span>Study Notes</span></span></a><div class="ui-nav section-glass arcade-glass floating-glass-group" data-glass-tone="light" role="group" aria-label="Catalogue filters" hidden>${([['all','All titles'],['movie','Films'],['tv','Series'],['list','Saved']] as const).map(([kind,label])=>`<button class="ui-pill" type="button" data-kind="${kind}" aria-pressed="false">${label}</button>`).join('')}</div><div class="ui-header-actions section-glass arcade-glass floating-glass-group" data-glass-tone="light"><button type="button" data-shell-action="search" class="movies-search-toggle ui-icon-btn" aria-label="Search">${uiIcon('search')}</button><button type="button" data-shell-action="study" class="movies-study ui-icon-btn">${uiIcon('study')}<span class="ui-label">Study Mode</span><kbd class="ui-kbd" aria-hidden="true">Esc</kbd></button></div></div>`;
  const filters=root.querySelector<HTMLElement>('.ui-nav')!;
  let glass:ReturnType<typeof bindFloatingGroups>|undefined;
  // The root is mounted before binding so every surface has its real box.
  for(const type of ['keydown','keyup'])root.addEventListener(type,event=>event.stopPropagation());
  return {root,
    bind(){glass??=bindFloatingGroups(root);},
    context(media:boolean){filters.hidden=!media;},
    selectMedia(kind:MediaFilter|undefined){for(const button of filters.querySelectorAll<HTMLElement>('[data-kind]'))button.setAttribute('aria-pressed',String(button.dataset.kind===kind));},
    dispose(){glass?.dispose();root.remove();}
  };
}
