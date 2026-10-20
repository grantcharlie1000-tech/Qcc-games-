/** Minimal typed event bus. Listeners run synchronously in registration order. */
export class EventBus<Events extends object>{
  private listeners=new Map<keyof Events,Set<(payload:never)=>void>>();
  on<K extends keyof Events>(type:K,listener:(payload:Events[K])=>void):()=>void{
    let set=this.listeners.get(type);if(!set){set=new Set();this.listeners.set(type,set);}
    set.add(listener as (payload:never)=>void);
    return ()=>set!.delete(listener as (payload:never)=>void);
  }
  emit<K extends keyof Events>(type:K,payload:Events[K]):void{
    const set=this.listeners.get(type);if(!set)return;
    for(const listener of [...set])(listener as (payload:Events[K])=>void)(payload);
  }
  clear(){this.listeners.clear();}
}
