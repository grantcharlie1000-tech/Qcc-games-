import {describe,expect,it} from 'vitest';
import {advance,createState,enqueue,restoreState,start,step,blocked,length,SIZE,TICK_MS,GRACE_MS,type SnakeState} from '../../../src/games/snake/model';

const running=(seed?:number)=>{const s=createState(seed);start(s);return s;};
const head=(s:SnakeState)=>s.body[0];

describe('snake grid model',()=>{
 it('the first direction starts the run and steps at once',()=>{
  const s=createState();expect(start(s,'left')).toBe(false);expect(s.phase).toBe('ready');
  expect(start(s,'up')).toBe(true);expect(s.phase).toBe('running');expect(head(s)).toEqual({x:4,y:6});
 });
 it('moves one cell per tick regardless of frame partitioning',()=>{
  const a=running(),b=running(),c=running();
  for(let i=0;i<540;i++)advance(a,1);
  for(let i=0;i<540/18;i++)advance(b,18);
  advance(c,200);advance(c,200);advance(c,140);
  expect(a.body).toEqual(b.body);expect(b.body).toEqual(c.body);expect(head(a)).toEqual({x:9,y:7});
 });
 it('clamps long frame gaps',()=>{const s=running();advance(s,10_000);expect(s.ticks).toBeLessThanOrEqual(1+4);});
 it('buffers up to three turns and rejects reversals and repeats against the last queued turn',()=>{
  const s=running();advance(s,GRACE_MS+1);
  expect(enqueue(s,'left')).toBe(false);expect(enqueue(s,'right')).toBe(false);
  expect(enqueue(s,'up')).toBe(true);expect(enqueue(s,'up')).toBe(false);expect(enqueue(s,'down')).toBe(false);
  expect(enqueue(s,'left')).toBe(true);expect(enqueue(s,'down')).toBe(true);expect(enqueue(s,'right')).toBe(false);
  expect(s.queue).toEqual(['up','left','down']);
  const at=head(s);advance(s,TICK_MS);expect(head(s)).toEqual({x:at.x,y:at.y-1});
  advance(s,TICK_MS);expect(head(s)).toEqual({x:at.x-1,y:at.y-1});
 });
 it('applies a late turn retroactively inside the grace window',()=>{
  const s=running();advance(s,TICK_MS);const passed=s.body[1];advance(s,GRACE_MS-1);
  expect(enqueue(s,'up')).toBe(true);expect(s.queue).toEqual([]);expect(s.dir).toBe('up');
  expect(head(s)).toEqual({x:passed.x,y:passed.y-1});expect(s.elapsed).toBe(GRACE_MS-1);
 });
 it('queues instead of rewinding after the grace window or after a turn',()=>{
  const s=running();advance(s,TICK_MS+GRACE_MS+1);expect(enqueue(s,'up')).toBe(true);expect(s.queue).toEqual(['up']);
  advance(s,TICK_MS-GRACE_MS-1);expect(s.dir).toBe('up');expect(s.elapsed).toBe(0);
  expect(enqueue(s,'right')).toBe(true);expect(s.queue).toEqual(['right']);
 });
 it('never rewinds an apple that was just eaten',()=>{
  const s=running();while(s.score===0)advance(s,TICK_MS);expect(s.score).toBe(10);
  enqueue(s,'up');expect(s.score).toBe(10);expect(s.queue).toEqual(['up']);
 });
 it('holds one beat against a wall, then loses; a turn during the hold escapes',()=>{
  const s=running();s.food={x:0,y:0};
  while(s.bonk===0)advance(s,TICK_MS);expect(head(s).x).toBe(SIZE-1);expect(s.phase).toBe('running');
  const lost=JSON.parse(JSON.stringify(s)) as SnakeState;advance(lost,TICK_MS);expect(lost.phase).toBe('lost');expect(head(lost).x).toBe(SIZE-1);
  expect(enqueue(s,'down')).toBe(true);expect(s.bonk).toBe(0);expect(head(s)).toEqual({x:SIZE-1,y:8});
 });
 it('a bonk from a queued turn keeps the travel direction: the neck stays illegal and the real escape works',()=>{
  const s=createState();s.phase='running';s.food={x:0,y:9};
  s.body=[{x:14,y:1},{x:13,y:1},{x:13,y:0},{x:14,y:0},{x:15,y:0},{x:15,y:1},{x:15,y:2}];s.dir='right';
  s.score=(s.body.length-4)*10;s.queue=['up'];step(s);
  expect(s.bonk).toBe(1);expect(s.dir).toBe('right');
  const neck=JSON.parse(JSON.stringify(s)) as SnakeState;expect(enqueue(neck,'left')).toBe(false);
  expect(enqueue(s,'down')).toBe(true);expect(s.body[0]).toEqual({x:14,y:2});expect(s.bonk).toBe(0);
 });
 it('states saved during a turned bonk and after the resulting death restore',()=>{
  const s=createState();start(s,'up');while(s.phase==='running'&&s.bonk===0)advance(s,TICK_MS);
  const plain=(v:SnakeState)=>{const {undo:_u,...rest}=v;return JSON.parse(JSON.stringify(rest));};
  expect(restoreState(plain(s))).not.toBeNull();
  advance(s,TICK_MS);expect(s.phase).toBe('lost');expect(restoreState(plain(s))).not.toBeNull();
 });
 it('a vacating tail is safe but a growth-held tail is not',()=>{
  const s=createState();s.phase='running';s.body=[{x:5,y:5},{x:6,y:5},{x:6,y:6},{x:5,y:6}];s.dir='left';s.food={x:0,y:0};
  expect(blocked(s,{x:5,y:6})).toBe(false);s.growth=1;expect(blocked(s,{x:5,y:6})).toBe(true);
 });
 it('eating scores, grows by holding the tail, and spawns food off the body deterministically',()=>{
  const a=running(7),b=running(7);
  while(a.score===0)advance(a,TICK_MS);while(b.score===0)advance(b,TICK_MS);
  expect(a.food).toEqual(b.food);expect(length(a)).toBe(5);expect(a.growth).toBe(1);
  const tail=a.body.at(-1);advance(a,TICK_MS);expect(a.body.at(-1)).toEqual(tail);expect(a.body.length).toBe(5);
  expect(a.body.some(p=>p.x===a.food!.x&&p.y===a.food!.y)).toBe(false);
 });
 it('wins when the board is full',()=>{
  const s=createState();s.phase='running';s.body=[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}];s.dir='left';s.queue=['down'];s.food={x:0,y:1};
  s.growth=SIZE*SIZE-5;step(s);expect(length(s)).toBe(SIZE*SIZE);expect(s.phase).toBe('won');expect(s.food).toBeNull();
 });
 it('ready, lost and won states are frozen',()=>{
  const r=createState();advance(r,1000);expect(r).toEqual(createState());
  const s=running();s.phase='lost';const copy=JSON.stringify(s);advance(s,1000);expect(JSON.stringify(s)).toBe(copy);
 });
});
describe('snake saves',()=>{
 const plain=(s:SnakeState)=>{const {undo:_u,...rest}=s;return JSON.parse(JSON.stringify(rest));};
 it('round-trips a running game',()=>{
  const s=running(3);advance(s,1234);enqueue(s,'up');
  const r=restoreState(plain(s))!;expect(r).toEqual({...plain(s),undo:null});
  advance(r,500);advance(s,500);expect(r.body).toEqual(s.body);
 });
 it('rejects malformed and older saves',()=>{
  const good=plain(running());
  const bad=[null,1,{...good,version:2},{...good,score:30},{...good,dir:'left'},{...good,elapsed:TICK_MS},{...good,queue:['right']},{...good,food:good.body[2]},
   {...good,body:[good.body[0],good.body[2]]},{...good,growth:-1},{...good,phase:'won'},{...good,seed:-1},{...good,bonk:2},{...good,body:good.body.slice(0,3),score:-10},{...good,prevTail:{x:9,y:9}},{...good,body:[...good.body,good.body[0]]}];
  for(const b of bad)expect(restoreState(b)).toBeNull();
  expect(restoreState(good)).not.toBeNull();
 });
});
