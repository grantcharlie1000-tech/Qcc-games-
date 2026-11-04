import {openSheet} from '../ui/sheet';
import {uiIcon} from '../ui/icons';
import {appIcon} from './icons';
import {ApiError} from './api';
import {REPORT_CATEGORIES,REPORT_NOTE_MAX,type ReportCategory} from '../social/shared';
import {escapeHtml,codePoints} from './text';

/** Builds a `dialog.ui-glass-sheet` with the standard head (DESIGN 3.9). It removes itself from the page when closed. */
export function appSheet(id:string,title:string,options:{className?:string;closeLabel?:string}={}):{dialog:HTMLDialogElement;body:HTMLElement;titleEl:HTMLElement} {
 document.getElementById(id)?.remove();
 const dialog=document.createElement('dialog');
 dialog.id=id;dialog.className=`ui-glass-sheet apps-sheet ${options.className??''}`.trim();dialog.setAttribute('aria-labelledby',`${id}-title`);
 dialog.innerHTML=`<form method="dialog" class="dialog-head"><h2 id="${id}-title"></h2><button class="icon-button" aria-label="${escapeHtml(options.closeLabel??'Close')}">${uiIcon('close')}</button></form><div class="apps-sheet-body"></div>`;
 dialog.querySelector('h2')!.textContent=title;
 document.body.append(dialog);
 dialog.addEventListener('close',()=>setTimeout(()=>dialog.remove(),400),{once:true});
 return {dialog,body:dialog.querySelector<HTMLElement>('.apps-sheet-body')!,titleEl:dialog.querySelector('h2')!};
}
export const showSheet=(dialog:HTMLDialogElement,trigger?:Element|null):void=>openSheet(dialog,trigger??(document.activeElement instanceof Element?document.activeElement:null));

export interface ConfirmOptions {title:string;text:string;confirm:string;cancel?:string;danger?:boolean;typed?:{label:string;match:string};trigger?:Element|null}
/** DESIGN 7.4. Resolves true only when the action button is pressed. Initial focus is on Cancel. */
export function confirmSheet(options:ConfirmOptions):Promise<boolean> {
 const {dialog,body}=appSheet('apps-confirm',options.title,{closeLabel:'Close'});
 const typed=options.typed;
 body.innerHTML=`<p class="apps-confirm-text"></p>${typed?`<label class="apps-field-label" for="apps-confirm-typed">${escapeHtml(typed.label)}</label><input id="apps-confirm-typed" class="apps-field" autocomplete="off" autocapitalize="none" spellcheck="false">`:''}<div class="apps-confirm-actions"><button type="button" class="game-button secondary" data-action="cancel" autofocus>${escapeHtml(options.cancel??'Cancel')}</button><button type="button" class="game-button secondary apps-danger" data-action="confirm"${typed?' disabled':''}>${escapeHtml(options.confirm)}</button></div>`;
 body.querySelector('.apps-confirm-text')!.textContent=options.text;
 const confirmButton=body.querySelector<HTMLButtonElement>('[data-action=confirm]')!;
 if(!options.danger&&!typed)confirmButton.classList.remove('apps-danger');
 const input=body.querySelector<HTMLInputElement>('input');
 input?.addEventListener('input',()=>{confirmButton.disabled=input.value.trim().toLowerCase()!==typed!.match.toLowerCase();});
 return new Promise(resolve=>{
  let answer=false;
  confirmButton.addEventListener('click',()=>{if(confirmButton.disabled)return;answer=true;dialog.close();});
  body.querySelector('[data-action=cancel]')!.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>resolve(answer),{once:true});
  showSheet(dialog,options.trigger);
  body.querySelector<HTMLElement>('[data-action=cancel]')!.focus();
 });
}

