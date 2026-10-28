import type {LeaderboardKey} from './shared';
import {cornKernels} from '../games/corn-clicker/score';
/** Leaderboard scores are integers; Corn Clicker stores its kernels on a log scale. */
export const formatScore=(game:LeaderboardKey,score:number)=>game.startsWith('minesweeper-')?((2147483647-score)/1000).toFixed(3)+' s':game==='corn-clicker'?cornKernels(score):score.toLocaleString();
