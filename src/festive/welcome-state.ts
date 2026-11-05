// Release-scoped and account-specific, but deliberately outside account saves:
// this browser's welcome must never affect synced progress or the theme choice.
const keyFor=(username:string)=>`qcc:christmas-welcome:2026:${username.toLowerCase()}`;
export class ChristmasWelcomeState {
  private seen=new Set<string>();
  shouldShow(username?:string):boolean{
    if(!username)return false;
    const key=keyFor(username);
    if(this.seen.has(key))return false;
    for(const name of ['localStorage','sessionStorage'] as const){
      try{if(globalThis[name].getItem(key)==='seen')return false;}catch{/* try the next store */}
    }
    return true;
  }
  markSeen(username:string):void{
    const key=keyFor(username);this.seen.add(key);
    for(const name of ['localStorage','sessionStorage'] as const){
      try{globalThis[name].setItem(key,'seen');}catch{/* memory still prevents repeats this visit */}
    }
  }
}