export const SELF_HARM_HELP="If you or someone else isn't safe right now, call 111. You can talk to someone any time: call or text 1737, or call Youthline on 0800 376 633.";
export const REPORT_LABELS:Record<ReportCategory,string>={spam:'Spam',harassment:'Harassment or bullying',hate:'Hate',sexual:'Sexual content','self-harm':'Self-harm','private-info':'Private information',other:'Something else'};
export interface ReportOptions {
 title:string;intro:string;
 submit:(category:ReportCategory,note:string)=>Promise<void>;
 /** Offered after a report: "Block @sam too". */
 block?:{username:string;run:()=>Promise<void>};
 /** Chat inserts its message radio list here, ahead of the categories. Return the id of the chosen message or null while none is chosen. */
 prefix?:(body:HTMLElement,update:()=>void)=>(()=>boolean);
 trigger?:Element|null;
 onUnauthorized?:()=>void;
}
/** DESIGN 7.3 report sheet, shared by Social posts and Chat messages. */
export function reportSheet(options:ReportOptions):Promise<boolean> {
 const {dialog,body}=appSheet('apps-report',options.title,{closeLabel:'Close report'});
 const radios=REPORT_CATEGORIES.map(value=>`<label class="apps-radio-row"><span>${escapeHtml(REPORT_LABELS[value])}</span><input type="radio" name="report-category" value="${value}"></label>`).join('');
 body.innerHTML=`<div class="apps-report-form"><p class="muted apps-report-intro"></p><div class="apps-report-prefix"></div><div class="setting-list apps-radios" role="radiogroup" aria-label="What's wrong?">${radios}</div><div class="apps-panel apps-help" role="note" hidden></div><label class="apps-field-label" for="apps-report-note">Anything else? (optional)</label><textarea id="apps-report-note" class="apps-field" rows="3" maxlength="${REPORT_NOTE_MAX*2}"></textarea><p class="apps-counter" aria-hidden="true">0/${REPORT_NOTE_MAX}</p><div class="apps-notice-slot"></div><button type="button" class="game-button" data-action="send" disabled>Send report</button></div><div class="apps-report-done" hidden><p class="apps-thanks" role="status">Thanks. QCC moderators will review this.</p><div class="apps-confirm-actions"><button type="button" class="game-button secondary apps-danger" data-action="block" hidden></button><button type="button" class="game-button secondary" data-action="done">Done</button></div></div>`;
 body.querySelector('.apps-report-intro')!.textContent=options.intro;
 const q=<T extends Element>(s:string)=>body.querySelector<T>(s)!;
 const send=q<HTMLButtonElement>('[data-action=send]'),note=q<HTMLTextAreaElement>('textarea'),counter=q('.apps-counter'),help=q<HTMLElement>('.apps-help'),slot=q('.apps-notice-slot');
 help.textContent=SELF_HARM_HELP;
 let ready=options.prefix?options.prefix(q('.apps-report-prefix'),()=>update()):()=>true;
 const category=()=>body.querySelector<HTMLInputElement>('input[name=report-category]:checked')?.value as ReportCategory|undefined;
 function update(){
  help.hidden=category()!=='self-harm';
  const over=codePoints(note.value)>REPORT_NOTE_MAX;
  counter.textContent=`${codePoints(note.value)}/${REPORT_NOTE_MAX}`;counter.classList.toggle('is-over',over);
  send.disabled=!category()||over||!ready();
 }
 body.addEventListener('change',update);note.addEventListener('input',update);
 let sending=false,sent=false;
 send.addEventListener('click',async()=>{
  const chosen=category();if(!chosen||sending)return;
  sending=true;send.disabled=true;slot.replaceChildren();
  try{
   await options.submit(chosen,note.value.trim());sent=true;
   q<HTMLElement>('.apps-report-form').hidden=true;q<HTMLElement>('.apps-report-done').hidden=false;
   const block=q<HTMLButtonElement>('[data-action=block]');
   if(options.block){block.hidden=false;block.textContent=`Block @${options.block.username} too`;block.addEventListener('click',async()=>{block.disabled=true;try{await options.block!.run();dialog.close();}catch(error){block.disabled=false;block.textContent=error instanceof ApiError?error.message:"Couldn't block. Try again.";}});}
   const titleEl=dialog.querySelector('h2')!;titleEl.textContent='Report sent';
   q<HTMLElement>('[data-action=done]').focus();
  }catch(error){
   if(error instanceof ApiError&&error.status===401)options.onUnauthorized?.();
   const p=document.createElement('p');p.className='apps-notice';p.setAttribute('role','alert');
   p.innerHTML=appIcon('alert');p.append(document.createTextNode(error instanceof ApiError?error.message:"Couldn't send the report. Try again."));
   slot.replaceChildren(p);sending=false;update();
  }
 });
 q('[data-action=done]').addEventListener('click',()=>dialog.close());
 return new Promise(resolve=>{
  dialog.addEventListener('close',()=>resolve(sent),{once:true});
  showSheet(dialog,options.trigger);
  (body.querySelector<HTMLElement>('.apps-report-prefix input')??body.querySelector<HTMLElement>('input[name=report-category]'))?.focus();
  void ready;
 });
}
