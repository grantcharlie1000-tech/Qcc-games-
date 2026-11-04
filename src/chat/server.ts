import {randomUUID} from 'node:crypto';
import type {Database} from '../leaderboard/server';
import {resolveAccount} from '../accounts/server';
import {writeFrozen,readOnlyResponse} from '../accounts/write-freeze';
import {HttpError,respond,readJson,sameOrigin,rateLimit,errorResponse} from '../../server/api';
import {attachMedia,purgePendingMedia,type MediaStore} from '../media/store';
import {mediaKey,validMediaId} from '../media/policy';
import {accountByUsername,isBlockedEitherWay,setBlock} from '../social/blocks';
import {REPORT_CATEGORIES,REPORT_NOTE_MAX,LIMITS,codePoints,type ReportCategory} from '../social/shared';
import {MESSAGE_MAX_CHARS,RETENTION_MODES,type Retention,type Friend,type ConversationRow,type RequestRow,type ChatList,type MessageView,type ConversationView,type ChatSummary} from './shared';

type Query=Database['query'];
const BODY_LIMIT=16*1024;
const PURGE_BATCH=500;
const PAGE_LIMIT=200;
const MAX_BIGINT=9223372036854775807n;
const ts=(column:string)=>`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const bad=(message='Invalid request.')=>new HttpError(400,'invalid_request',message);
const notFound=()=>new HttpError(404,'not_found','Not found.');
const isObject=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const USERNAME=/^[A-Za-z0-9_.-]{3,24}$/;
/** Mutual contact rows and no block either way between `$1` (the caller) and the account expression `other`. */
const friendsWith=(other:string)=>`(EXISTS(SELECT 1 FROM chat_contacts f1 WHERE f1.owner_id=$1 AND f1.contact_id=${other})
  AND EXISTS(SELECT 1 FROM chat_contacts f2 WHERE f2.owner_id=${other} AND f2.contact_id=$1)
  AND NOT EXISTS(SELECT 1 FROM social_blocks fb WHERE (fb.blocker_id=$1 AND fb.blocked_id=${other}) OR (fb.blocker_id=${other} AND fb.blocked_id=$1)))`;
/** The same expiry formula everywhere: unsaved messages expire from the retention mode (`$mode`), the first view and the send time. */
const recomputedExpiry=(mode:string)=>`CASE WHEN ${mode}='week' THEN created_at+interval '7 days'
  WHEN viewed_at IS NOT NULL THEN viewed_at+interval '24 hours' ELSE created_at+interval '30 days' END`;
const MESSAGE_COLUMNS=`m.id,m.kind,m.sender_id,m.body,${ts('m.created_at')} AS created_at,${ts('m.viewed_at')} AS viewed_at,m.saved_at IS NOT NULL AS saved`;
const profileColumns=`a.username,COALESCE(NULLIF(sp.display_name,''),a.username) AS display_name,sp.avatar_id`;
const friendOf=(row:any):Friend=>({username:row.username,displayName:row.display_name,avatar:row.avatar_id??null});

function messageView(row:any,me:string):MessageView {
 const kind=row.kind as MessageView['kind'];
 return {
  id:String(row.id),kind,mine:row.sender_id===me,body:kind==='snap'?null:(row.body??null),
  snap:kind==='snap'?{opened:row.viewed_at!==null}:null,createdAt:row.created_at,viewedAt:row.viewed_at??null,saved:!!row.saved
 };
}
const GET_ACTIONS=new Set(['summary','list','messages']);
const POST_ACTIONS=new Set(['request','respond','remove_friend','send','open_snap','save','unsend','retention','delete_conversation','report','block']);

/** Best-effort: an orphaned blob is harmless and a failed delete must not fail work that already committed. */
async function deleteBlobs(store:MediaStore|null,ids:string[]):Promise<void> {
 if(!store)return;
 for(const id of ids)for(const variant of ['full','thumb'] as const)try{await store.delete(mediaKey(id,variant));}catch{/* best effort */}
}
/** Deletes expired messages in batches, removing snap media only for rows this call actually deleted. Returns the number of messages deleted. */
export async function purgeExpiredChat(query:Query,store:MediaStore|null):Promise<number> {
 let total=0;
 for(;;){
  const result=await query(`DELETE FROM chat_messages WHERE id IN (
    SELECT id FROM chat_messages WHERE expires_at<=now() ORDER BY expires_at LIMIT ${PURGE_BATCH} FOR UPDATE SKIP LOCKED
   ) RETURNING media_id`);
  total+=result.rows.length;
  const media=result.rows.flatMap(row=>row.media_id?[row.media_id as string]:[]);
  if(media.length){
   await query('DELETE FROM media_objects WHERE id=ANY($1::text[])',[media]);
   await deleteBlobs(store,media);
  }
  if(result.rows.length<PURGE_BATCH)break;
 }
 await purgePendingMedia(query,store);
 return total;
}

export function createChatHandler(db:Database,store:MediaStore|null):(request:Request)=>Promise<Response> {
 async function tx<T>(work:(query:Query)=>Promise<T>):Promise<T> {
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   const result=await work(client.query.bind(client) as Query);
   await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
 }
 /** Best-effort, after COMMIT: an orphaned blob is harmless, a failed delete must not fail the request. */
 async function dropBlobs(ids:string[]):Promise<void> {
  if(!store)return;
  for(const id of ids)for(const variant of ['full','thumb'] as const)try{await store.delete(mediaKey(id,variant));}catch{/* best effort */}
 }
 /** Resolves a username to an account that is a current friend of the caller (mutual, unblocked), otherwise 404 with no distinction. */
 async function friend(me:string,username:unknown):Promise<{id:string;username:string;display:Friend}> {
  if(typeof username!=='string'||!USERNAME.test(username))throw notFound();
  const result=await db.query(`SELECT a.id,${profileColumns} FROM accounts a LEFT JOIN social_profiles sp ON sp.account_id=a.id
   WHERE lower(a.username)=lower($2) AND a.id<>$1 AND ${friendsWith('a.id')}`,[me,username]);
  const row=result.rows[0];if(!row)throw notFound();
  return {id:row.id,username:row.username,display:friendOf(row)};
 }
 async function otherAccount(me:string,username:unknown):Promise<{id:string;username:string}> {
  if(typeof username!=='string'||!USERNAME.test(username))throw notFound();
  const target=await accountByUsername(db.query,username);
  if(!target||target.id===me)throw notFound();
  return target;
 }
 /** Unknown usernames resolve to null (callers answer as for a real one); self is a 400. */
 async function lookupQuiet(me:string,username:unknown):Promise<{id:string}|null> {
  if(typeof username!=='string'||!USERNAME.test(username))throw bad('Enter a valid username.');
  const target=await accountByUsername(db.query,username);
  if(target?.id===me)throw bad('You cannot do that to yourself.');
  return target;
 }
 const messageId=(value:unknown):string=>{
  if(typeof value!=='string'||!/^[1-9][0-9]{0,18}$/.test(value)||BigInt(value)>MAX_BIGINT)throw notFound();
  return value;
 };
 async function conversationFor(q:Query,a:string,b:string):Promise<{id:string;retention:Retention}> {
  const result=await q(`INSERT INTO chat_conversations(id,a_id,b_id) VALUES ($1,least($2::uuid,$3::uuid),greatest($2::uuid,$3::uuid))
   ON CONFLICT (a_id,b_id) DO UPDATE SET retention=chat_conversations.retention RETURNING id,retention`,[randomUUID(),a,b]);
  return result.rows[0] as {id:string;retention:Retention};
 }
 async function conversationView(me:string,other:{id:string;display:Friend},after:string|null,markViewed:boolean):Promise<ConversationView> {
  const conversation=await conversationFor(db.query,me,other.id);
  const picked=await db.query(after===null
   ?`SELECT id FROM (SELECT id FROM chat_messages WHERE conversation_id=$1 AND expires_at>now() ORDER BY id DESC LIMIT ${PAGE_LIMIT}) latest`
   :`SELECT id FROM chat_messages WHERE conversation_id=$1 AND expires_at>now() AND id>$2::bigint ORDER BY id LIMIT ${PAGE_LIMIT}`,after===null?[conversation.id]:[conversation.id,after]);
  const ids=picked.rows.map(row=>String(row.id));
  if(markViewed&&ids.length)await db.query(`UPDATE chat_messages SET viewed_at=now(),
    expires_at=CASE WHEN $4='viewed' AND saved_at IS NULL THEN least(expires_at,now()+interval '24 hours') ELSE expires_at END
   WHERE conversation_id=$1 AND id=ANY($2::bigint[]) AND sender_id=$3 AND kind='text' AND viewed_at IS NULL`,[conversation.id,ids,other.id,conversation.retention]);
  const rows=ids.length?(await db.query(`SELECT ${MESSAGE_COLUMNS} FROM chat_messages m WHERE m.conversation_id=$1 AND m.id=ANY($2::bigint[]) ORDER BY m.id`,[conversation.id,ids])).rows:[];
  return {friend:other.display,retention:conversation.retention,messages:rows.map(row=>messageView(row,me))};
 }
 /** Loads a message the caller may touch: it must be in a conversation the caller belongs to (checked in SQL) and unexpired. */
 async function memberMessage(q:Query,me:string,id:string,options:{friends:boolean;sender?:'me'|'other';lock?:boolean}) {
  const result=await q(`SELECT ${MESSAGE_COLUMNS},m.media_id,m.conversation_id,m.expires_at,c.retention
   FROM chat_messages m JOIN chat_conversations c ON c.id=m.conversation_id
   WHERE m.id=$2::bigint AND (c.a_id=$1 OR c.b_id=$1) AND m.expires_at>now()
    ${options.friends?`AND ${friendsWith('(CASE WHEN c.a_id=$1 THEN c.b_id ELSE c.a_id END)')}`:''}
    ${options.sender==='me'?'AND m.sender_id=$1':options.sender==='other'?'AND m.sender_id IS NOT NULL AND m.sender_id<>$1':''}
   ${options.lock?'FOR UPDATE OF m':''}`,[me,id]);
  const row=result.rows[0];if(!row)throw notFound();return row;
 }

 async function summary(me:string):Promise<ChatSummary> {
  const result=await db.query(`SELECT
   (SELECT count(*)::int FROM chat_messages m JOIN chat_conversations c ON c.id=m.conversation_id
     WHERE (c.a_id=$1 OR c.b_id=$1) AND m.sender_id IS NOT NULL AND m.sender_id<>$1 AND m.kind<>'system' AND m.viewed_at IS NULL AND m.expires_at>now()
      AND ${friendsWith('m.sender_id')}) AS unread,
   (SELECT count(*)::int FROM chat_contacts r WHERE r.contact_id=$1
     AND NOT EXISTS(SELECT 1 FROM chat_contacts mine WHERE mine.owner_id=$1 AND mine.contact_id=r.owner_id)
     AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=r.owner_id) OR (b.blocker_id=r.owner_id AND b.blocked_id=$1))) AS requests`,[me]);
  const row=result.rows[0];return {unread:Number(row.unread),requests:Number(row.requests)};
 }
 async function list(me:string):Promise<ChatList> {
  const friends=await db.query(`SELECT ${profileColumns},lm.kind AS lm_kind,lm.sender_id AS lm_sender,lm.viewed_at IS NOT NULL AS lm_viewed,${ts('lm.created_at')} AS lm_at,COALESCE(un.n,0) AS unread
   FROM chat_contacts c1 JOIN chat_contacts c2 ON c2.owner_id=c1.contact_id AND c2.contact_id=c1.owner_id
   JOIN accounts a ON a.id=c1.contact_id LEFT JOIN social_profiles sp ON sp.account_id=a.id
   LEFT JOIN chat_conversations cv ON cv.a_id=least(c1.owner_id,c1.contact_id) AND cv.b_id=greatest(c1.owner_id,c1.contact_id)
   LEFT JOIN LATERAL (SELECT kind,sender_id,viewed_at,created_at FROM chat_messages WHERE conversation_id=cv.id AND expires_at>now() ORDER BY id DESC LIMIT 1) lm ON true
   LEFT JOIN LATERAL (SELECT count(*)::int AS n FROM chat_messages WHERE conversation_id=cv.id AND sender_id=a.id AND kind<>'system' AND viewed_at IS NULL AND expires_at>now()) un ON true
   WHERE c1.owner_id=$1 AND ${friendsWith('a.id')}
   ORDER BY COALESCE(lm.created_at,greatest(c1.created_at,c2.created_at)) DESC,a.username`,[me]);
  const requests=(sql:string)=>db.query(sql,[me]).then(result=>result.rows.map((row):RequestRow=>({friend:friendOf(row),at:row.at})));
  const blockedWith=(other:string)=>`NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=${other}) OR (b.blocker_id=${other} AND b.blocked_id=$1))`;
  const [incoming,outgoing]=await Promise.all([
   requests(`SELECT ${profileColumns},${ts('r.created_at')} AS at FROM chat_contacts r JOIN accounts a ON a.id=r.owner_id LEFT JOIN social_profiles sp ON sp.account_id=a.id
    WHERE r.contact_id=$1 AND NOT EXISTS(SELECT 1 FROM chat_contacts mine WHERE mine.owner_id=$1 AND mine.contact_id=r.owner_id) AND ${blockedWith('r.owner_id')} ORDER BY r.created_at DESC,a.username`),
   requests(`SELECT ${profileColumns},${ts('r.created_at')} AS at FROM chat_contacts r JOIN accounts a ON a.id=r.contact_id LEFT JOIN social_profiles sp ON sp.account_id=a.id
    WHERE r.owner_id=$1 AND NOT EXISTS(SELECT 1 FROM chat_contacts back WHERE back.owner_id=r.contact_id AND back.contact_id=$1) AND ${blockedWith('r.contact_id')} ORDER BY r.created_at DESC,a.username`)
  ]);
  return {
   friends:friends.rows.map((row):ConversationRow=>({
    friend:friendOf(row),unread:Number(row.unread),
    last:row.lm_kind?{kind:row.lm_kind,mine:row.lm_sender===me,viewed:!!row.lm_viewed,at:row.lm_at}:null
   })),incoming,outgoing
  };
 }

 async function messages(me:string,params:URLSearchParams) {
  const other=await friend(me,params.get('with'));
  const afterParam=params.get('after');
  let after:string|null=null;
  if(afterParam!==null&&afterParam!==''){after=afterParam;if(!/^[0-9]{1,19}$/.test(after)||BigInt(after)>MAX_BIGINT)throw bad('Invalid after.');}
  return conversationView(me,{id:other.id,display:other.display},after,true);
 }

 async function request(me:string,data:Record<string,unknown>) {
  if(typeof data.username!=='string'||!USERNAME.test(data.username))throw bad('Enter a valid username.');
  const target=await accountByUsername(db.query,data.username);
  if(target?.id===me)throw bad('You cannot add yourself.');
  await rateLimit(db.query,'chat:request:'+me,LIMITS.friendRequest.limit,LIMITS.friendRequest.seconds);
  // Unknown and blocked targets answer exactly like a real request so usernames and blocks cannot be probed.
  if(!target||await isBlockedEitherWay(db.query,me,target.id))return {status:'sent'};
  await db.query('INSERT INTO chat_contacts(owner_id,contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[me,target.id]);
  const back=await db.query('SELECT 1 FROM chat_contacts WHERE owner_id=$1 AND contact_id=$2',[target.id,me]);
  return {status:back.rows.length?'friends':'sent'};
 }
 async function respondToRequest(me:string,data:Record<string,unknown>) {
  if(typeof data.accept!=='boolean')throw bad();
  const target=await otherAccount(me,data.username);
  const pending=await db.query(`SELECT 1 FROM chat_contacts r WHERE r.owner_id=$2 AND r.contact_id=$1
   AND NOT EXISTS(SELECT 1 FROM chat_contacts mine WHERE mine.owner_id=$1 AND mine.contact_id=$2)
   AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=$1))`,[me,target.id]);
  if(!pending.rows.length)throw notFound();
  if(data.accept){
   await db.query('INSERT INTO chat_contacts(owner_id,contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[me,target.id]);
   return {status:'friends'};
  }
  await db.query('DELETE FROM chat_contacts WHERE owner_id=$2 AND contact_id=$1',[me,target.id]);
  return {status:'declined'};
 }
 async function removeFriend(me:string,data:Record<string,unknown>) {
  const target=await lookupQuiet(me,data.username);
  if(target)await db.query('DELETE FROM chat_contacts WHERE (owner_id=$1 AND contact_id=$2) OR (owner_id=$2 AND contact_id=$1)',[me,target.id]);
  return {ok:true};
 }

 async function send(me:string,data:Record<string,unknown>) {
  const kind=data.kind;
  if(kind!=='text'&&kind!=='snap')throw bad('Unknown message kind.');
  const to=await friend(me,data.to);
  let body:string|null=null,mediaId:string|null=null;
  if(kind==='text'){
   if(typeof data.body!=='string'||!data.body.trim()||codePoints(data.body)>MESSAGE_MAX_CHARS)throw bad(`Messages are 1 to ${MESSAGE_MAX_CHARS} characters.`);
   body=data.body;
  }else{
   if(!validMediaId(data.mediaId))throw bad('Invalid media.');
   if(!store)throw new HttpError(503,'media_not_configured','Photos are not available.');
   mediaId=data.mediaId;
  }
  await rateLimit(db.query,'chat:msg:min:'+me,LIMITS.messageMinute.limit,LIMITS.messageMinute.seconds);
  await rateLimit(db.query,'chat:msg:day:'+me,LIMITS.messageDay.limit,LIMITS.messageDay.seconds);
  return tx(async q=>{
   const conversation=await conversationFor(q,me,to.id);
   if(mediaId)await attachMedia(q,me,[mediaId],'snap');
   const result=await q(`INSERT INTO chat_messages(conversation_id,sender_id,kind,body,media_id,expires_at)
    VALUES ($1,$2,$3,$4,$5,CASE WHEN $6='week' THEN now()+interval '7 days' ELSE now()+interval '30 days' END)
    RETURNING id,kind,sender_id,body,${ts('created_at')} AS created_at,${ts('viewed_at')} AS viewed_at,saved_at IS NOT NULL AS saved`,[conversation.id,me,kind,body,mediaId,conversation.retention]);
   return messageView(result.rows[0],me);
  });
 }

 async function openSnap(me:string,data:Record<string,unknown>):Promise<Response> {
  const id=messageId(data.id);
  const {bytes,mediaId}=await tx(async q=>{
   const message=await memberMessage(q,me,id,{friends:true,sender:'other',lock:true});
   if(message.kind!=='snap')throw notFound();
   if(message.viewed_at!==null)throw new HttpError(410,'opened','This snap was already opened.');
   if(!message.media_id||!store)throw new HttpError(410,'gone','This snap is gone.');
   const bytes=await store.get(mediaKey(message.media_id,'full'));
   if(!bytes)throw new HttpError(410,'gone','This snap is gone.');
   const opened=await q(`UPDATE chat_messages SET viewed_at=now(),media_id=NULL,
     expires_at=CASE WHEN $2='viewed' AND saved_at IS NULL THEN least(expires_at,now()+interval '24 hours') ELSE expires_at END WHERE id=$1::bigint AND viewed_at IS NULL RETURNING id`,[id,message.retention]);
   if(!opened.rows.length)throw new HttpError(410,'opened','This snap was already opened.');
   await q('DELETE FROM media_objects WHERE id=$1',[message.media_id]);
   return {bytes,mediaId:message.media_id as string};
  });
  await dropBlobs([mediaId]);
  return new Response(bytes as unknown as BodyInit,{status:200,headers:{'Content-Type':'image/webp','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }

 async function save(me:string,data:Record<string,unknown>) {
  const id=messageId(data.id);
  if(typeof data.on!=='boolean')throw bad();
  return tx(async q=>{
   const message=await memberMessage(q,me,id,{friends:true,lock:true});
   if(message.kind!=='text')throw bad('Only text messages can be saved.');
   const result=data.on
    ?await q(`UPDATE chat_messages SET saved_at=now(),expires_at=now()+interval '90 days' WHERE id=$1::bigint
      RETURNING id,kind,sender_id,body,${ts('created_at')} AS created_at,${ts('viewed_at')} AS viewed_at,saved_at IS NOT NULL AS saved`,[id])
    :await q(`UPDATE chat_messages SET saved_at=NULL,expires_at=${recomputedExpiry('$2')} WHERE id=$1::bigint
      RETURNING id,kind,sender_id,body,${ts('created_at')} AS created_at,${ts('viewed_at')} AS viewed_at,saved_at IS NOT NULL AS saved`,[id,message.retention]);
   return messageView(result.rows[0],me);
  });
 }

 async function unsend(me:string,data:Record<string,unknown>) {
  const id=messageId(data.id);
  const media=await tx(async q=>{
   const message=await memberMessage(q,me,id,{friends:false,sender:'me',lock:true});
   await q('DELETE FROM chat_messages WHERE id=$1::bigint AND sender_id=$2',[id,me]);
   return message.media_id as string|null;
  });
  if(media){await db.query('DELETE FROM media_objects WHERE id=$1',[media]);await dropBlobs([media]);}
  return {ok:true};
 }

 async function retention(me:string,data:Record<string,unknown>) {
  const mode=data.mode as Retention;
  if(!RETENTION_MODES.includes(mode))throw bad('Unknown retention mode.');
  const other=await friend(me,data.with);
  await tx(async q=>{
   const conversation=await conversationFor(q,me,other.id);
   if(conversation.retention===mode)return;
   await q('UPDATE chat_conversations SET retention=$2 WHERE id=$1',[conversation.id,mode]);
   await q(`INSERT INTO chat_messages(conversation_id,sender_id,kind,body,expires_at) VALUES ($1,NULL,'system',$2,now()+interval '30 days')`,[conversation.id,'retention:'+mode]);
   await q(`UPDATE chat_messages SET expires_at=${recomputedExpiry('$2')} WHERE conversation_id=$1 AND saved_at IS NULL`,[conversation.id,mode]);
  });
  return conversationView(me,{id:other.id,display:other.display},null,false);
 }

 async function deleteConversation(me:string,data:Record<string,unknown>) {
  const target=await otherAccount(me,data.with);
  const dropped=await tx(async q=>{
   const found=await q('SELECT id FROM chat_conversations WHERE a_id=least($1::uuid,$2::uuid) AND b_id=greatest($1::uuid,$2::uuid) FOR UPDATE',[me,target.id]);
   const conversation=found.rows[0];if(!conversation)throw notFound();
   const media=await q('SELECT media_id FROM chat_messages WHERE conversation_id=$1 AND media_id IS NOT NULL FOR UPDATE',[conversation.id]);
   const ids=media.rows.map(row=>row.media_id as string);
   await q('DELETE FROM chat_conversations WHERE id=$1',[conversation.id]);
   if(ids.length)await q('DELETE FROM media_objects WHERE id=ANY($1::text[])',[ids]);
   return ids;
  });
  await dropBlobs(dropped);
  return {ok:true};
 }

 async function report(me:string,data:Record<string,unknown>) {
  const id=messageId(data.messageId);
  const category=data.category as ReportCategory;
  if(!REPORT_CATEGORIES.includes(category))throw bad('Choose a report category.');
  const note=data.note===undefined||data.note===null?'':data.note;
  if(typeof note!=='string'||codePoints(note.trim())>REPORT_NOTE_MAX)throw bad('Note is too long.');
  const message=await memberMessage(db.query,me,id,{friends:false});
  if(message.kind==='system')throw notFound();
  if(message.sender_id===me)throw bad('You cannot report your own message.');
  await rateLimit(db.query,'social:report:'+me,LIMITS.report.limit,LIMITS.report.seconds);
  await db.query(`INSERT INTO social_reports(reporter_id,target_kind,target_id,target_account_id,category,note,snapshot) VALUES ($1,'message',$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
   [me,id,message.sender_id,category,note.trim(),message.kind==='snap'?'[photo]':message.body]);
  return {ok:true};
 }

 async function block(me:string,data:Record<string,unknown>) {
  const target=await lookupQuiet(me,data.username);
  if(target)await setBlock(db.query,me,target.id,true);
  return {ok:true};
 }

 const posts:Record<string,(me:string,data:Record<string,unknown>)=>Promise<unknown>>={
  request,respond:respondToRequest,remove_friend:removeFriend,save,unsend,retention,delete_conversation:deleteConversation,report,block
 };

 return async request=>{
  try{
   const params=new URL(request.url).searchParams,action=params.get('action')??'';
   const isGet=GET_ACTIONS.has(action),isPost=POST_ACTIONS.has(action);
   if(!isGet&&!isPost)return respond({error:'not_found'},404);
   const wanted=request.method==='GET'?isGet:request.method==='POST'?isPost:false;
   if(!wanted)return respond({error:'method_not_allowed'},405,{Allow:request.method==='GET'||!isGet?'POST':'GET'});
   const account=await resolveAccount(db,request);
   if(!account)return respond({error:'Please log in again.'},401);
   let data:Record<string,unknown>={};
   if(request.method==='POST'){
    if(!sameOrigin(request))throw new HttpError(403,'forbidden','Cross-origin requests are not allowed.');
    if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))throw new HttpError(415,'unsupported_type','Content-Type must be application/json.');
   }
   const frozen=await writeFrozen(db);
   if(request.method==='POST'&&frozen)return readOnlyResponse();
   // Best-effort retention: a purge problem must never block chat.
   if(!frozen)await purgeExpiredChat(db.query,store).catch(()=>{});
   if(request.method==='GET'){
    if(action==='summary')return respond(await summary(account.id));
    if(action==='list')return respond(await list(account.id));
    return respond(await messages(account.id,params));
   }
   const body=await readJson(request,BODY_LIMIT);
   if(!isObject(body))throw bad();
   data=body;
   if(action==='send')return respond(await send(account.id,data),201);
   if(action==='open_snap')return await openSnap(account.id,data);
   return respond(await posts[action]!(account.id,data));
  }catch(error){
   if(error instanceof HttpError&&error.code==='not_found')return respond({error:'not_found'},404);
   if(error instanceof HttpError&&(error.code==='media_not_configured'||error.code==='opened'||error.code==='gone'))return respond({error:error.code},error.status);
   return errorResponse(error,'chat_unavailable');
  }
 };
}
