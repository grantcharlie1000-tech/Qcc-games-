// Run real planning and rules in Node, with Vite's existing TS module loader.
// This does not listen on a port or open a browser.
import {createServer} from 'vite';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';

const source=process.argv.find(a=>a.startsWith('--source='))?.slice(9);
const plugins=source?[{name:'pool-benchmark-source',async load(id){if(id.replaceAll('\\','/').endsWith('/src/games/pool/ai.ts'))return readFile(source,'utf8');}}]:[];
const loader=await createServer({configFile:false,plugins,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,ws:false,hmr:false},appType:'custom',logLevel:'error'});
try{
  const validation=process.argv.includes('--validate');
  const seedArg=process.argv.find(a=>a.startsWith('--seed-base='));
  const validationSeed=seedArg?Number(seedArg.slice(12)):undefined;
  if(validationSeed!==undefined&&(!Number.isInteger(validationSeed)||validationSeed<0||validationSeed>0xffffffff))throw new Error('Invalid seed base');
  const mod=await loader.ssrLoadModule(validation?'/tests/games/pool/ai-validation.ts':'/tests/games/pool/ai-benchmark.ts');
  const result=validation?mod.runValidation():mod.runBenchmark(process.argv.includes('--held-out'),validationSeed);
  result.source={path:source??'src/games/pool/ai.ts',sha256:createHash('sha256').update(await readFile(source??'src/games/pool/ai.ts')).digest('hex')};
  const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
  if(out){await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify(result.summary,null,2));
  if(validation&&!result.summary.passed)process.exitCode=1;
}finally{await loader.close();}
