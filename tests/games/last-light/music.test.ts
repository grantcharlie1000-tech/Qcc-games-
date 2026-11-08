import {expect,it} from 'vitest';
import {readFileSync,statSync} from 'node:fs';
import {composition,SCORE,THEME_SECONDS,midi} from '../../../src/games/last-light/music-score';
it('ships a complete original 32-bar score with a measured, non-clipping loop',()=>{
 const notes=composition();expect(SCORE.bars).toBe(32);expect(THEME_SECONDS).toBeCloseTo(71.111111,5);
 expect(new Set(notes.map(n=>n.voice))).toEqual(new Set(['lead','answer','arp','bass','pad']));
 expect(new Set(notes.filter(n=>n.voice==='lead').map(n=>Math.floor(n.beat/4))).size).toBe(32);
 expect(notes.every(n=>Number.isFinite(n.beat)&&n.beat>=0&&n.beat<128&&n.length>0&&n.midi>=24&&n.midi<=96&&n.velocity>0&&n.velocity<=1)).toBe(true);
 expect(notes.every((n,i)=>i===0||n.beat>=notes[i-1].beat)).toBe(true);
 const stats=JSON.parse(readFileSync('public/game-art/last-light/audio/score.json','utf8'));
 expect(stats.seconds).toBeCloseTo(THEME_SECONDS,5);expect(stats.peak).toBeLessThan(.95);expect(stats.rms).toBeGreaterThan(.05);expect(stats.seamDelta).toBeLessThan(.002);
 expect(statSync('public/game-art/last-light/audio/a-light-left-on.mp3').size).toBeGreaterThan(100000);
 expect(midi('A4')).toBe(69);expect(midi('G#3')).toBe(56);expect(()=>midi('Z4')).toThrow();
});
