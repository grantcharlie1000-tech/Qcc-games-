/**
 * Cross-tab ownership and rolling backups. The arcade shell owns the main save
 * (`pocket-arcade:v1:save:corn-clicker`); this module only reads it and keeps a few
 * backups beside it. Every storage access tolerates blocked or full storage.
 */
const PREFIX='pocket-arcade:v1:';
export const SAVE_KEY=`${PREFIX}save:corn-clicker`;
const LOCK_KEY=`${PREFIX}corn-clicker:lock`;
const BACKUP_KEY=`${PREFIX}corn-clicker:backups`;
/** A tab that has not refreshed its claim for this long is considered gone. */
export const LOCK_STALE_MS=4000;
const MAX_BACKUPS=5;

function getItem(key:string):string|null {try{return localStorage.getItem(key);}catch{return null;}}
function setItem(key:string,value:string):boolean {try{localStorage.setItem(key,value);return true;}catch{return false;}}
function removeItem(key:string){try{localStorage.removeItem(key);}catch{/* storage unavailable */}}

/** The newest snapshot any tab has written, read straight from storage. */
export function readDiskSave():unknown {
  const raw=getItem(SAVE_KEY);if(!raw)return undefined;
  try{const envelope=JSON.parse(raw);return envelope?.version===1?envelope.data:undefined;}catch{return undefined;}
}
export const revisionOf=(data:unknown):number=>typeof data==='object'&&data!==null&&typeof (data as {rev?:unknown}).rev==='number'?(data as {rev:number}).rev:-1;

interface Lock {tab:string;beat:number}
/**
 * Only one tab runs the farm at a time. The owner refreshes a heartbeat; another tab may
 * take over explicitly, and the previous owner then saves once and steps aside.
 */
export class TabGuard {
  readonly id=Math.random().toString(36).slice(2)+Date.now().toString(36);
  owner=false;
  private timer:number|undefined;
  private readonly onStorage=(event:StorageEvent)=>{
    if(event.key!==LOCK_KEY||!this.owner)return;
    const lock=this.read();
    if(lock&&lock.tab!==this.id){this.owner=false;this.stopBeat();this.onLost();}
  };
  constructor(private readonly onLost:()=>void,private readonly now=()=>Date.now()){
    addEventListener('storage',this.onStorage);
  }
  private read():Lock|null {
    const raw=getItem(LOCK_KEY);if(!raw)return null;
    try{const lock=JSON.parse(raw);return typeof lock?.tab==='string'&&typeof lock?.beat==='number'?lock:null;}catch{return null;}
  }
  /** Another live tab currently owns the farm. */
  busyElsewhere():boolean {
    const lock=this.read();
    return !!lock&&lock.tab!==this.id&&this.now()-lock.beat<LOCK_STALE_MS&&lock.beat-this.now()<LOCK_STALE_MS;
  }
  claim(force=false):boolean {
    if(!force&&this.busyElsewhere())return false;
    // Storage that cannot hold a lock (blocked/private) cannot be shared between tabs either.
    setItem(LOCK_KEY,JSON.stringify({tab:this.id,beat:this.now()}));
    this.owner=true;this.startBeat();return true;
  }
  private startBeat(){
    this.stopBeat();
    this.timer=window.setInterval(()=>{
      const lock=this.read();
      if(lock&&lock.tab!==this.id){this.owner=false;this.stopBeat();this.onLost();return;}
      setItem(LOCK_KEY,JSON.stringify({tab:this.id,beat:this.now()}));
    },1000);
  }
  private stopBeat(){if(this.timer!==undefined)clearInterval(this.timer);this.timer=undefined;}
  release(){
    this.stopBeat();
    if(this.owner&&this.read()?.tab===this.id)removeItem(LOCK_KEY);
    this.owner=false;
  }
  dispose(){this.release();removeEventListener('storage',this.onStorage);}
}

export interface Backup {at:number;rev:number;reason:string;data:unknown}
export function listBackups():Backup[] {
  const raw=getItem(BACKUP_KEY);if(!raw)return [];
  try{
    const list=JSON.parse(raw);
    return Array.isArray(list)?list.filter(b=>typeof b?.at==='number'&&typeof b?.reason==='string'&&b.data!==undefined):[];
  }catch{return [];}
}
export function addBackup(data:unknown,reason:string,at=Date.now()):boolean {
  const list=[{at,rev:revisionOf(data),reason,data},...listBackups()].slice(0,MAX_BACKUPS);
  // A full quota should not block play: drop the oldest backups until it fits.
  for(let n=list.length;n>0;n--)if(setItem(BACKUP_KEY,JSON.stringify(list.slice(0,n))))return true;
  return false;
}
