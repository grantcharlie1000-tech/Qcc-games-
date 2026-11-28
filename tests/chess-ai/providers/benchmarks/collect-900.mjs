/** Freeze public Chess.com rapid moves before tuning. Network is used only here. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Chess } from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';

const get = async path => {
  const response = await fetch(`https://api.chess.com/pub/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
};
const members = await get('club/chessdojo/members');
const corpusName = process.argv[2] || 'human-900.json';
const startIndex = Number(process.argv[3] || 0);
if (!/^[a-z0-9-]+\.json$/.test(corpusName) || !Number.isInteger(startIndex) || startIndex < 0) throw new Error('Invalid corpus arguments');
const nameHash = name => createHash('sha256').update(`qcc-900-v1:${name}`).digest('hex');
const names = [...new Set(Object.values(members).flat().map(member => member.username))].sort((a, b) => nameHash(a).localeCompare(nameHash(b)));
console.log(`Checking up to 300 of ${names.length} public club members.`);
const games = new Map();
let players = 0;
for (const name of names.slice(startIndex, startIndex + 300)) {
  const stats = await get(`player/${name}/stats`);
  const rapid = stats.chess_rapid;
  if (!rapid || rapid.last.rating < 750 || rapid.last.rating > 1100 || rapid.record.win + rapid.record.loss + rapid.record.draw < 30) continue;
  const { archives } = await get(`player/${name}/games/archives`);
  if (!archives) continue;
  let found = 0;
  for (const archive of archives.slice(-3).reverse()) {
    const response = await fetch(archive);
    if (!response.ok) throw new Error(`Archive HTTP ${response.status}`);
    const data = await response.json();
    for (const game of data.games) {
      if (!game.rated || game.time_class !== 'rapid' || game.rules !== 'chess' || !game.pgn || games.has(game.url)) continue;
      if (![game.white, game.black].every(side => side.rating >= 800 && side.rating <= 1000)) continue;
      const board = new Chess();
      try { board.loadPgn(game.pgn); } catch { continue; }
      const moves = board.history({ verbose: true }).map(move => move.lan);
      if (moves.length < 50) continue;
      games.set(game.url, { url: game.url, whiteRating: game.white.rating, blackRating: game.black.rating, timeControl: game.time_control, moves });
      found++;
      if (found === 6) break;
    }
    if (found === 6) break;
  }
  if (found) { players++; console.log(`${players} contributing accounts, ${games.size} games`); }
  if (games.size >= 48) break;
}
if (games.size < 24) throw new Error(`Insufficient games: ${games.size}`);
const positions = [];
// Alternate complete games between tuning and held-out sets. Four fixed plies
// cover opening, middlegame and later play without choosing tactical examples.
for (const [index, game] of [...games.values()].entries()) {
  const board = new Chess();
  for (let ply = 0; ply < game.moves.length; ply++) {
    if ([12, 25, 38, 49].includes(ply)) positions.push({
      id: `game-${index + 1}-ply-${ply}`, split: startIndex > 0 || index % 2 ? 'validation' : 'tuning',
      source: game.url, whiteRating: game.whiteRating, blackRating: game.blackRating,
      rating: board.turn() === 'w' ? game.whiteRating : game.blackRating,
      timeControl: game.timeControl, fen: board.fen(), history: game.moves.slice(0, ply), humanMove: game.moves[ply],
    });
    board.move(game.moves[ply]);
  }
}
const report = { generatedAt: new Date().toISOString(), source: 'https://www.chess.com/news/view/published-data-api',
  method: `Serial public API requests. SHA256(qcc-900-v1:username)-ordered members of chessdojo, indices ${startIndex}-${startIndex + 299}, with 30+ rapid games and current rapid 750-1100; up to six rated standard rapid games per account from their last three archives, both game ratings 800-1000, at least 50 plies. Stop after 48 games. First eligible games in archive order. No move-quality filtering. ${startIndex ? 'All games held out for fresh validation.' : 'Complete games alternate tuning/validation.'} Fixed plies 12,25,38,49.`,
  games: games.size, contributingAccounts: players, positions };
await mkdir(new URL('./hillclimb-900/', import.meta.url), { recursive: true });
await writeFile(new URL(`./hillclimb-900/${corpusName}`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(`Frozen ${positions.length} positions from ${games.size} games.`);
