import {AppApi} from '../apps/api';
import type {ReportCategory} from '../social/shared';
import type {ChatList,ChatSummary,ConversationView,MessageView,Retention} from './shared';
export const CHAT_ENDPOINT='/.netlify/functions/chat';
export type SendInput={kind:'text';body:string}|{kind:'snap';mediaId:string};
export class ChatClient {
 readonly api:AppApi;
 constructor(token:()=>string|null,fetcher?:typeof fetch){this.api=new AppApi(CHAT_ENDPOINT,token,fetcher);}
 summary(signal?:AbortSignal){return this.api.get<ChatSummary>('summary',{},signal);}
 list(signal?:AbortSignal){return this.api.get<ChatList>('list',{},signal);}
 messages(username:string,after?:string|null,signal?:AbortSignal){return this.api.get<ConversationView>('messages',{with:username,...(after?{after}:{})},signal);}
 request(username:string){return this.api.post<{status:'sent'|'friends'}>('request',{username});}
 respond(username:string,accept:boolean){return this.api.post<{status:'friends'|'declined'}>('respond',{username,accept});}
 removeFriend(username:string){return this.api.post<{ok:true}>('remove_friend',{username});}
 send(to:string,input:SendInput){return this.api.post<MessageView>('send',{to,...input});}
 /** Single-use: a second open is a 410 ApiError with code 'opened'. */
 async openSnap(id:string,signal?:AbortSignal):Promise<Blob>{return this.api.raw('open_snap',{id},response=>response.blob(),signal,30000);}
 save(id:string,on:boolean){return this.api.post<MessageView>('save',{id,on});}
 unsend(id:string){return this.api.post<{ok:true}>('unsend',{id});}
 retention(username:string,mode:Retention){return this.api.post<ConversationView>('retention',{with:username,mode});}
 deleteConversation(username:string){return this.api.post<{ok:true}>('delete_conversation',{with:username});}
 report(messageId:string,category:ReportCategory,note?:string){return this.api.post<{ok:true}>('report',{messageId,category,...(note?{note}:{})});}
 block(username:string){return this.api.post<{ok:true}>('block',{username});}
}
