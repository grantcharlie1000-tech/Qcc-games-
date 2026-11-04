import type {AppDeps} from '../../apps/types';
import type {AppIconName} from '../../apps/icons';
import type {ChatClient} from '../client';

export interface NoticeOptions {role?:'status'|'alert';action?:{label:string;run:()=>void};icon?:AppIconName|null;sticky?:boolean}
/** What every Chat screen and component gets from the view (the controller). */
export interface ChatContext {
 readonly client:ChatClient;
 readonly deps:AppDeps;
 token():string|null;
 reduced():boolean;
 /** False only when the server said photos are off (SocialMe.media === false). */
 mediaEnabled():boolean;
 onMediaChange(run:()=>void):()=>void;
 /** Two panes (width 960 and up). */
 wide():boolean;
 notify(text:string,options?:NoticeOptions):void;
 /** Polite one-off confirmation through the shell's #announcer. */
 announce(text:string):void;
 /** Maps an error to a notice (401 signs out; 429, 507 and offline show their own copy). True when it was a 401. */
 fail(error:unknown,fallback:string,retry?:()=>void):boolean;
 signedOut():void;
 go(hash:string):void;
 /** Fetches the chat list now (rows, requests, unread). */
 refreshList():void;
 /** Unread count last seen for a friend, from the list. */
 unreadFor(username:string):number;
}
export interface Screen {
 dispose():void;
 pause?():void;
 resume?():void;
 /** The tab was hidden or the page is going away: close anything that must not stay on screen (the snap viewer). */
 hide?():void;
 /** Where focus goes after the route renders. */
 focusTarget?():HTMLElement|null;
}
export const isAuthError=(error:unknown):boolean=>(error as {status?:number}|undefined)?.status===401;
export const isGone=(error:unknown):boolean=>{const status=(error as {status?:number}|undefined)?.status;return status===404||status===403;};
