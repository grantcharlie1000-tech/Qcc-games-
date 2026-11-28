/** Freeze a new holdout after retiring the first 500 validation sample. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Chess} from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';
const folder=new URL('./hillclimb-tiers/',import.meta.url);
const generation=Number(process.argv[2]||2);
if(![2,3].includes(generation))throw Error('Validation generation must be2or3');
const targetGames=generation===3?80:48;
const target=new URL(`human-500-validation-${generation}.json`,folder);
if(existsSync(target))throw Error('Refuse to overwrite frozen validation');
const cache=new URL('../../../../.omc/state/chess-tiers-api-cache/',import.meta.url);
await mkdir(cache,{recursive:true});
const hash=x=>createHash('sha256').update(x).digest('hex');
async function get(path) {
  const url=path.startsWith('https://')?path:`https://api.chess.com/pub/${path}`;
  const file=new URL(`${hash(url)}.json`,cache);
  try{return JSON.parse(await readFile(file));}catch(error){if(error.code!=='ENOENT')throw error;}
  const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{connection:'close'}});
  if(response.status===404)return {};
  if(!response.ok)throw Error(`${path}: HTTP ${response.status}`);
  const data=await response.json();await writeFile(file,JSON.stringify(data));return data;
}
const originalBytes=await readFile(new URL('human-500.json',folder)),original=JSON.parse(originalBytes);
const retiredPositions=[...original.positions],inputCorpora=[{name:'human-500.json',sha256:hash(originalBytes)}];
if(generation===3) {
  const bytes=await readFile(new URL('human-500-validation-2.json',folder));
  retiredPositions.push(...JSON.parse(bytes).positions);
  inputCorpora.push({name:'human-500-validation-2.json',sha256:hash(bytes)});
}
const oldGames=new Set(retiredPositions.map(p=>p.source));
const excluded=new Set(retiredPositions.map(p=>p.contributor.toLowerCase())),found=new Set();
for(const p of retiredPositions)if(p.whiteUser&&p.blackUser){excluded.add(p.whiteUser);excluded.add(p.blackUser);found.add(p.source);}
for(const name of new Set(original.positions.map(p=>p.contributor))) {
  const {archives=[]}=await get(`player/${name}/games/archives`);
  for(const archive of archives.slice(-3))for(const game of (await get(archive)).games||[])if(oldGames.has(game.url)) {
    found.add(game.url);excluded.add(game.white.username.toLowerCase());excluded.add(game.black.username.toLowerCase());
  }
}
if(found.size!==oldGames.size)throw Error('Cannot prove both-player separation from all retired games');
const clubs=['beginners-and-masters','the-beginners-chess-club','chessdojo'],members=new Map();
for(const club of clubs)for(const member of Object.values(await get(`club/${club}/members`)).flat())if(member?.username)members.set(member.username.toLowerCase(),club);
const names=[...members.keys()].sort((a,b)=>hash(`qcc-tiers-v${generation}:`+a).localeCompare(hash(`qcc-tiers-v${generation}:`+b)));
const games=new Map(),contributors=new Set();let checked=0;
for(const name of names.slice(0,2500)) {
  if(excluded.has(name))continue;
  const rapid=(await get(`player/${name}/stats`)).chess_rapid;checked++;
  if(!rapid||rapid.last.rating<350||rapid.last.rating>=650||Object.values(rapid.record).reduce((a,b)=>a+b,0)<30)continue;
  const {archives=[]}=await get(`player/${name}/games/archives`);let added=0;
  for(const archive of archives.slice(-3).reverse()) {
    for(const game of (await get(archive)).games||[]) {
      if(!game.rated||game.time_class!=='rapid'||game.rules!=='chess'||!game.pgn||games.has(game.url)||oldGames.has(game.url))continue;
      if(![game.white,game.black].every(p=>p.rating>=400&&p.rating<600&&!excluded.has(p.username.toLowerCase())))continue;
      const board=new Chess();try{board.loadPgn(game.pgn);}catch{continue;}
      const moves=board.history({verbose:true}).map(move=>move.lan);if(moves.length<20)continue;
      games.set(game.url,{source:game.url,club:members.get(name),contributor:name,whiteUser:game.white.username.toLowerCase(),blackUser:game.black.username.toLowerCase(),whiteRating:game.white.rating,blackRating:game.black.rating,timeControl:game.time_control,moves});
      contributors.add(name);added++;
      if(added>=3||games.size>=targetGames)break;
    }
    if(added>=3||games.size>=targetGames)break;
  }
  if(added)console.log(`${checked} accounts checked: ${games.size}/${targetGames} games, ${contributors.size} contributors`);
  if(games.size>=targetGames)break;
}
if(games.size!==targetGames||contributors.size<Math.ceil(targetGames/3))throw Error('Insufficient fresh cohort; retain cached data without weakening eligibility');
const positions=[];
for(const game of games.values()) {
  const selected=new Set([.15,.35,.6,.8].map(f=>Math.floor(game.moves.length*f))),board=new Chess();
  for(let ply=0;ply<game.moves.length;ply++) {
    if(selected.has(ply))positions.push({id:`500v${generation}-${positions.length}`,split:'validation',source:game.source,club:game.club,contributor:game.contributor,whiteUser:game.whiteUser,blackUser:game.blackUser,whiteRating:game.whiteRating,blackRating:game.blackRating,rating:board.turn()==='w'?game.whiteRating:game.blackRating,timeControl:game.timeControl,fen:board.fen(),history:game.moves.slice(0,ply),humanMove:game.moves[ply]});
    board.move(game.moves[ply]);
  }
}
const generatedAt=new Date().toISOString();
const report={generatedAt,tier:500,source:'https://www.chess.com/news/view/published-data-api',method:`Fresh validation only, frozen before round${generation+12}tuning. Hash-ordered members of the same three clubs with a new salt. Current rapid350-649 and30+ rapid games. Last three archives, up to three games per contributor, first${targetGames}eligible games. Both players400-599; rated standard rapid;20+ plies. Both players from all${oldGames.size}retired games excluded; all original40games resolved from raw archives and subsequent frozen positions retain both names. Four unfiltered game-length fractions. No quality scores consulted. Convenience sample, not a platform rating.`,clubs,checkedAccounts:checked,games:games.size,contributingAccounts:contributors.size,inputCorpora,excludedOldPlayers:excluded.size,excludedOldPlayersSha256:hash([...excluded].sort().join('\n')),oldGamesResolved:found.size,positions};
await writeFile(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
await writeFile(new URL(generation===2?'human-500-retired-training.json':'human-500-pooled-training.json',folder),JSON.stringify({...original,generatedAt,checkedAccounts:undefined,games:oldGames.size,contributingAccounts:new Set(retiredPositions.map(p=>p.contributor)).size,method:`All${retiredPositions.length}positions from retired500corpora pooled into tuning. Only split changes. Never use this corpus as independent validation.`,inputCorpora,positions:retiredPositions.map(p=>({...p,split:'tuning'}))},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({generatedAt,positions:positions.length,games:games.size,contributors:contributors.size,excludedOldPlayers:excluded.size,oldGamesResolved:found.size,sha256:hash(await readFile(target))}));
