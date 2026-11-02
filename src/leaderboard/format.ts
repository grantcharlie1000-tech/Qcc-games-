import type {LeaderboardKey} from './shared';
import {cornKernels} from '../games/corn-clicker/score';
import {formatShare} from '../games/claimline/score';
/** Leaderboard scores are integers; Corn Clicker stores its kernels on a log scale and Claimline its peak share in hundredths of a percent. */
export const formatScore=(game:LeaderboardKey,score:number)=>game.startsWith('minesweeper-')&&game!=='minesweeper-score'?((2147483647-score)/1000).toFixed(3)+' s':game==='corn-clicker'?cornKernels(score):game==='claimline'?formatShare(score):score.toLocaleString();
