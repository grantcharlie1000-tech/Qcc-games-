import type {Database} from '../leaderboard/server';
type Query=Database['query'];
export async function isBlockedEitherWay(query:Query,a:string,b:string):Promise<boolean> {
 const result=await query('SELECT 1 FROM social_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1',[a,b]);
 return result.rows.length>0;
}
/** Blocking severs follows and chat contacts in both directions, atomically in one statement; unblocking only removes the block. */
export async function setBlock(query:Query,blocker:string,blocked:string,on:boolean):Promise<void> {
 if(!on){await query('DELETE FROM social_blocks WHERE blocker_id=$1 AND blocked_id=$2',[blocker,blocked]);return;}
 await query(`WITH block AS (INSERT INTO social_blocks(blocker_id,blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING),
   follows AS (DELETE FROM social_follows WHERE (follower_id=$1 AND followee_id=$2) OR (follower_id=$2 AND followee_id=$1))
  DELETE FROM chat_contacts WHERE (owner_id=$1 AND contact_id=$2) OR (owner_id=$2 AND contact_id=$1)`,[blocker,blocked]);
}
export async function accountByUsername(query:Query,username:string):Promise<{id:string;username:string}|null> {
 const result=await query('SELECT id,username FROM accounts WHERE lower(username)=lower($1)',[username]);
 const row=result.rows[0];return row?{id:row.id,username:row.username}:null;
}
