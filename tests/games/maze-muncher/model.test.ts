import {describe,expect,it} from 'vitest';
import {COLS,ROWS,MAZE,open,createState,start,steer,step,restoreState,ghostTarget,levelSpec,tileOf,INTRO_TICKS,DEATH_FREEZE,DEATH_TICKS,CLEAR_TICKS,EXTRA_LIFE,type State} from '../../../src/games/maze-muncher/model';

const play=(s:State)=>{start(s);for(let i=0;i<INTRO_TICKS;i++)step(s);expect(s.phase).toBe('playing');};
const run=(s:State,n:number)=>{const all=[];for(let i=0;i<n;i++)all.push(...step(s));return all;};
const calm=(s:State)=>{for(const g of s.ghosts){g.mode='house';g.x=14;g.y=14.5;}s.idle=-1e9;s.ghosts.forEach(g=>g.dots=-1e9);};

describe('maze',()=>{
 it('is a symmetric 28×31 grid with no dead ends and every dot reachable',()=>{
  expect(MAZE).toHaveLength(ROWS);
  for(const row of MAZE){expect(row).toHaveLength(COLS);expect(row).toBe([...row].reverse().join(''));}
  const seen=new Set<string>(),queue=[[13,21]];seen.add('13,21');
  while(queue.length){const [c,r]=queue.shift()!;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=((c+dx)%COLS+COLS)%COLS,y=r+dy;if(open(x,y)&&!seen.has(`${x},${y}`)){seen.add(`${x},${y}`);queue.push([x,y]);}}}
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
   if('.o'.includes(MAZE[r][c]))expect(seen.has(`${c},${r}`),`${c},${r}`).toBe(true);
   const house=r>=13&&r<=15&&c>=11&&c<=16;
   if(open(c,r)&&!house)expect([[1,0],[-1,0],[0,1],[0,-1]].filter(([x,y])=>open(c+x,r+y)).length,`${c},${r}`).toBeGreaterThanOrEqual(2);
  }
  expect(createState().dotsLeft).toBe(246);
 });
});

