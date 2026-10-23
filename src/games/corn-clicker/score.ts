import {Big,format} from './big';
/**
 * Lifetime kernels grow far past the leaderboard's 32-bit integer scores, so they are ranked
 * by log10 in steps of 1/10000: order-preserving, about 0.02% precise, and good to 1e214748.
 */
const SCALE=10000;
export const cornScore=(earned:Big):number=>{
 const log=earned.log10();
 return Number.isFinite(log)&&log>0?Math.min(2147483647,Math.floor(log*SCALE+1e-6)):0;
};
/** Four significant figures, like the game's own number format: the score is not exact beyond that. */
export function cornKernels(score:number):string{
 const value=Big.fromLog10(score/SCALE);
 const n=value.toNumber();
 return value.e<6?(n<1000?Math.round(n):n).toLocaleString('en-GB',{maximumSignificantDigits:4}):format(value);
}
