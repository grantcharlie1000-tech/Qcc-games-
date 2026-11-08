import type {AppDeps} from '../apps/types';
import type {SocialClient} from './client';
import type {PostView,SocialMe,Author} from './shared';

export interface NoticeOptions {role?:'status'|'alert';action?:{label:string;run:()=>void};icon?:'alert'|'info'|'check'|null;sticky?:boolean}
export interface ComposeOptions {replyTo?:PostView;trigger?:Element|null}
/** What every Social screen and component gets from the view (the controller). */
export interface SocialContext {
 /** People already visible in this view, used locally for bare @ suggestions. */
 mentionCandidates?:()=>Author[];
 readonly client:SocialClient;
 readonly deps:AppDeps;
 /** The scroll container (section.social-view). */
 readonly scroller:HTMLElement;
 me():SocialMe|null;
 token():string|null;
 reduced():boolean;
 notify(text:string,options?:NoticeOptions):void;
 announce(text:string):void;
 /** Maps an error to a notice (401 signs out; 429 shows its own copy). Returns true when it was handled as 401. */
 fail(error:unknown,fallback:string,retry?:()=>void):boolean;
 signedOut():void;
 reloadMe():Promise<void>;
 go(hash:string):void;
 refresh():void;
 openCompose(options?:ComposeOptions):void;
 openPhotos(media:PostView['media'],index:number,trigger?:Element|null):void;
 /** Called by a screen that shows posts, after a post was created. */
 posted(post:PostView):void;
 /** Own posted message becomes a new card; the screen decides whether it belongs. */
 mediaEnabled():boolean;
}
export interface Screen {
 dispose():void;
 pause?():void;
 resume?():void;
 /** A post was published from the compose sheet. */
 posted?(post:PostView):void;
 /** Where focus goes after the route renders. */
 focusTarget?():HTMLElement|null;
}
export const isAuthError=(error:unknown):boolean=>(error as {status?:number}|undefined)?.status===401;
