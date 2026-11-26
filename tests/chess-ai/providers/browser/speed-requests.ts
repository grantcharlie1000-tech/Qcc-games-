// Provider requests copied unchanged from the retained capacity-v2 harness.
import type {Page} from '@playwright/test';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const tiers=[300,500,700,900];
export type Side='baseline'|'candidate';
export type Position={fen:string;history:string[];legal:string[]};
export type Row={tier:number;positionIndex:number;requestToReplyMs:number;legal:boolean;move?:string;nodes?:number;depth?:number;workerElapsedMs?:number;error?:string};
export async function sourceSnapshot(folder:string) {
  const files:Record<string,string>={};
  async function visit(relative=''):Promise<void> {
    for(const item of await readdir(folder+relative,{withFileTypes:true})) {
      const name=relative+item.name;
      if(item.isDirectory())await visit(name+'/');
      else if(/\.(ts|js)$/.test(name))files[name]=createHash('sha256').update(await readFile(folder+name)).digest('hex');
    }
  }
  await visit();
  const ordered=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)));
  return {sha256:createHash('sha256').update(JSON.stringify(ordered)).digest('hex'),files:ordered};
}

export async function providerRun(page:Page,side:Side,positions:Position[],repeat:number) {
  return await page.evaluate(async({side,positions,repeat,tiers})=>{
    const path=side==='baseline'?'/tests/chess-ai/providers/benchmarks/hillclimb-tiers/baseline/index.ts':'/src/chess-ai/providers/beginner/index.ts';
    const importStarted=performance.now();
    const {createProvider}=await import(path);
    const moduleImportMs=performance.now()-importStarted;
    const seedDescriptor=Object.getOwnPropertyDescriptor(crypto,'getRandomValues');
    Object.defineProperty(crypto,'getRandomValues',{configurable:true,value:(array:Uint32Array)=>{array[0]=1234+repeat;return array;}});
    const NativeWorker=window.Worker;
    let diagnostic:{nodes:number;depth?:number;elapsedMs:number}|undefined;
    const workers=new Set<Worker>();
    class MeasuredWorker extends NativeWorker {
      constructor(url:string|URL,options?:WorkerOptions) {
        super(url,options);workers.add(this);
        this.addEventListener('message',event=>{if(event.data.type==='result')diagnostic=event.data.result;});
      }
      override terminate(){workers.delete(this);super.terminate();}
    }
    window.Worker=MeasuredWorker;
    const provider=createProvider(),rows:Row[]=[],firstReplies:Row[]=[];
    let serial=0;
    const initializeStarted=performance.now();
    async function move(tier:number,positionIndex:number):Promise<Row> {
      const p=positions[positionIndex];diagnostic=undefined;const started=performance.now();
      try {
        const reply=await provider.chooseMove({fen:p.fen,startFen:p.fen,moveHistoryUci:p.history,legalMovesUci:p.legal,opponentId:`elo-${tier}`,thinkingTimeMs:tier<=500?400:500,positionRevision:++serial,signal:new AbortController().signal});
        // The awaited message listener assigns this value outside TS flow analysis.
        const measured=diagnostic as {nodes:number;depth?:number;elapsedMs:number}|undefined;
        if(!measured||!Number.isFinite(measured.nodes))throw Error('Actual Worker result diagnostics missing');
        return {tier,positionIndex,requestToReplyMs:performance.now()-started,legal:p.legal.includes(reply.moveUci),move:reply.moveUci,nodes:measured.nodes,depth:measured.depth,workerElapsedMs:measured.elapsedMs};
      }catch(error){return {tier,positionIndex,requestToReplyMs:performance.now()-started,error:String(error),legal:false};}
    }
    let initializeMs=0;
    try {
      await provider.initialize({signal:new AbortController().signal,onProgress:()=>{}});
      initializeMs=performance.now()-initializeStarted;
      // Exercise each actual search before retaining warm request timings.
      for(const tier of tiers)firstReplies.push(await move(tier,0));
      for(const tier of tiers)for(let positionIndex=0;positionIndex<positions.length;positionIndex++)rows.push(await move(tier,positionIndex));
      return {moduleImportMs,initializeMs,firstReplies,rows};
    }finally {
      provider.dispose();
      const leakedWorkers=workers.size;
      for(const worker of workers)worker.terminate();
      window.Worker=NativeWorker;
      if(seedDescriptor)Object.defineProperty(crypto,'getRandomValues',seedDescriptor);else Reflect.deleteProperty(crypto,'getRandomValues');
      if(leakedWorkers)throw Error(`${leakedWorkers} provider Workers leaked after dispose`);
    }
  },{side,positions,repeat,tiers});
}

