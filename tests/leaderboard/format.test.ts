import {it,expect} from 'vitest';
import {Big} from '../../src/games/corn-clicker/big';
import {cornScore} from '../../src/games/corn-clicker/score';
import {formatScore} from '../../src/leaderboard/format';
import {validScore} from '../../src/leaderboard/shared';
it('ranks Corn Clicker kernels on a log scale that keeps order and reads back as kernels',()=>{
 const amounts=[Big.of(2),Big.of(5),Big.of(1000),Big.of(123456),Big.fromLog10(9.5),Big.fromLog10(400),Big.fromLog10(5000)];
 const scores=amounts.map(cornScore);
 expect(scores.every(validScore)).toBe(true);
 expect([...scores].sort((a,b)=>a-b)).toEqual(scores);
 expect(cornScore(Big.ZERO)).toBe(0);expect(cornScore(Big.ONE)).toBe(0);
 expect(cornScore(Big.fromLog10(1e9))).toBe(2147483647);
 expect(scores.slice(0,4).map(s=>formatScore('corn-clicker',s))).toEqual(['2','5','1,000','123,500']);
 expect(formatScore('corn-clicker',cornScore(Big.of(4.567e12)))).toBe('4.567 T');
 expect(formatScore('snake',1234)).toBe((1234).toLocaleString());
});

it('formats the new Minesweeper difficulty records as elapsed seconds',()=>{
 expect(formatScore('minesweeper-easy',2147483647-12345)).toBe('12.345 s');
});
