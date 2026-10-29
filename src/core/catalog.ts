import type { GameId, GameModule } from './types';
export interface GameInfo { id: GameId; title: string; color: string; ink: string; accent: string; genre: 'Puzzle'|'Arcade'|'Classic'; blurb: string }
export const games: GameInfo[] = [
{id:'color-blocks',title:'Block Blast',color:'#382841',ink:'#ffd04c',accent:'#ffca3a',genre:'Puzzle',blurb:'Fit blocks on the board and clear full rows and columns before you run out of room.'},
{id:'water-sort',title:'Water Sort',color:'#594263',ink:'#e4b5f7',accent:'#dca8ed',genre:'Puzzle',blurb:'Pour coloured water between tubes until every tube holds a single colour.'},
{id:'fruit-merge',title:'Suika Game',color:'#ffe7ac',ink:'#d34c37',accent:'#df4e37',genre:'Puzzle',blurb:'Drop fruit into the jar and merge matching pairs into bigger fruit without overflowing.'},
{id:'tower',title:'Stack',color:'#c78dcd',ink:'#254b68',accent:'#345e7c',genre:'Arcade',blurb:'Time each drop and stack the sliding blocks as high as you can.'},
{id:'flappy-bird',title:'Flappy Bird',color:'#f9d9a7',ink:'#245f60',accent:'#258b8b',genre:'Arcade',blurb:'Tap to flap through the reed gates. One touch ends the run.'},
{id:'ball-run',title:'Ball Run',color:'#080b20',ink:'#e448b3',accent:'#e448b3',genre:'Arcade',blurb:'Steer a rolling ball down a twisting course while the speed keeps climbing.'},
{id:'animal-stack',title:'Animal Stack',color:'#08b6d5',ink:'#203d42',accent:'#213d44',genre:'Classic',blurb:'Balance animal cutouts into a tower that stays standing.'},
{id:'snake',title:'Snake',color:'#f9dda2',ink:'#dc624b',accent:'#dc624b',genre:'Arcade',blurb:'Eat, grow longer and never bite your own tail.'},
{id:'neon-coil',title:'Slither.io',color:'#0c1727',ink:'#c5f97f',accent:'#b9f655',genre:'Arcade',blurb:'Glide through the arena, collect light and outgrow the other coils.'},
{id:'minesweeper',title:'Minesweeper',color:'#303f49',ink:'#ebf3f4',accent:'#ebf3f4',genre:'Puzzle',blurb:'Read the number clues to clear the field and flag every mine.'},
{id:'solitaire',title:'Solitaire',color:'#108746',ink:'#053f22',accent:'#07512a',genre:'Classic',blurb:'Classic Klondike patience: build each suit from ace to king.'},
{id:'block-fill',title:'Block Fill',color:'#303638',ink:'#c1c3c9',accent:'#c1c3c9',genre:'Puzzle',blurb:'Draw one path that fills every square on the board.'},
{id:'color-connect',title:'Flow Free',color:'#54405f',ink:'#ffcd46',accent:'#ffcd46',genre:'Puzzle',blurb:'Join matching dots and fill the whole grid with pipes.'},
{id:'pool',title:'Pool',color:'#007b49',ink:'#e4edb3',accent:'#e4edb3',genre:'Classic',blurb:'Pot your set and sink the eight, solo or against a friend online.'},
{id:'globle',title:'Globle',color:'#123a5e',ink:'#ffe0a4',accent:'#ffe0a4',genre:'Classic',blurb:'Guess the mystery country. Every guess shows how close you are.'},
{id:'blockcraft',title:'Minecraft',color:'#8fd0f7',ink:'#1f4a1a',accent:'#2c6b22',genre:'Classic',blurb:'Explore, mine, craft and build in an endless block world.'},
{id:'maze-muncher',title:'Pac-Man',color:'#10153a',ink:'#ffe14d',accent:'#3fe0bd',genre:'Arcade',blurb:'Clear the maze of dots while four chasers hunt you down.'},
{id:'corn-clicker',title:'Corn Clicker',color:'#2f5d1e',ink:'#ffe14d',accent:'#ffd447',genre:'Classic',blurb:'Click the cob, hire farmhands and grow a corn empire, even while you are away.'},
{id:'slipline',title:'Slipline',color:'#202032',ink:'#eee7ff',accent:'#5cddbb',genre:'Puzzle',blurb:'Slide each arrow out along its route without hitting another.'},
{id:'quadfall',title:'Tetris',color:'#101631',ink:'#7ee0ff',accent:'#ff9f43',genre:'Puzzle',blurb:'Rotate falling pieces and clear lines before the stack reaches the top.'},
{id:'fivefold',title:'Wordle',color:'#1d2b24',ink:'#f4e9c8',accent:'#6fbf73',genre:'Puzzle',blurb:'Guess the five-letter word in six tries. A new puzzle every day.'}
];
const modules = import.meta.glob<{default:GameModule}>('../games/*/index.ts');
export async function loadGame(id:GameId):Promise<GameModule> {
  const load = modules[`../games/${id}/index.ts`];
  if (!load) throw new Error('This game is still being built. Please return to the library.');
  return (await load()).default;
}
export const artUrl = (id:GameId) => `${import.meta.env.BASE_URL}game-art/${id}/cover.svg`;
