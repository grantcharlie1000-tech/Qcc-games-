import type {AppIconName} from '../../apps/icons';
import type {ConversationRow,Friend} from '../shared';

export type Family='text'|'snap'|'system'|'request';
export interface RowStatus {icon:AppIconName;family:Family;words:string;/** "New message" and "New photo" take the glyph colour in the list. */emphasis:boolean}

/** DESIGN section 8, one row per case. Shape says what it is, the outline treatment says where it is, the words always sit beside it. */
export function rowStatus(row:ConversationRow):RowStatus {
 const last=row.last;
 if(!last)return {icon:'status-text-received',family:'text',words:"You're now friends",emphasis:false};
 if(last.kind==='system')return {icon:'timer',family:'system',words:'Chat settings changed',emphasis:false};
 if(last.kind==='snap'){
  if(last.mine)return last.viewed?{icon:'status-snap-opened',family:'snap',words:"They've seen your photo",emphasis:false}:{icon:'status-snap-sent',family:'snap',words:'Photo not seen yet',emphasis:false};
  return last.viewed?{icon:'status-snap-received',family:'snap',words:"You've seen their photo",emphasis:false}:{icon:'status-snap-new',family:'snap',words:'New photo',emphasis:true};
 }
 if(last.mine)return last.viewed?{icon:'status-text-opened',family:'text',words:"They've seen it",emphasis:false}:{icon:'status-text-sent',family:'text',words:'Not seen yet',emphasis:false};
 if(last.viewed)return {icon:'status-text-received',family:'text',words:"You've seen it",emphasis:false};
 return {icon:'status-text-new',family:'text',words:row.unread>1?`${row.unread} new messages`:'New message',emphasis:true};
}
export const REQUEST_STATUS:RowStatus={icon:'status-request',family:'request',words:'Request sent',emphasis:false};

/** "2 minutes ago", for the row's accessible name (the visible text says "2m"). */
export function agoWords(iso:string,now:number=Date.now()):string {
 const at=Date.parse(iso);if(Number.isNaN(at))return '';
 const seconds=Math.max(0,(now-at)/1000);
 const unit=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'} ago`;
 if(seconds<45)return 'just now';
 if(seconds<3600)return unit(Math.max(1,Math.floor(seconds/60)),'minute');
 if(seconds<86400)return unit(Math.floor(seconds/3600),'hour');
 if(seconds<604800)return unit(Math.floor(seconds/86400),'day');
 return new Date(at).toLocaleDateString('en-NZ',{day:'numeric',month:'short'});
}
/** "Sam, New photo, 2 minutes ago, 3 unread" */
export function rowLabel(friend:Friend,status:RowStatus,at:string|null,unread:number,now?:number):string {
 return [friend.displayName,status.words,at?agoWords(at,now):'',unread>0?`${unread} unread`:''].filter(Boolean).join(', ');
}
