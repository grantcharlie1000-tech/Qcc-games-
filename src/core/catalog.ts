import type { GameId, GameModule } from './types';
export interface GameInfo { id: GameId; title: string; color: string; ink: string; accent: string }
export const games: GameInfo[] = [
{id:'color-blocks',title:'Block Blast',color:'#352970',ink:'#fff3df',accent:'#ffcc33'},
{id:'water-sort',title:'Water Sort',color:'#642970',ink:'#fff3df',accent:'#ff66b0'},
{id:'fruit-merge',title:'Suika Game',color:'#295e70',ink:'#fff3df',accent:'#ff5a5f'},
{id:'tower',title:'Stack',color:'#702952',ink:'#fff3df',accent:'#28cbb9'},
{id:'flappy-bird',title:'Flappy Bird',color:'#704d29',ink:'#fff3df',accent:'#ffcc33'},
{id:'ball-run',title:'Ball Run',color:'#472970',ink:'#fff3df',accent:'#ff66b0'},
{id:'animal-stack',title:'Animal Stack',color:'#29706a',ink:'#fff3df',accent:'#ffcc33'},
{id:'snake',title:'Snake',color:'#705b29',ink:'#fff3df',accent:'#ff5a5f'},
{id:'neon-coil',title:'Slither.io',color:'#292970',ink:'#fff3df',accent:'#53c765'},
{id:'minesweeper',title:'Minesweeper',color:'#295870',ink:'#fff3df',accent:'#ff5a5f'},
{id:'solitaire',title:'Solitaire',color:'#70293b',ink:'#fff3df',accent:'#fff3df'},
{id:'block-fill',title:'Block Fill',color:'#582970',ink:'#fff3df',accent:'#ffcc33'},
{id:'color-connect',title:'Flow Free',color:'#702970',ink:'#fff3df',accent:'#ffcc33'},
{id:'pool',title:'Pool',color:'#297056',ink:'#fff3df',accent:'#ffcc33'},
{id:'globle',title:'Globle',color:'#294a70',ink:'#fff3df',accent:'#ffcc33'},
{id:'blockcraft',title:'Minecraft',color:'#705229',ink:'#fff3df',accent:'#53c765'},
{id:'maze-muncher',title:'Pac-Man',color:'#2f2970',ink:'#fff3df',accent:'#28cbb9'},
{id:'corn-clicker',title:'Corn Clicker',color:'#477029',ink:'#fff3df',accent:'#ffcc33'},
{id:'slipline',title:'Slipline',color:'#4a2970',ink:'#fff3df',accent:'#28cbb9'},
{id:'quadfall',title:'Tetris',color:'#293e70',ink:'#fff3df',accent:'#ff9636'},
{id:'fivefold',title:'Wordle',color:'#29704d',ink:'#fff3df',accent:'#53c765'},
{id:'claimline',title:'Claimline',color:'#70294d',ink:'#fff3df',accent:'#ff66b0'},
{id:'crossy-road',title:'Crossy Road',color:'#295870',ink:'#fff3df',accent:'#ff5a5f'},
{id:'quad-clash',title:'Quad Clash',color:'#704329',ink:'#fff3df',accent:'#ffcc33'}
];
const modules = import.meta.glob<{default:GameModule}>('../games/*/index.ts');
export async function loadGame(id:GameId):Promise<GameModule> {
  const load = modules[`../games/${id}/index.ts`];
  if (!load) throw new Error('This game is still being built. Please return to the library.');
  return (await load()).default;
}
export const artUrl = (id:GameId) => `${import.meta.env.BASE_URL}game-art/${id}/cover.svg`;
