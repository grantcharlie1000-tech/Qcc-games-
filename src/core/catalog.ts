import type { GameId, GameModule } from './types';
export interface GameInfo { id: GameId; title: string; color: string; ink: string; accent: string }
export const games: GameInfo[] = [
{id:'color-blocks',title:'Color Blocks',color:'#382841',ink:'#ffd04c',accent:'#ffca3a'},
{id:'water-sort',title:'Water Sort',color:'#594263',ink:'#e4b5f7',accent:'#dca8ed'},
{id:'fruit-merge',title:'Fruit Merge',color:'#ffe7ac',ink:'#d34c37',accent:'#df4e37'},
{id:'tower',title:'Tower',color:'#c78dcd',ink:'#254b68',accent:'#345e7c'},
{id:'flappy-bird',title:'Flappy Bird',color:'#f9d9a7',ink:'#245f60',accent:'#258b8b'},
{id:'ball-run',title:'Ball Run',color:'#080b20',ink:'#e448b3',accent:'#e448b3'},
{id:'animal-stack',title:'Animal Stack',color:'#08b6d5',ink:'#203d42',accent:'#213d44'},
{id:'snake',title:'Snake',color:'#f9dda2',ink:'#dc624b',accent:'#dc624b'},
{id:'neon-coil',title:'Neon Coil',color:'#0c1727',ink:'#c5f97f',accent:'#b9f655'},
{id:'minesweeper',title:'Minesweeper',color:'#303f49',ink:'#ebf3f4',accent:'#ebf3f4'},
{id:'solitaire',title:'Solitaire',color:'#108746',ink:'#053f22',accent:'#07512a'},
{id:'block-fill',title:'Block Fill',color:'#303638',ink:'#c1c3c9',accent:'#c1c3c9'},
{id:'color-connect',title:'Color Connect',color:'#54405f',ink:'#ffcd46',accent:'#ffcd46'},
{id:'pool',title:'Pool',color:'#007b49',ink:'#e4edb3',accent:'#e4edb3'},
{id:'globle',title:'Globle',color:'#123a5e',ink:'#ffe0a4',accent:'#ffe0a4'},
{id:'blockcraft',title:'Blockcraft',color:'#8fd0f7',ink:'#1f4a1a',accent:'#2c6b22'},
{id:'maze-muncher',title:'Maze Muncher',color:'#10153a',ink:'#ffe14d',accent:'#3fe0bd'},
{id:'corn-clicker',title:'Corn Clicker',color:'#2f5d1e',ink:'#ffe14d',accent:'#ffd447'},
{id:'slipline',title:'Slipline',color:'#1e1e2c',ink:'#b4b3d2',accent:'#945171'},
{id:'quadfall',title:'Quadfall',color:'#101631',ink:'#7ee0ff',accent:'#ff9f43'},
{id:'fivefold',title:'Fivefold',color:'#1d2b24',ink:'#f4e9c8',accent:'#6fbf73'}
];
const modules = import.meta.glob<{default:GameModule}>('../games/*/index.ts');
export async function loadGame(id:GameId):Promise<GameModule> {
  const load = modules[`../games/${id}/index.ts`];
  if (!load) throw new Error('This game is still being built. Please return to the library.');
  return (await load()).default;
}
export const artUrl = (id:GameId) => `${import.meta.env.BASE_URL}game-art/${id}/cover.svg`;
