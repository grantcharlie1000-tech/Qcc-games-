import {AppApi} from '../apps/api';
import type {ActivityItem,Author,Page,PostView,ProfileView,ReportCategory,SocialMe} from './shared';
export const SOCIAL_ENDPOINT='/.netlify/functions/social';
export type FeedTab='following'|'discover';
export type PostsKind='posts'|'replies'|'media'|'likes';
export interface ThreadView {ancestors:PostView[];post:PostView;replies:Page<PostView>}
export interface SearchResult {users:Author[];posts:PostView[]}
export type ReportInput={kind:'post';id:string;category:ReportCategory;note?:string}|{kind:'account';username:string;category:ReportCategory;note?:string};
export interface ProfileUpdate {displayName?:string;bio?:string;avatarId?:string|null;bannerId?:string|null}
const cursorParams=(cursor?:string|null):Record<string,string>=>cursor?{cursor}:{};
export class SocialClient {
 readonly api:AppApi;
 constructor(token:()=>string|null,fetcher?:typeof fetch){this.api=new AppApi(SOCIAL_ENDPOINT,token,fetcher);}
 me(signal?:AbortSignal){return this.api.get<SocialMe>('me',{},signal);}
 feed(tab:FeedTab,cursor?:string|null,signal?:AbortSignal){return this.api.get<Page<PostView>>('feed',{tab,...cursorParams(cursor)},signal);}
 thread(id:string,signal?:AbortSignal){return this.api.get<ThreadView>('thread',{id},signal);}
 profile(username:string,signal?:AbortSignal){return this.api.get<ProfileView>('profile',{username},signal);}
 posts(username:string,kind:PostsKind,cursor?:string|null,signal?:AbortSignal){return this.api.get<Page<PostView>>('posts',{username,kind,...cursorParams(cursor)},signal);}
 search(q:string,signal?:AbortSignal){return this.api.get<SearchResult>('search',{q},signal);}
 activity(signal?:AbortSignal){return this.api.get<{items:ActivityItem[]}>('activity',{},signal);}
 blocks(signal?:AbortSignal){return this.api.get<{users:Author[]}>('blocks',{},signal);}
 createPost(body:string,media:string[]=[],replyTo?:string|null){return this.api.post<PostView>('post',{body,media,...(replyTo?{replyTo}:{})});}
 deletePost(id:string){return this.api.post<{ok:true}>('delete_post',{id});}
 like(id:string,on:boolean){return this.api.post<{likes:number;liked:boolean}>('like',{id,on});}
 follow(username:string,on:boolean){return this.api.post<{followedByMe:boolean;followers:number}>('follow',{username,on});}
 block(username:string,on:boolean){return this.api.post<{blockedByMe:boolean}>('block',{username,on});}
 report(input:ReportInput){return this.api.post<{ok:true}>('report',input);}
 updateProfile(input:ProfileUpdate){return this.api.post<ProfileView>('profile',input);}
 deleteAll(){return this.api.post<{ok:true}>('delete_all',{confirm:'DELETE'});}
}
