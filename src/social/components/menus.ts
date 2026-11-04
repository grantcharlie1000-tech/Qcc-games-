import {appIcon,type AppIconName} from '../../apps/icons';
import {appSheet,showSheet} from '../../apps/sheets';
import {leave} from '../../apps/motion';

export interface MenuItem {label:string;icon:AppIconName;danger?:boolean;run:()=>void}
const fine=()=>typeof matchMedia==='function'&&matchMedia('(hover:hover) and (pointer:fine)').matches;
let closeCurrent:(()=>void)|null=null;
export const closeMenus=():void=>{closeCurrent?.();};

/** Popover on fine pointers, `#social-post-menu` sheet otherwise (DESIGN 5.4). Items are 44px rows. */
export function openMenu(trigger:HTMLElement,title:string,items:MenuItem[],host:HTMLElement):void {
 closeCurrent?.();
 const render=(container:HTMLElement,done:(keyboard:boolean)=>void)=>{
  for(const item of items){
   const button=document.createElement('button');
   button.type='button';button.setAttribute('role','menuitem');button.className=`social-menu-item${item.danger?' is-danger':''}`;
   button.innerHTML=`${appIcon(item.icon)}<span></span>`;button.querySelector('span')!.textContent=item.label;
   button.addEventListener('click',event=>{event.stopPropagation();done(event.detail===0);trigger.focus({preventScroll:true});setTimeout(item.run,0);});
   container.append(button);
  }
 };
 if(!fine()){
  const {dialog,body}=appSheet('social-post-menu',title,{closeLabel:'Close menu'});
  const list=document.createElement('div');list.className='social-menu-list';list.setAttribute('role','menu');list.setAttribute('aria-label',title);
  render(list,()=>dialog.close());body.append(list);
  closeCurrent=()=>dialog.close();
  dialog.addEventListener('close',()=>{if(closeCurrent)closeCurrent=null;},{once:true});
  showSheet(dialog,trigger);return;
 }
 const pop=document.createElement('div');
 pop.className='social-popover apps-popover';pop.setAttribute('role','menu');pop.setAttribute('aria-label',title);
 const done=(keyboard:boolean)=>{close(keyboard);};
 render(pop,done);
 host.append(pop);
 const rect=trigger.getBoundingClientRect();
 const width=pop.offsetWidth,height=pop.offsetHeight;
 const left=Math.max(8,Math.min(innerWidth-width-8,rect.right-width));
 const top=rect.bottom+4+height>innerHeight?Math.max(8,rect.top-height-4):rect.bottom+4;
 pop.style.left=`${left}px`;pop.style.top=`${top}px`;
 pop.style.transformOrigin=`${Math.round(rect.right-left)}px ${top<rect.top?'100%':'0'}`;
 trigger.setAttribute('aria-expanded','true');
 const buttons=[...pop.querySelectorAll<HTMLButtonElement>('button')];
 buttons[0]?.focus();
 const onKey=(event:KeyboardEvent)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);trigger.focus();}
  else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();const at=buttons.indexOf(document.activeElement as HTMLButtonElement);
   buttons[(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
  }else if(event.key==='Tab')close(true);
 };
 const onPointer=(event:PointerEvent)=>{if(!pop.contains(event.target as Node)&&event.target!==trigger&&!trigger.contains(event.target as Node))close();};
 const onScroll=()=>close();
 pop.addEventListener('keydown',onKey);
 document.addEventListener('pointerdown',onPointer,true);
 host.addEventListener('scroll',onScroll,{passive:true,once:true});
 window.addEventListener('resize',onScroll,{once:true});
 let closed=false;
 /** Leaves the way it came (DESIGN 12.1 row 15): 120 ms back to scale(.97) and transparent; at once for keyboard use. The live-menu class goes first so the shell's Escape and closeAppSheets treat it as gone. */
 function close(keyboard=false){
  if(closed||!pop.isConnected)return;
  closed=true;pop.classList.remove('apps-popover');
  leave(pop,120,keyboard);trigger.removeAttribute('aria-expanded');
  document.removeEventListener('pointerdown',onPointer,true);host.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onScroll);
  if(closeCurrent===close)closeCurrent=null;
 }
 closeCurrent=close;
}
