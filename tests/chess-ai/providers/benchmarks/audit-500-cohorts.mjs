/** Metadata-only separation audit. Never reads scores or changes a corpus. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('./hillclimb-tiers/',import.meta.url);
const cache=new URL('../../../../.omc/state/chess-tiers-api-cache/',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const names=['human-500.json','human-500-validation-2.json','human-500-validation-3.json','human-500-pooled-training.json'];
const inputs=await Promise.all(names.map(async name=>{const bytes=await readFile(new URL(name,folder));return {name,sha256:hash(bytes),data:JSON.parse(bytes)};}));
const [original,second,third,pooled]=inputs.map(input=>input.data);
const retired=[...original.positions,...second.positions];
if(JSON.stringify(pooled.positions)!==JSON.stringify(retired.map(p=>({...p,split:'tuning'}))))throw Error('Pooled training changed more than split');
const retiredGames=new Set(retired.map(p=>p.source)),resolved=new Map();
for(const p of second.positions)resolved.set(p.source,[p.whiteUser,p.blackUser]);
async function cached(path) {
  const url=path.startsWith('https://')?path:`https://api.chess.com/pub/${path}`;
  return JSON.parse(await readFile(new URL(hash(url)+'.json',cache)));
}
for(const contributor of new Set(original.positions.map(p=>p.contributor))) {
  const {archives=[]}=await cached(`player/${contributor}/games/archives`);
  for(const archive of archives.slice(-3))for(const game of (await cached(archive)).games||[]) {
    if(retiredGames.has(game.url))resolved.set(game.url,[game.white.username.toLowerCase(),game.black.username.toLowerCase()]);
  }
}
if(resolved.size!==88||[...retiredGames].some(game=>!resolved.has(game)))throw Error('Retired games not fully resolved');
const retiredPlayers=new Set([...resolved.values()].flat());
if(retiredPlayers.size!==third.excludedOldPlayers||hash([...retiredPlayers].sort().join('\n'))!==third.excludedOldPlayersSha256)throw Error('Excluded player proof differs');
const fresh=third.positions,freshPlayers=new Set(fresh.flatMap(p=>[p.whiteUser,p.blackUser]));
const overlap=[...freshPlayers].filter(player=>retiredPlayers.has(player));
if(overlap.length||fresh.some(p=>retiredGames.has(p.source)||p.split!=='validation'))throw Error('Holdout separation failed');
if(fresh.length!==320||new Set(fresh.map(p=>p.source)).size!==80)throw Error('Fresh size changed');
const contributorGames=new Map();
for(const p of fresh) {
  if(![p.whiteRating,p.blackRating].every(rating=>rating>=400&&rating<600))throw Error('Game rating outside fixed band');
  if(!contributorGames.has(p.contributor))contributorGames.set(p.contributor,new Set());
  contributorGames.get(p.contributor).add(p.source);
}
const maxGamesPerContributor=Math.max(...[...contributorGames.values()].map(games=>games.size));
if(maxGamesPerContributor>3||contributorGames.size<27)throw Error('Contributor coverage changed');
const key=p=>p.fen.split(' ').slice(0,4).join(' '),oldBoards=new Set(retired.map(key));
const report={generatedAt:new Date().toISOString(),method:'Metadata-only audit. All original opponents resolved from cached raw archives; subsequent corpora retain both names. Verify both-player and game separation, exact pooled training preservation, fixed eligibility and sizes. Common boards are reported without filtering. No quality scores read.',inputs:inputs.map(({name,sha256})=>({name,sha256})),retired:{positions:retired.length,games:retiredGames.size,players:retiredPlayers.size},fresh:{positions:fresh.length,games:80,contributors:contributorGames.size,players:freshPlayers.size,maxGamesPerContributor,meanMoverRating:fresh.reduce((sum,p)=>sum+p.rating,0)/fresh.length,uniqueBoards:new Set(fresh.map(key)).size,boardsAlsoInTraining:new Set(fresh.filter(p=>oldBoards.has(key(p))).map(key)).size},overlap:{players:overlap.length,games:0},pooledTrainingExact:true};
await writeFile(new URL('500-cohort-audit.json',folder),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
