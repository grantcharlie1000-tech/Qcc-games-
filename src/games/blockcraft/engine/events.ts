/** Minimal typed event bus. Listeners run synchronously in registration order. emit() does not
 *  allocate: each type keeps an array snapshot, copied only when listeners change. */
export class EventBus<Events extends object>{
  private lists=new Map<keyof Events,((payload:never)=>void)[]>();
  on<K extends keyof Events>(type:K,listener:(payload:Events[K])=>void):()=>void{
    const fn=listener as (payload:never)=>void;
    this.lists.set(type,[...(this.lists.get(type)??[]),fn]);
    return ()=>{const list=this.lists.get(type);if(list)this.lists.set(type,list.filter(l=>l!==fn));};
  }
  emit<K extends keyof Events>(type:K,payload:Events[K]):void{
    const list=this.lists.get(type);if(!list)return;
    for(let i=0;i<list.length;i++)(list[i] as (payload:Events[K])=>void)(payload);
  }
  clear(){this.lists.clear();}
}
