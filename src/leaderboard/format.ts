import type {GameId} from '../core/types';
import {cornKernels} from '../games/corn-clicker/score';
/** Leaderboard scores are integers; Corn Clicker stores its kernels on a log scale. */
export const formatScore=(game:GameId,score:number)=>game==='corn-clicker'?cornKernels(score):score.toLocaleString();
