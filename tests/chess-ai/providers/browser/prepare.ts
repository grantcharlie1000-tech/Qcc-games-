/** Compile the dev-server modules before measuring browser work. */
export async function prepareCustomModules(baseURL:string,sides:readonly string[]=['candidate']) {
  const paths=['/@vite/client','/node_modules/vite/dist/client/env.mjs','/src/chess-ai/types.ts'];
  for(const side of sides) {
    const root=side==='baseline'?'/tests/chess-ai/providers/benchmarks/hillclimb-tiers/baseline/':'/src/chess-ai/providers/beginner/';
    const names=['index.ts','manifest.ts','engine.worker.ts','engine.ts','brook.ts','vendor/chess.js'];
    if(side==='candidate')names.push('perception.ts','search-rules.ts');
    paths.push(...names.map(name=>root+name),root+'engine.worker.ts?worker_file&type=module');
  }
  const started=Date.now(),requests=[];
  for(const path of paths) {
    const began=Date.now();
    try {
      // These setup GETs are outside browser timing. Avoid stale pooled sockets
      // while a busy dev server compiles another module between requests.
      const response=await fetch(new URL(path,baseURL),{headers:{connection:'close'},signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      await response.arrayBuffer();requests.push({path,ms:Date.now()-began});
      console.info(JSON.stringify({kind:'dev-module-prepared',...requests[requests.length-1]}));
    }catch(cause){throw Error(`Dev module preparation failed: ${path}`,{cause});}
  }
  return {method:'Dev-server compilation only, before browser measurements. Client module parsing, Worker startup and first replies remain measured.',totalMs:Date.now()-started,requests};
}
