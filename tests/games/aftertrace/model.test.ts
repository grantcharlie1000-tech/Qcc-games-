import {describe,it,expect} from 'vitest';
import {begin,fire,makeWorld,resize,restore,snapshot,step} from '../../../src/games/aftertrace/model';

describe('Aftertrace original rules',()=>{
 it('starts with two pursuers and a collectible, and runs deterministically',()=>{
   const a=makeWorld(390,844,42),b=makeWorld(390,844,42);begin(a);begin(b);
   for(let i=0;i<80;i++){step(a,1/60,1,0);step(b,1/60,1,0);}
   expect(snapshot(a)).toEqual(snapshot(b));expect(a.seconds).toBeGreaterThan(1);expect(a.enemies.length).toBeGreaterThanOrEqual(2);
 });
 it('needs charge and a drawn path to pulse',()=>{
   const s=makeWorld(390,844,4);begin(s);expect(fire(s).pulse).toBe(0);
   for(let i=0;i<60;i++)step(s,1/60,.8,-.6);
   expect(s.trail.length).toBeGreaterThan(4);expect(fire(s).pulse).toBe(1);expect(s.pulsePath.length).toBeGreaterThan(4);
   expect(fire(s).pulse).toBe(0);expect(s.charge).toBeLessThan(1);
 });
 it('an ignited segment catches pursuing drones and awards combos',()=>{
   const s=makeWorld(390,844,9);begin(s);
   s.enemies=[];s.trail=[{x:100,y:250,t:0},{x:180,y:250,t:0},{x:260,y:250,t:0},{x:330,y:250,t:0}];
   s.enemies.push({id:77,x:160,y:260,vx:0,vy:0,speed:0,kind:0,phase:0,radius:13});
   s.enemies.push({id:78,x:230,y:260,vx:0,vy:0,speed:0,kind:0,phase:0,radius:13});
   expect(fire(s).pulse).toBe(1);
   const before=s.score;const e=step(s,1/60,0,0);
   expect(e.kills).toBe(2);expect(s.kills).toBe(2);expect(s.score-before).toBeGreaterThan(250);
 });
 it('pauses naturally when not playing and ends after three hits',()=>{
   const s=makeWorld(390,844,14);expect(step(s,1,1,0).kills).toBe(0);expect(s.seconds).toBe(0);
   begin(s);s.enemies=[];
   for(let i=0;i<3;i++){s.hurtFor=0;s.enemies.push({id:i+10,x:s.player.x,y:s.player.y,vx:0,vy:0,speed:0,kind:0,phase:0,radius:13});step(s,1/60,0,0);}
   expect(s.phase).toBe('over');expect(s.lives).toBe(0);
 });
 it('saves/restores safely and rejects malformed untrusted snapshots',()=>{
   const s=makeWorld(390,844,45);begin(s);for(let i=0;i<80;i++)step(s,1/60,1,0);
   const loaded=restore(snapshot(s),1366,768)!;
   expect(loaded).not.toBeNull();expect(loaded.width).toBe(1366);expect(loaded.height).toBe(768);
   expect(loaded.score).toBe(s.score);expect(loaded.player.x).toBeGreaterThan(s.player.x);
   expect(restore({version:1,phase:'playing',width:390,height:844},390,844)).toBeNull();
   expect(restore({...snapshot(s),enemies:Array(1000).fill({})},390,844)).toBeNull();
 });
});
