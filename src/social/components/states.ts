import {appIcon,type AppIconName} from '../../apps/icons';
import {ApiError} from '../../apps/api';

export function skeletonPosts(count=6,label='Loading posts…'):HTMLElement {
 const box=document.createElement('div');box.className='apps-skeletons';box.setAttribute('aria-busy','true');
 const status=document.createElement('span');status.className='sr-only';status.setAttribute('role','status');status.textContent=label;box.append(status);
 for(let i=0;i<count;i++){
  const row=document.createElement('div');row.className='apps-skeleton social-skeleton';row.setAttribute('aria-hidden','true');
  row.innerHTML='<span class="sk-circle"></span><span class="sk-lines"><span class="sk-bar" style="width:40%"></span><span class="sk-bar" style="width:100%"></span><span class="sk-bar" style="width:92%"></span><span class="sk-bar" style="width:60%"></span></span>';
  box.append(row);
 }
 return box;
}
export function skeletonRows(count=8,label='Loading…'):HTMLElement {
 const box=document.createElement('div');box.className='apps-skeletons';box.setAttribute('aria-busy','true');
 const status=document.createElement('span');status.className='sr-only';status.setAttribute('role','status');status.textContent=label;box.append(status);
 for(let i=0;i<count;i++){
  const row=document.createElement('div');row.className='apps-skeleton social-skeleton is-row';row.setAttribute('aria-hidden','true');
  row.innerHTML='<span class="sk-circle is-small"></span><span class="sk-lines"><span class="sk-bar" style="width:55%"></span><span class="sk-bar" style="width:30%"></span></span>';
  box.append(row);
 }
 return box;
}
export interface EmptyOptions {icon?:AppIconName;title:string;text?:string;action?:{label:string;run?:()=>void;href?:string;primary?:boolean}}
export function emptyState(options:EmptyOptions):HTMLElement {
 const box=document.createElement('div');box.className='apps-empty';
 if(options.icon)box.insertAdjacentHTML('afterbegin',appIcon(options.icon));
 const h=document.createElement('h2');h.textContent=options.title;box.append(h);
 if(options.text){const p=document.createElement('p');p.textContent=options.text;box.append(p);}
 if(options.action){
  const a=options.action;
  const el=document.createElement(a.href?'a':'button') as HTMLElement;
  el.className=`ui-btn ${a.primary?'primary':'secondary'} apps-pill`;el.textContent=a.label;
  if(a.href)(el as HTMLAnchorElement).href=a.href;else{(el as HTMLButtonElement).type='button';el.addEventListener('click',()=>a.run?.());}
  box.append(el);
 }
 return box;
}
/** DESIGN 7.1 load-failed and service-down layouts. */
export function loadFailed(error:unknown,retry:()=>void):HTMLElement {
 const down=error instanceof ApiError&&error.status>=502&&error.status<=503&&error.code!=='media_not_configured';
 const gone=error instanceof ApiError&&error.status===404;
 if(gone)return emptyState({icon:'info',title:"This page doesn't exist.",action:{label:'Back to feed',href:'#/social'}});
 return emptyState({icon:'alert',title:down?'Social is unavailable right now. Try again soon.':"Couldn't load this.",text:down?undefined:'Check your connection and try again.',action:{label:'Try again',run:retry}});
}
