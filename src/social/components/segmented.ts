/** `.apps-segmented` (DESIGN 3.4): equal-width tablist with a sliding pill (transform only) and arrow-key roving. */
export interface SegmentedItem {id:string;label:string}
export interface SegmentedOptions {items:SegmentedItem[];selected:string;label:string;controls?:string;onSelect:(id:string,userInitiated:boolean)=>void;onReselect?:(id:string)=>void;className?:string}
export class Segmented {
 readonly el=document.createElement('div');
 private readonly pill=document.createElement('span');
 private selected:string;
 constructor(private readonly options:SegmentedOptions) {
  this.selected=options.selected;
  const el=this.el;el.className=`apps-segmented ${options.className??''}`.trim();el.setAttribute('role','tablist');el.setAttribute('aria-label',options.label);
  el.style.setProperty('--n',String(options.items.length));
  this.pill.className='apps-segmented-pill';this.pill.setAttribute('aria-hidden','true');el.append(this.pill);
  for(const item of options.items){
   const b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.dataset.id=item.id;b.textContent=item.label;
   if(options.controls)b.setAttribute('aria-controls',options.controls);
   b.addEventListener('click',()=>{if(this.selected===item.id)options.onReselect?.(item.id);else this.select(item.id,true);});
   b.addEventListener('keydown',event=>{
    const ids=options.items.map(i=>i.id),at=ids.indexOf(item.id);let to=-1;
    if(event.key==='ArrowRight')to=(at+1)%ids.length;else if(event.key==='ArrowLeft')to=(at-1+ids.length)%ids.length;else if(event.key==='Home')to=0;else if(event.key==='End')to=ids.length-1;
    if(to>=0){event.preventDefault();this.select(ids[to]!,true);this.el.querySelector<HTMLElement>(`[data-id="${ids[to]}"]`)!.focus();}
   });
   el.append(b);
  }
  this.paint();
 }
 select(id:string,user=false):void{if(id===this.selected)return;this.selected=id;this.paint();this.options.onSelect(id,user);}
 private paint():void {
  const ids=this.options.items.map(i=>i.id);
  for(const b of this.el.querySelectorAll<HTMLElement>('[role=tab]')){const on=b.dataset.id===this.selected;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}
  this.el.style.setProperty('--i',String(Math.max(0,ids.indexOf(this.selected))));
 }
}
