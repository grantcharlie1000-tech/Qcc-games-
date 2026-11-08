import {appIcon,type AppIconName} from './icons';
import {appSheet,showSheet} from './sheets';
import {leave} from './motion';

export interface MenuItem {label:string;icon:AppIconName;danger?:boolean;run:()=>void}
export interface MenuOptions {forceSheet?:boolean;at?:{x:number;y:number}}
interface MenuConfig {prefix:string;sheetId:string;deferAction?:boolean;focusSheet?:boolean;captureScroll?:boolean}
const fine=()=>typeof matchMedia==='function'&&matchMedia('(hover:hover) and (pointer:fine)').matches;

/** Each app owns one active menu; rendering, positioning and listener cleanup share one implementation. */
export function createAppMenu(config:MenuConfig) {
 let closeCurrent:(()=>void)|null=null;
 const close=():void=>{closeCurrent?.();};
 function open(trigger:HTMLElement,title:string,items:MenuItem[],host:HTMLElement,options:MenuOptions={}):void {
  close();
  const render=(container:HTMLElement,done:(keyboard:boolean)=>void)=>{
   for(const item of items){
    const button=document.createElement('button');
    button.type='button';button.setAttribute('role','menuitem');button.className=`${config.prefix}-menu-item${item.danger?' is-danger':''}`;
    button.innerHTML=`${appIcon(item.icon)}<span></span>`;button.querySelector('span')!.textContent=item.label;
    button.addEventListener('click',event=>{event.stopPropagation();done(event.detail===0);trigger.focus({preventScroll:true});if(config.deferAction)setTimeout(item.run,0);else item.run();});
    container.append(button);
   }
  };
  if(options.forceSheet||!fine()){
   const {dialog,body}=appSheet(config.sheetId,title,{closeLabel:'Close menu'});
   const list=document.createElement('div');list.className=`${config.prefix}-menu-list`;list.setAttribute('role','menu');list.setAttribute('aria-label',title);
   render(list,()=>dialog.close());body.append(list);
   const dismiss=()=>dialog.close();closeCurrent=dismiss;
   dialog.addEventListener('close',()=>{if(closeCurrent===dismiss)closeCurrent=null;},{once:true});
   showSheet(dialog,trigger);
   if(config.focusSheet)list.querySelector<HTMLElement>('button')?.focus();
   return;
  }
  const pop=document.createElement('div');
  pop.className=`${config.prefix}-popover apps-popover`;pop.setAttribute('role','menu');pop.setAttribute('aria-label',title);
  render(pop,dismiss);
  host.append(pop);
  const rect=trigger.getBoundingClientRect(),width=pop.offsetWidth,height=pop.offsetHeight;
  const anchorX=options.at?.x??rect.right,anchorY=options.at?.y??rect.bottom;
  const left=Math.max(8,Math.min(innerWidth-width-8,anchorX-width));
  const top=anchorY+4+height>innerHeight?Math.max(8,(options.at?.y??rect.top)-height-4):anchorY+4;
  pop.style.left=`${left}px`;pop.style.top=`${top}px`;
  pop.style.transformOrigin=`${Math.round(anchorX-left)}px ${top<anchorY?'100%':'0'}`;
  trigger.setAttribute('aria-expanded','true');
  const buttons=[...pop.querySelectorAll<HTMLButtonElement>('button')];buttons[0]?.focus();
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss(true);trigger.focus({preventScroll:true});}
   else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();const at=buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
   }else if(event.key==='Tab')dismiss(true);
  };
  const onPointer=(event:PointerEvent)=>{if(!pop.contains(event.target as Node)&&event.target!==trigger&&!trigger.contains(event.target as Node))dismiss();};
  const onScroll=()=>dismiss();
  pop.addEventListener('keydown',onKey);
  document.addEventListener('pointerdown',onPointer,true);
  host.addEventListener('scroll',onScroll,{passive:true,capture:config.captureScroll,once:true});
  window.addEventListener('resize',onScroll,{once:true});
  let closed=false;
  function dismiss(keyboard=false){
   if(closed)return;
   closed=true;pop.classList.remove('apps-popover');
   if(pop.isConnected)leave(pop,120,keyboard);trigger.removeAttribute('aria-expanded');
   document.removeEventListener('pointerdown',onPointer,true);host.removeEventListener('scroll',onScroll,config.captureScroll);window.removeEventListener('resize',onScroll);
   if(closeCurrent===dismiss)closeCurrent=null;
  }
  closeCurrent=dismiss;
 }
 return {open,close};
}
