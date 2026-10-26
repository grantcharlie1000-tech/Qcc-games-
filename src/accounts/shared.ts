import {GAME_IDS} from '../core/types';
export const MAX_KEY_BYTES=1024*1024;
export const MAX_BODY_BYTES=2*1024*1024;
export const SAVE_KEYS:readonly string[]=['settings','favourites',...GAME_IDS.flatMap(id=>['best:'+id,'save:'+id])];
export interface SaveRecord {value:unknown;updated:number}
export type Saves=Record<string,SaveRecord>;
export const validUsername=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_.-]{3,24}$/.test(value);
export const validPassword=(value:unknown):value is string=>typeof value==='string'&&value.length>=8&&value.length<=128;
export const validSessionToken=(value:unknown):value is string=>typeof value==='string'&&/^acct_[a-f0-9]{64}$/.test(value);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const timestamp=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
function json(value:unknown,depth=0):boolean {
 if(depth>64)return false;
 if(value===null||typeof value==='string'||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value);
 if(Array.isArray(value))return value.every(v=>json(v,depth+1));
 return object(value)&&Object.entries(value).every(([k,v])=>!['__proto__','constructor','prototype'].includes(k)&&json(v,depth+1));
}
export function validSave(key:string,record:unknown,maxBytes=MAX_KEY_BYTES):record is SaveRecord {
 if(!SAVE_KEYS.includes(key)||!object(record)||Object.keys(record).some(k=>k!=='value'&&k!=='updated')||!timestamp(record.updated))return false;
 const value=record.value;
 if(key==='settings'){
  if(!object(value)||Object.entries(value).some(([k,v])=>!['sound','reducedMotion','colorBlind','autoNextEpisode'].includes(k)||typeof v!=='boolean'))return false;
 }else if(key==='favourites'){
  if(!Array.isArray(value)||value.length>GAME_IDS.length||!value.every(id=>GAME_IDS.includes(id)))return false;
 }else if(key.startsWith('best:')){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)return false;
 }else if(!object(value)||value.version!==1||Object.keys(value).some(k=>!['version','data','updated'].includes(k))||!Object.hasOwn(value,'data')||!timestamp(value.updated)||value.updated!==record.updated||!json(value.data))return false;
 try{return new TextEncoder().encode(JSON.stringify(record)).length<=maxBytes;}catch{return false;}
}
export function validSaves(value:unknown):value is Saves {
 return object(value)&&Object.keys(value).length<=SAVE_KEYS.length&&Object.entries(value).every(([key,record])=>validSave(key,record));
}
