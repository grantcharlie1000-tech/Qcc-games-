import type {GameId} from '../core/types';
export const SCORED_GAMES:readonly GameId[]=['fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','minesweeper','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird','corn-clicker','slipline','quadfall'];
export const MINESWEEPER_RANKINGS=['minesweeper-easy','minesweeper-medium','minesweeper-hard','minesweeper-score'] as const;
export type LeaderboardKey=GameId|typeof MINESWEEPER_RANKINGS[number];
export const scoredGame=(value:unknown):value is LeaderboardKey=>typeof value==='string'&&(SCORED_GAMES.includes(value as GameId)||MINESWEEPER_RANKINGS.includes(value as typeof MINESWEEPER_RANKINGS[number]));
export const validScore=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>0&&value<=2147483647;
export const validName=(value:unknown):value is string=>typeof value==='string'&&value===value.trim()&&value.length>=2&&value.length<=24&&!/[\p{C}<>]/u.test(value);
export interface Entry {rank:number;playerId:string;name:string;score:number;account?:boolean}
export interface Board {entries:Entry[];player:Entry|null}
export function readBoard(value:unknown):Board|null{
 if(!value||typeof value!=='object')return null;
 const board=value as Board;
 const entry=(e:Entry)=>e&&Number.isSafeInteger(e.rank)&&e.rank>0&&validScore(e.score)&&validName(e.name)&&typeof e.playerId==='string'&&/^[a-f0-9]{64}$/.test(e.playerId);
 return Array.isArray(board.entries)&&board.entries.length<=25&&board.entries.every(entry)&&(board.player===null||entry(board.player))?board:null;
}
