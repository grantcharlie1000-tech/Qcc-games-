/** Full legal games test tier ordering; this is not an absolute rating anchor. */
import {build,version as esbuildVersion} from 'esbuild';
import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Chess} from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';
const root='src/chess-ai/providers/beginner/';
const files=['engine.ts',...(await readdir(root)).filter(f=>f.endsWith('.ts')&&f!=='engine.ts').sort(),'vendor/chess.js'];
const hash=async()=>createHash('sha256').update(Buffer.concat(await Promise.all(files.map(f=>readFile(root+f))))).digest('hex');
const sourceSha256=await hash();
const directory=await mkdtemp(join(tmpdir(),'qcc-tier-match-'));
try {
  const compiled=await build({stdin:{contents:`export {computeMove} from './${root}engine.ts';export {searchBudget} from './${root}index.ts';`,resolveDir:process.cwd(),sourcefile:'match-entry.ts'},bundle:true,format:'esm',platform:'node',target:'node24',write:false,minify:false,treeShaking:false});
  const modulePath=join(directory,'model.mjs');await writeFile(modulePath,compiled.outputFiles[0].contents);
  const {computeMove,searchBudget}=await import(pathToFileURL(modulePath).href);
  const openings=[[],['e2e4','e7e5','g1f3','b8c6'],['d2d4','d7d5','c2c4','e7e6'],['e2e4','c7c5','g1f3','d7d6']];
  const games=[];
  for(const lower of [300,500,700])for(const upper of [500,700,900].filter(t=>t>lower)) {
    for(let opening=0;opening<openings.length;opening++)for(const upperColor of ['w','b']) {
      const chess=new Chess(),history=[...openings[opening]];
      for(const move of history)chess.move(move);
      while(!chess.isGameOver()&&history.length<400) {
        const tier=chess.turn()===upperColor?upper:lower;
        const legal=chess.moves({verbose:true}).map(m=>m.lan);
        const answer=computeMove({fen:chess.fen(),moveHistoryUci:history,legalMovesUci:legal,opponentId:`elo-${tier}`,thinkingTimeMs:searchBudget(`elo-${tier}`,500)},(912731+opening*65537+history.length*8191)>>>0);
        if(!legal.includes(answer.moveUci))throw Error(`Illegal ${tier} reply`);
        chess.move(answer.moveUci);history.push(answer.moveUci);
      }
      const result=chess.isCheckmate()?(chess.turn()===upperColor?'lower-win':'upper-win'):chess.isDraw()?'draw':'unfinished';
      games.push({lower,upper,opening,upperColor,result,plies:history.length,finalFen:chess.fen(),moves:history});
      console.log(`${lower}-${upper} ${opening} ${upperColor}: ${result} ${history.length} plies`);
    }
  }
  if(await hash()!==sourceSha256)throw Error('Source changed during games');
  const summary=[];
  for(const lower of [300,500,700])for(const upper of [500,700,900].filter(t=>t>lower)) {
    const rows=games.filter(g=>g.lower===lower&&g.upper===upper);
    const counts=Object.fromEntries(['upper-win','lower-win','draw','unfinished'].map(r=>[r,rows.filter(g=>g.result===r).length]));
    summary.push({lower,upper,...counts,upperScore:(counts['upper-win']+.5*counts.draw)/rows.length});
  }
  await writeFile('tests/chess-ai/providers/benchmarks/hillclimb-tiers/match.json',JSON.stringify({generatedAt:new Date().toISOString(),sourceSha256,loader:{name:'esbuild',version:esbuildVersion,bundle:true,minify:false,treeShaking:false},method:'48 full legal games: every tier pair, four fixed openings, colors reversed with equal seeds. Rules-confirmed outcomes only. Unfinished games at400plies remain unfinished. Tier ordering evidence, not an Elo conversion.',summary,games},null,2)+'\n');
  console.log(JSON.stringify(summary));
}finally{await rm(directory,{recursive:true,force:true});}
