import {expect,it} from 'vitest';
import {readFileSync,statSync} from 'node:fs';
import {composition,SCORE,THEME_SECONDS} from '../../src/festive/music-score';
import {christmasMusicAllowed} from '../../src/festive/music';

it('composes a complete original Christmas waltz and ships a quiet, continuous loop',()=>{
 const notes=composition();expect(SCORE).toMatchObject({bpm:96,bars:32,beatsPerBar:3});expect(THEME_SECONDS).toBe(60);
 expect(new Set(notes.filter(n=>n.voice==='celesta').map(n=>Math.floor(n.beat/3))).size).toBe(32);
 expect(new Set(notes.map(n=>n.voice))).toEqual(new Set(['celesta','strings','plucked','bass','flute']));
 expect(notes.every(n=>n.beat>=0&&n.beat<96&&n.length>0&&n.midi>=24&&n.midi<=96&&n.velocity>0&&n.velocity<=1)).toBe(true);
 expect(notes.every((n,i)=>i===0||n.beat>=notes[i-1].beat)).toBe(true);
 const stats=JSON.parse(readFileSync('public/audio/christmas/score.json','utf8'));expect(stats.seconds).toBe(60);expect(stats.peak).toBeLessThan(.95);expect(stats.rms).toBeGreaterThan(.05);expect(stats.seamDelta).toBeLessThan(.01);expect(stats.seamSlopeError).toBeLessThan(.002);
 expect(statSync('public/audio/christmas/snowfall-on-the-square.mp3').size).toBeGreaterThan(100000);
});
it('allows app browsing and games while keeping all study and video play routes quiet',()=>{
 for(const hash of ['#/collection','#/collection/26','#/game/last-light','#/santa','#/social','#/chat','#/movies/browse/movie','#/movies/movie-frost'])expect(christmasMusicAllowed(hash,false),hash).toBe(true);
 for(const hash of ['#/study','#/study/topic','#/study?chapter=1','#/movies/movie-frost/play','#/movies/tv-snow/season/1/episode/2/play','#/movies/movie-frost/play?server=1'])expect(christmasMusicAllowed(hash,false),hash).toBe(false);
 expect(christmasMusicAllowed('#/collection',true)).toBe(false);
});
