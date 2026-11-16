/** Serial, cached public-data collection. Freeze all splits before tuning. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {existsSync} from 'node:fs';
import { Chess } from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';
const folder = new URL('./hillclimb-tiers/', import.meta.url);
if([300,500,700,900].some(tier=>existsSync(new URL(`human-${tier}.json`,folder))))throw Error('Refuse to overwrite frozen human cohorts');
const cache = new URL('../../../../.omc/state/chess-tiers-api-cache/', import.meta.url);
await mkdir(folder,{recursive:true}); await mkdir(cache,{recursive:true});
const hash = value=>createHash('sha256').update(value).digest('hex');
const get = async path => {
  const url=path.startsWith('https://')?path:`https://api.chess.com/pub/${path}`;
  const file=new URL(`${hash(url)}.json`,cache);
  try { return JSON.parse(await readFile(file,'utf8')); } catch {}
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(response.status===404)return {};
  if(!response.ok)throw Error(`${path}: HTTP ${response.status}`);
  const data=await response.json(); await writeFile(file,JSON.stringify(data)); return data;
};
const clubs=['beginners-and-masters','the-beginners-chess-club','chessdojo'];
const members=new Map();
for(const club of clubs) {
  const data=await get(`club/${club}/members`);
  for(const member of Object.values(data).flat())if(member?.username)members.set(member.username.toLowerCase(),club);
}
const names=[...members.keys()].sort((a,b)=>hash('qcc-tiers-v1:'+a).localeCompare(hash('qcc-tiers-v1:'+b)));
const tiers=[300,500,700,900], games=new Map(tiers.map(tier=>[tier,new Map()])), contributors=new Map(tiers.map(tier=>[tier,new Set()]));
let checked=0;
for(const name of names.slice(0,2500)) {
  const stats=await get(`player/${name}/stats`), rapid=stats.chess_rapid; checked++;
  if(!rapid || rapid.last.rating<150 || rapid.last.rating>1050 || Object.values(rapid.record).reduce((a,b)=>a+b,0)<30)continue;
  const likely=tiers.find(tier=>rapid.last.rating>=tier-150 && rapid.last.rating<tier+150 && games.get(tier).size<40);
  if(!likely)continue;
  const {archives=[]}=await get(`player/${name}/games/archives`);
  const added=new Map();
  for(const archive of archives.slice(-3).reverse()) {
    const data=await get(archive);
    for(const game of data.games||[]) {
      if(!game.rated||game.time_class!=='rapid'||game.rules!=='chess'||!game.pgn)continue;
      const tier=tiers.find(t=>[game.white,game.black].every(p=>p.rating>=t-100 && p.rating<t+100));
      if(!tier||games.get(tier).size>=40||games.get(tier).has(game.url)||(added.get(tier)||0)>=4)continue;
      const board=new Chess(); try {board.loadPgn(game.pgn);} catch {continue;}
      const moves=board.history({verbose:true}).map(move=>move.lan); if(moves.length<20)continue;
      games.get(tier).set(game.url,{source:game.url,club:members.get(name),contributor:name,whiteRating:game.white.rating,blackRating:game.black.rating,timeControl:game.time_control,moves});
      contributors.get(tier).add(name);added.set(tier,(added.get(tier)||0)+1);
    }
    if((added.get(likely)||0)>=4)break;
  }
  if(added.size)console.log(`${checked} accounts checked: ${tiers.map(t=>`${t}: ${games.get(t).size} games / ${contributors.get(t).size} contributors`).join('; ')}`);
  if(tiers.every(t=>games.get(t).size>=40))break;
}
if(tiers.some(t=>games.get(t).size<32||contributors.get(t).size<8))throw Error('Insufficient corpus; do not silently weaken eligibility. Cached data remains for resuming.');
for(const tier of tiers) {
  const positions=[], players=[...contributors.get(tier)].sort((a,b)=>hash(a).localeCompare(hash(b)));
  for(const game of games.get(tier).values()) {
    const split=players.indexOf(game.contributor)%2?'validation':'tuning';
    const selected=new Set([.15,.35,.6,.8].map(f=>Math.floor(game.moves.length*f)));
    const board=new Chess();
    for(let ply=0;ply<game.moves.length;ply++) {
      if(selected.has(ply))positions.push({id:`${tier}-${positions.length}`,split,source:game.source,club:game.club,contributor:game.contributor,whiteRating:game.whiteRating,blackRating:game.blackRating,rating:board.turn()==='w'?game.whiteRating:game.blackRating,timeControl:game.timeControl,fen:board.fen(),history:game.moves.slice(0,ply),humanMove:game.moves[ply]});
      board.move(game.moves[ply]);
    }
  }
  const report={generatedAt:new Date().toISOString(),tier,source:'https://www.chess.com/news/view/published-data-api',method:'Serial public API, cached. SHA256(qcc-tiers-v1:username) ordered members of three clubs, first 2500. Current rapid 150-1050 and 30+ rapid games. Last three game archives; up to four eligible games per contributing account per tier, stop at 40 games. Rated standard rapid, BOTH game ratings in [target-100,target+100), games at least 20 plies. Four positions at floor(length * .15/.35/.6/.8), no move-quality filtering. Contributor accounts split before evaluation by hash order, alternating tuning/validation. Convenience sample, not a platform rating.',clubs,checkedAccounts:checked,games:games.get(tier).size,contributingAccounts:contributors.get(tier).size,positions};
  await writeFile(new URL(`human-${tier}.json`,folder),JSON.stringify(report,null,2)+'\n');
  console.log(`${tier}: frozen ${positions.length} positions, ${positions.filter(p=>p.split==='tuning').length} tuning / ${positions.filter(p=>p.split==='validation').length} validation`);
}
