import type { GameId, GameModule } from './types';
export interface GameInfo { id: GameId; title: string; color: string; ink: string; accent: string }
export const games: GameInfo[] = [
{id:'color-blocks',title:'Block Blast',color:'#271f4c',ink:'#fff3df',accent:'#f7c531'},
{id:'water-sort',title:'Water Sort',color:'#451f4c',ink:'#fff3df',accent:'#f05fa6'},
{id:'fruit-merge',title:'Suika Game',color:'#1f414c',ink:'#fff3df',accent:'#e8474f'},
{id:'tower',title:'Stack',color:'#4c1f39',ink:'#fff3df',accent:'#25b6a6'},
{id:'flappy-bird',title:'Flappy Bird',color:'#4c361f',ink:'#fff3df',accent:'#f7c531'},
{id:'ball-run',title:'Ball Run',color:'#321f4c',ink:'#fff3df',accent:'#f05fa6'},
{id:'animal-stack',title:'Animal Stack',color:'#1f4c48',ink:'#fff3df',accent:'#f7c531'},
{id:'snake',title:'Snake',color:'#4c3f1f',ink:'#fff3df',accent:'#e8474f'},
{id:'neon-coil',title:'Slither.io',color:'#1f1f4c',ink:'#fff3df',accent:'#9ad547'},
{id:'minesweeper',title:'Minesweeper',color:'#1f3d4c',ink:'#fff3df',accent:'#e8474f'},
{id:'solitaire',title:'Solitaire',color:'#4c1f2a',ink:'#fff3df',accent:'#f4e6c8'},
{id:'block-fill',title:'Block Fill',color:'#3d1f4c',ink:'#fff3df',accent:'#f7c531'},
{id:'color-connect',title:'Flow Free',color:'#4c1f4c',ink:'#fff3df',accent:'#f7c531'},
{id:'pool',title:'Pool',color:'#1f4c3c',ink:'#fff3df',accent:'#f7c531'},
{id:'globle',title:'Globle',color:'#1f344c',ink:'#fff3df',accent:'#f7c531'},
{id:'blockcraft',title:'Minecraft',color:'#1f394c',ink:'#fff3df',accent:'#4fb548'},
{id:'maze-muncher',title:'Pac-Man',color:'#231f4c',ink:'#fff3df',accent:'#25b6a6'},
{id:'corn-clicker',title:'Corn Clicker',color:'#324c1f',ink:'#fff3df',accent:'#f7c531'},
{id:'slipline',title:'Slipline',color:'#341f4c',ink:'#fff3df',accent:'#25b6a6'},
{id:'quadfall',title:'Tetris',color:'#1f2d4c',ink:'#fff3df',accent:'#f59331'},
{id:'fivefold',title:'Wordle',color:'#1f4c36',ink:'#fff3df',accent:'#4fb548'},
{id:'claimline',title:'Claimline',color:'#4c1f36',ink:'#fff3df',accent:'#f05fa6'},
{id:'crossy-road',title:'Crossy Road',color:'#1f3d4c',ink:'#fff3df',accent:'#e8474f'},
{id:'quad-clash',title:'Quad Clash',color:'#4c301f',ink:'#fff3df',accent:'#f7c531'},
{id:'femboy-obby',title:'Femboy Frosthop',color:'#2b1f4c',ink:'#fff3df',accent:'#f05fa6'},
{id:'drift-club',title:'Drift Club',color:'#1f4a4c',ink:'#fff3df',accent:'#f7c531'}
];
const modules = import.meta.glob<{default:GameModule}>('../games/*/index.ts');
export async function loadGame(id:GameId):Promise<GameModule> {
  const load = modules[`../games/${id}/index.ts`];
  if (!load) throw new Error('This game is still being built. Please return to the library.');
  return (await load()).default;
}
export const artUrl = (id:GameId) => `${import.meta.env.BASE_URL}game-art/${id}/cover.svg`;
