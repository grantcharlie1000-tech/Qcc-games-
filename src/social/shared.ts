export const POST_MAX_CHARS=280,POST_MAX_MEDIA=4,DISPLAY_NAME_MAX=40,BIO_MAX=160,REPORT_NOTE_MAX=500,PAGE_SIZE=20,AUTO_HIDE_REPORTS=3;
export const REPORT_CATEGORIES=['spam','harassment','hate','sexual','self-harm','private-info','other'] as const;
export type ReportCategory=typeof REPORT_CATEGORIES[number];
/** Per-subject rate limits: `limit` events per `seconds`. */
export const LIMITS={
 post:{limit:30,seconds:3600},like:{limit:300,seconds:3600},follow:{limit:100,seconds:86400},
 friendRequest:{limit:30,seconds:86400},messageMinute:{limit:30,seconds:60},messageDay:{limit:1000,seconds:86400},
 report:{limit:20,seconds:86400},upload:{limit:60,seconds:86400}
} as const;
export const codePoints=(text:string):number=>Array.from(text).length;
/** A post needs 1-280 code points of non-blank text, or at least one photo (blank text allowed then). */
export function validPostBody(body:unknown,mediaCount:number):body is string {
 if(typeof body!=='string'||codePoints(body)>POST_MAX_CHARS)return false;
 return mediaCount>0||body.trim().length>0;
}
export interface Author {username:string;displayName:string;avatar:string|null}
export interface MediaRef {id:string;width:number;height:number;thumb:boolean}
export interface PostView {id:string;author:Author;body:string;media:MediaRef[];replyTo:string|null;replyToUsername:string|null;createdAt:string;likes:number;replies:number;liked:boolean;mine:boolean;deleted:boolean;hidden:boolean}
export interface Page<T> {items:T[];cursor:string|null}
export interface ProfileView {username:string;displayName:string;bio:string;avatar:string|null;banner:string|null;joinedAt:string;followers:number;following:number;posts:number;followsYou:boolean;followedByMe:boolean;blockedByMe:boolean;mine:boolean}
export interface ActivityItem {kind:'like'|'reply'|'follow';actor:Author;postId:string|null;snippet:string|null;at:string}
export interface SocialMe {profile:ProfileView;media:boolean}
