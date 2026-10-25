// Separate namespace. Never use game saves, scores, sync, or analytics.
export const MOVIES_KEY='qcc:movies:v1';
export interface MoviePreferences {list:string[];progress:Record<string,number>}
export class MovieStorage {
 data:MoviePreferences={list:[],progress:{}};
 durable=true;
 constructor(private storage:()=>Storage=()=>localStorage){
  try {const v=JSON.parse(this.storage().getItem(MOVIES_KEY)||'null');if(v&&Array.isArray(v.list)&&v.list.every((id:unknown)=>typeof id==='string'))this.data.list=v.list.slice(0,200);if(v?.progress&&typeof v.progress==='object')for(const [key,time] of Object.entries(v.progress))if(typeof time==='number'&&Number.isFinite(time)&&time>=0)this.data.progress[key]=time;}catch{this.durable=false;}
  this.write();
 }
 private write(){try{this.storage().setItem(MOVIES_KEY,JSON.stringify(this.data));this.durable=true;}catch{this.durable=false;}}
 toggle(id:string){this.data.list=this.data.list.includes(id)?this.data.list.filter(x=>x!==id):[...this.data.list,id];this.write();}
 progress(key:string,time:number){if(Number.isFinite(time)&&time>=0){this.data.progress[key]=time;this.write();}}
 clear(){this.data={list:[],progress:{}};this.write();}
}
