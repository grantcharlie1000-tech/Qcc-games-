import type { GameId, GameModule } from './types';
export interface GameInfo { id: GameId; title: string; color: string; ink: string; accent: string }
export const games: GameInfo[] = [
{id:'voxelibre',title:'VoxeLibre',color:'#172c27',ink:'#e9edbe',accent:'#b4db6d'},
{id:'color-blocks',title:'Color Blocks',color:'#382841',ink:'#ffd04c',accent:'#ffca3a'},
{id:'water-sort',title:'Water Sort',color:'#594263',ink:'#e4b5f7',accent:'#dca8ed'},
{id:'fruit-merge',title:'Fruit Merge',color:'#ffe7ac',ink:'#d34c37',accent:'#df4e37'},
{id:'tower',title:'Tower',color:'#c78dcd',ink:'#254b68',accent:'#345e7c'},
{id:'flappy-bird',title:'Flappy Bird',color:'#f9d9a7',ink:'#245f60',accent:'#258b8b'},
{id:'ball-run',title:'Ball Run',color:'#080b20',ink:'#e448b3',accent:'#e448b3'},
{id:'animal-stack',title:'Animal Stack',color:'#08b6d5',ink:'#203d42',accent:'#213d44'},
{id:'snake',title:'Snake',color:'#f9dda2',ink:'#dc624b',accent:'#dc624b'},
{id:'minesweeper',title:'Minesweeper',color:'#303f49',ink:'#ebf3f4',accent:'#ebf3f4'},
{id:'solitaire',title:'Solitaire',color:'#108746',ink:'#053f22',accent:'#07512a'},
{id:'block-fill',title:'Block Fill',color:'#303638',ink:'#c1c3c9',accent:'#c1c3c9'},
{id:'color-connect',title:'Color Connect',color:'#54405f',ink:'#ffcd46',accent:'#ffcd46'},
{id:'pool',title:'Pool',color:'#007b49',ink:'#e4edb3',accent:'#e4edb3'}
];
const modules = import.meta.glob<{default:GameModule}>('../games/*/index.ts');
export async function loadGame(id:GameId):Promise<GameModule> {
  const load = modules[`../games/${id}/index.ts`];
  if (!load) throw new Error('This game is still being built. Please return to the library.');
  return (await load()).default;
}
export const artUrl = (id:GameId) => `${import.meta.env.BASE_URL}game-art/${id}/cover.svg`;
