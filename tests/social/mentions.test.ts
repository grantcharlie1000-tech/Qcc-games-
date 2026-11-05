import {describe,it,expect,vi} from 'vitest';
import {tokenizeRichText} from '../../src/apps/text';
import {mentionAt,insertMention,isCurrentMention,scrollMentionIntoView,MentionSuggestions} from '../../src/social/components/mentions';
describe('mention tokens',()=>{
 it('finds only a username token at the caret, not email or surrounding draft text',()=>{
  expect(mentionAt('Hello @al',9)).toEqual({start:6,end:9,query:'al'});
  expect(mentionAt('Email me@example.com',20)).toBeNull();
  expect(mentionAt('Hello @alice later',12)).toEqual({start:6,end:12,query:'alice'});
  expect(mentionAt('@'+'a'.repeat(25),26)).toBeNull();
 });
 it('rejects stale or selected mention tokens before an insertion',()=>{
  const text='@alice\nNext line',token=mentionAt(text,6)!;
  expect(isCurrentMention(text,6,6,token)).toBe(true);
  expect(isCurrentMention(text,16,16,token)).toBe(false);
  expect(isCurrentMention(text,0,6,token)).toBe(false);
  expect(isCurrentMention('@alicia\nNext line',7,7,token)).toBe(false);
  expect(isCurrentMention('Other @alice',12,12,token)).toBe(false);
 });
 it('replaces the current token and preserves the rest of a draft',()=>{
  expect(insertMention('Hello @al, welcome',{start:6,end:9,query:'al'},'alice')).toEqual({text:'Hello @alice, welcome',caret:12});
 });
 it('replaces an entire mention when the caret is inside its token',()=>{
  const text='Hello @alice world',token=mentionAt(text,9);
  expect(token).toEqual({start:6,end:12,query:'al'});
  expect(insertMention(text,token!,'alex')).toEqual({text:'Hello @alex world',caret:12});
  expect(insertMention('@alice',mentionAt('@alice',3)!,'alice')).toEqual({text:'@alice ',caret:7});
 });
 it('matches the rich-text tokenizer boundary instead of suggesting after parentheses',()=>{
  for(const text of ['(@alice','word@alice','a@alice.com']){
   expect(mentionAt(text,text.length)).toBeNull();
   expect(tokenizeRichText(text).some(token=>token.type==='mention')).toBe(false);
  }
  for(const prefix of ['',' ','\n','\t']){
   const text=prefix+'@alice';expect(mentionAt(text,text.length)).not.toBeNull();
   expect(tokenizeRichText(text).some(token=>token.type==='mention')).toBe(true);
  }
 });
 it('scrolls a lower option fully into the list viewport without moving the surrounding page',()=>{
  const list={scrollTop:0,clientTop:1,clientHeight:218,getBoundingClientRect:()=>({top:100,bottom:320})} as unknown as HTMLElement;
  const option={getBoundingClientRect:()=>({top:309,bottom:361})} as unknown as HTMLElement;
  scrollMentionIntoView(list,option);expect(list.scrollTop).toBe(42);
  const first={getBoundingClientRect:()=>({top:59,bottom:111})} as unknown as HTMLElement;
  scrollMentionIntoView(list,first);expect(list.scrollTop).toBe(0);
  const visible={getBoundingClientRect:()=>({top:153,bottom:205})} as unknown as HTMLElement;
  scrollMentionIntoView(list,visible);expect(list.scrollTop).toBe(0);
 });
});


it('cancels a pending mention search when native vertical navigation moves the caret',async()=>{
 vi.useFakeTimers();
 const list={hidden:true,setAttribute:vi.fn(),replaceChildren:vi.fn(),remove:vi.fn()};
 vi.stubGlobal('document',{createElement:()=>list});vi.stubGlobal('window',{setTimeout});
 const field=Object.assign(new EventTarget(),{value:'@alice\nNext line',selectionStart:6,selectionEnd:6,setAttribute:vi.fn(),removeAttribute:vi.fn()});
 const search=vi.fn((_query:string,_signal:AbortSignal)=>new Promise<never>(()=>{}));
 const picker=new MentionSuggestions({client:{search}} as never,field as unknown as HTMLTextAreaElement,1,()=>{});
 try{
  field.dispatchEvent(new Event('input'));await vi.advanceTimersByTimeAsync(300);
  expect(search).toHaveBeenCalledTimes(1);const signal=search.mock.calls[0]![1];expect(signal.aborted).toBe(false);
  field.selectionStart=field.selectionEnd=16;
  field.dispatchEvent(Object.assign(new Event('keyup'),{key:'ArrowDown'}));
  expect(signal.aborted).toBe(true);expect(list.hidden).toBe(true);expect(field.value).toBe('@alice\nNext line');
 }finally{picker.dispose();vi.unstubAllGlobals();vi.useRealTimers();}
});

it('keeps accepted keyboard mentions closed when punctuation follows the token',async()=>{
 vi.useFakeTimers();
 class Node extends EventTarget {
  hidden=true;children:Node[]=[];attributes=new Map<string,string>();scrollTop=0;clientTop=0;clientHeight=100;
  style={setProperty:vi.fn()};classList={add:vi.fn()};
  setAttribute(name:string,value:string){this.attributes.set(name,value);}
  removeAttribute(name:string){this.attributes.delete(name);}
  append(...nodes:Node[]){this.children.push(...nodes);}
  replaceChildren(...nodes:Node[]){this.children=nodes;}
  querySelectorAll(){return this.children.filter(node=>node.attributes.get('role')==='option');}
  querySelector(){return this.children.find(node=>node.attributes.get('aria-selected')==='true')??null;}
  getBoundingClientRect(){return {top:0,bottom:50};}
  remove(){}
 }
 vi.stubGlobal('document',{createElement:()=>new Node(),createTextNode:()=>new Node()});vi.stubGlobal('window',{setTimeout});
 const field=Object.assign(new Node(),{value:'Hello @, welcome',selectionStart:7,selectionEnd:7,focus:vi.fn(),setSelectionRange(start:number,end:number){this.selectionStart=start;this.selectionEnd=end;}});
 const search=vi.fn(()=>new Promise<never>(()=>{}));
 const ctx={client:{search},mentionCandidates:()=>[{username:'alice',displayName:'Alice',avatar:null}],me:()=>null};
 const picker=new MentionSuggestions(ctx as never,field as unknown as HTMLTextAreaElement,2,()=>{});
 try{
  field.dispatchEvent(new Event('input'));expect(picker.el.hidden).toBe(false);
  for(const key of ['ArrowDown','Enter']){
   field.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{key}));
   field.dispatchEvent(Object.assign(new Event('keyup'),{key}));
  }
  expect(field.value).toBe('Hello @alice, welcome');expect(picker.el.hidden).toBe(true);
  await vi.advanceTimersByTimeAsync(300);expect(search).not.toHaveBeenCalled();expect(picker.el.hidden).toBe(true);
 }finally{picker.dispose();vi.unstubAllGlobals();vi.useRealTimers();}
});
