import {uiIcon} from './icons';
import './section-navigation.css';
import {createShellHeader} from './shell-header';

export type ShellSection='games'|'movies'|'tv'|'list'|'study';
type ShellContext='arcade'|'media'|'study';
const destinations:[ShellSection,string,string,Parameters<typeof uiIcon>[0]][]=[
  ['games','Games','#/collection','grid'],['movies','Movies','#/movies','film'],
  ['tv','TV Shows','#/movies/browse/tv','tv'],['list','My list','#/movies/list','bookmark'],['study','Study','','study']
];
export function sectionForHash(hash:string):ShellSection{
  if(hash.startsWith('#/movies/list'))return 'list';
  if(hash.startsWith('#/movies/browse/tv')||hash.startsWith('#/movies/tv-'))return 'tv';
  return hash==='#/movies'||hash.startsWith('#/movies/')?'movies':'games';
}

/** One app-owned node, outside all replaceable page roots. Owner class aliases
 * remain for integrations; they never select a second component or recipe. */
export function createSectionNavigation(mark:string){
  const header=createShellHeader(mark);
  const root=document.createElement('nav');
  root.className='section-navigation app-navigation movies-navigation';root.setAttribute('aria-label','Sections');
  const bar=document.createElement('div');
  bar.className='section-glass section-tabbar app-tabbar movies-mobile-nav ui-tabbar arcade-glass';bar.dataset.glassTone='light';
  bar.innerHTML=destinations.map(([section,label,href,icon])=>section==='study'
    ?`<button class="ui-tab" type="button" data-section="study" data-action="study">${uiIcon(icon)}<span>${label}</span></button>`
    :`<a class="ui-tab" data-section="${section}" href="${href}">${uiIcon(icon)}<span>${label}</span></a>`).join('');
  const menu=document.createElement('button');
  menu.type='button';menu.id='app-menu';menu.className='section-glass section-menu app-menu movies-menu ui-tab arcade-glass glass-control';
  menu.dataset.glassTone='light';menu.dataset.action='menu';
  menu.setAttribute('aria-label','Open menu');menu.setAttribute('aria-haspopup','dialog');menu.innerHTML=uiIcon('menu');
  root.append(bar,menu);
  // Native activation remains intact; retained page/game listeners never
  // receive keys from the shell, including the key that changes the route.
  for(const type of ['keydown','keyup'])root.addEventListener(type,event=>event.stopPropagation());
  let section:ShellSection='games';const yielded=new Set<ShellContext>();
  const sync=()=>{
    const context:ShellContext=section==='study'?'study':section==='games'?'arcade':'media';
    bar.toggleAttribute('data-hidden',yielded.has(context));
    if(bar.hasAttribute('data-hidden'))bar.dataset.hidden='true';
  };
  const select=(next:ShellSection)=>{
    section=next;header.context(next==='movies'||next==='tv'||next==='list');
    for(const tab of bar.querySelectorAll<HTMLElement>('[data-section]')){
      if(tab.dataset.section===next)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
    }
    sync();
  };
  select(section);
  return {root,bar,menu,header,select,yieldTo(context:ShellContext,hidden:boolean){if(hidden)yielded.add(context);else yielded.delete(context);sync();}};
}
export type SectionNavigation=ReturnType<typeof createSectionNavigation>;