describe('play',()=>{
 it('waits on READY, then moves left eating dots for 10 points',()=>{
  const s=createState(4);run(s,30);expect(s.player.x).toBe(14);
  play(s);run(s,40);
  expect(s.player.x).toBeLessThan(10);expect(s.score).toBeGreaterThanOrEqual(30);expect(s.score%10).toBe(0);
 });
 it('buffers a turn until the next opening and reverses at once',()=>{
  const s=createState();play(s);calm(s);steer(s,'up');
  for(let i=0;i<200&&s.player.dir!=='up';i++)step(s);
  expect(s.player.dir).toBe('up');expect(tileOf(s.player).x).toBe(11);
  steer(s,'down');step(s);expect(s.player.dir).toBe('down');
 });
 it('stops at a wall instead of passing through it',()=>{
  const s=createState();play(s);calm(s);run(s,600);
  expect(s.player.moving).toBe(false);expect(open(tileOf(s.player).x-1,tileOf(s.player).y)).toBe(false);
 });
 it('wraps through the side tunnel',()=>{
  const s=createState();play(s);calm(s);s.player={x:1.5,y:14.5,dir:'left',next:null,moving:true,stall:0};
  run(s,30);expect(s.player.x).toBeGreaterThan(20);expect(tileOf(s.player).y).toBe(14);
 });
 it('power berries frighten and reverse the chasers, which score 200, 400, 800, 1600',()=>{
  const s=createState();play(s);
  s.player={x:1.5,y:3.5,dir:'up',next:null,moving:true,stall:0};
  const rook=s.ghosts[0];rook.dir='left';
  const events=run(s,10);expect(events).toContain('power');
  expect(s.fright).toBeGreaterThan(0);expect(rook.frightened).toBe(true);
  const scores:number[]=[];
  for(const g of s.ghosts){g.mode='active';g.frightened=true;g.x=s.player.x;g.y=s.player.y;const before=s.score;s.freeze=0;step(s);scores.push(s.score-before);run(s,60);}
  expect(scores.map(x=>Math.round(x/100)*100)).toEqual([200,400,800,1600]);
  expect(s.ghosts.every(g=>g.mode!=='active'||!g.frightened)).toBe(true);
 });
 it('eaten chasers return home as eyes and come back out',()=>{
  const s=createState();play(s);calm(s);const g=s.ghosts[1];g.mode='eaten';g.x=1.5;g.y=29.5;g.dir='right';
  const modes=new Set<string>();for(let i=0;i<1500&&!(modes.has('entering')&&(g.mode as string)==='active');i++){step(s);modes.add(g.mode);}
  expect([...modes]).toEqual(expect.arrayContaining(['eaten','entering','leaving','active']));
 });
 it('a chaser on the same tile costs a life; the last one ends the game',()=>{
  const s=createState();play(s);const g=s.ghosts[0];g.x=s.player.x-.5;g.y=s.player.y;
  expect(run(s,2)).toContain('death');run(s,DEATH_FREEZE+DEATH_TICKS);
  expect(s.lives).toBe(1);expect(s.phase).toBe('intro');expect(s.player.x).toBe(14);
  s.lives=0;run(s,INTRO_TICKS);s.ghosts[0].x=s.player.x;s.ghosts[0].y=s.player.y;
  run(s,2+DEATH_FREEZE+DEATH_TICKS);expect(s.phase).toBe('over');
  expect(start(s)).toBe(true);expect(s.score).toBe(0);expect(s.lives).toBe(2);
 });
 it('clearing the last dot starts a faster level with a fresh maze',()=>{
  const s=createState();play(s);calm(s);const i=21*COLS+12;s.dots=' '.repeat(i)+'.'+' '.repeat(COLS*ROWS-i-1);s.dotsLeft=1;
  expect(run(s,20)).toContain('clear');run(s,CLEAR_TICKS);
  expect(s.level).toBe(2);expect(s.dotsLeft).toBe(246);expect(levelSpec(2).ghost).toBeGreaterThan(levelSpec(1).ghost);
 });
 it('awards one extra life at 10,000 points',()=>{
  const s=createState();play(s);s.score=EXTRA_LIFE-10;expect(run(s,20)).toContain('life');expect(s.lives).toBe(3);
 });
 it('gives each chaser its own target',()=>{
  const s=createState();play(s);s.modeIndex=1;s.player={x:10.5,y:21.5,dir:'right',next:null,moving:true,stall:0};
  const [rook,vex,drift,mope]=s.ghosts;rook.x=6.5;rook.y=21.5;mope.x=24.5;mope.y=29.5;
  expect(ghostTarget(s,rook)).toEqual({x:10,y:21});
  expect(ghostTarget(s,vex)).toEqual({x:14,y:21});
  expect(ghostTarget(s,drift)).toEqual({x:18,y:21});
  expect(ghostTarget(s,mope)).toEqual({x:10,y:21});
  mope.x=11.5;mope.y=23.5;expect(ghostTarget(s,mope)).toEqual({x:0,y:31});
  s.modeIndex=0;expect(ghostTarget(s,rook)).toEqual({x:25,y:-3});
 });
 it('is deterministic for a seed and restores exactly',()=>{
  const a=createState(9),b=createState(9);play(a);play(b);
  for(let i=0;i<900;i++){if(i%97===0){steer(a,(['up','left','down','right'] as const)[i%4]);steer(b,(['up','left','down','right'] as const)[i%4]);}step(a);step(b);}
  expect(a).toEqual(b);
  const copy=restoreState(JSON.parse(JSON.stringify(a)))!;expect(copy).toEqual(a);
  run(copy,300);run(a,300);expect(copy).toEqual(a);
 });
 it('rejects malformed snapshots',()=>{
  const s=createState();
  for(const bad of [null,1,{},{...s,version:2},{...s,dots:'x'},{...s,dots:'o'.repeat(COLS*ROWS)},{...s,ghosts:[]},{...s,player:{...s.player,x:NaN}},{...s,phase:'won'},{...s,lives:-1}])expect(restoreState(bad)).toBeNull();
 });
});
