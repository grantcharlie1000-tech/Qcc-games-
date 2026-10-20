// User-requested reloads must not discard a game held only in memory. A fresh
// successful durable write permits retry even after an earlier quota failure.
export async function reloadAfterActivation(save:()=>boolean,activate:()=>Promise<void>,reload:()=>void,current:()=>boolean=()=>true):Promise<'reloaded'|'save-failed'|'activation-failed'|'cancelled'>{
  const durable=()=>{try{return save();}catch{return false;}};
  if(!current())return 'cancelled';
  if(!durable())return 'save-failed';
  try{await activate();}catch{return current()?'activation-failed':'cancelled';}
  if(!current())return 'cancelled';
  // Settings and gameplay can change while activation waits. Save/flush again
  // in the same turn as reload; an earlier successful write is insufficient.
  if(!durable())return 'save-failed';
  if(!current())return 'cancelled';
  reload();return 'reloaded';
}
