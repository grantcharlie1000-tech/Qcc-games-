import type {SocialContext} from '../context';

/** Start the clipboard write during the user's click, before any timer loses Safari's activation. */
export async function copySocialLink(ctx:SocialContext,url:string):Promise<void> {
 try{
  await navigator.clipboard.writeText(url);
  ctx.notify('Link copied',{icon:'check'});ctx.announce('Link copied');
 }catch{
  ctx.notify(`Couldn't copy automatically. Copy this link: ${url}`,{role:'alert',sticky:true});
 }
}
