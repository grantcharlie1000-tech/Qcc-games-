type Event = {name:string; at:number; duration?:number};
const events:Event[]=[];
(globalThis as any).__qccBallTiming=events;
export function mark(name:string){if(events.length<20000)events.push({name,at:performance.now()});}
export function span<T>(name:string,fn:()=>T):T{const at=performance.now();try{return fn();}finally{if(events.length<20000)events.push({name,at,duration:performance.now()-at});}}
addEventListener('hashchange',()=>mark('hashchange'));
addEventListener('click',e=>{if((e.target as Element)?.closest?.('a'))mark('link.click');},true);
