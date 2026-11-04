import {describe,it,expect} from 'vitest';
import {fits,spinKind,createState,hardDrop,hold,restoreState,advance,gravity,ghost,move,rotate,softDrop,cells} from '../../../src/games/quadfall/model';
describe('Tetris model',()=>{
 it('uses reproducible seven-piece bags',()=>{const a=createState(123),b=createState(123);expect(a).toEqual(b);expect(new Set([a.active.id,...a.queue.slice(0,6)]).size).toBe(7);});
 it('locks a hard drop at the ghost and awards points',()=>{const s=createState(4),y=ghost(s);hardDrop(s);expect(s.score).toBeGreaterThan(0);expect(s.board.flat().filter(Boolean)).toHaveLength(4);expect(y).toBeGreaterThan(0);});
 it('limits hold until a lock',()=>{const s=createState(3),id=s.active.id;expect(hold(s)).toBe(true);expect(s.held).toBe(id);expect(hold(s)).toBe(false);hardDrop(s);expect(hold(s)).toBe(true);expect(s.active.id).toBe(id);});
 it('advances deterministically and validates saves',()=>{const a=createState(9),b=createState(9);advance(a,2200);advance(b,2200);expect(a).toEqual(b);expect(restoreState(a)).toEqual(a);expect(restoreState({...a,board:[]})).toBeNull();expect(restoreState({...a,score:NaN})).toBeNull();expect(gravity(2)).toBeLessThan(gravity(1));expect(move(a,-1)).toBe(true);});
});

describe('scoring and timing',()=>{
 for(const start of [0,10])for(const count of [1,2,3,4])it(`scores ${count} lines at level ${1+start/10}`,()=>{const s=createState(1);s.phase='running';s.lines=start;s.active={id:'I',x:3,y:18,r:1};for(let y=22-count;y<22;y++)s.board[y]=Array.from({length:10},(_,x)=>x===5?null:'O');hardDrop(s);expect(s.lines).toBe(start+count);expect(s.score).toBe(([0,100,300,500,800][count]+(count===4?2000:0))*(1+start/10));expect(s.last?.perfect).toBe(count===4);});
 it('levels up after ten lines',()=>{const s=createState(1);s.phase='running';s.lines=9;s.active={id:'I',x:3,y:18,r:1};s.board[21]=Array.from({length:10},(_,x)=>x===5?null:'O');hardDrop(s);expect(s.lines).toBe(10);expect(gravity(2)).toBeLessThan(gravity(1));});
 it('waits for the lock delay and caps resets',()=>{const s=createState(2);s.phase='running';s.active.y=ghost(s);advance(s,499);expect(s.locks).toBe(0);for(let i=0;i<15;i++)expect(move(s,i%2?-1:1)).toBe(true);advance(s,499);move(s,-1);advance(s,1);expect(s.locks).toBe(1);});
 it('blocks out on spawn',()=>{const s=createState(2);s.phase='running';s.active.y=ghost(s);for(let y=0;y<=3;y++)for(let x=3;x<=6;x++)s.board[y][x]='O';hardDrop(s);expect(s.phase).toBe('lost');});
});

describe('movement and validation',()=>{
 it('kicks a vertical line piece away from the wall',()=>{const s=createState(1);s.phase='running';s.active={id:'I',x:-2,y:4,r:1};expect(rotate(s,1)).toBe(true);expect(s.active.x).toBeGreaterThanOrEqual(0);});
 it('awards one point per soft drop cell',()=>{const s=createState(1);s.phase='running';expect(softDrop(s)).toBe(true);expect(s.score).toBe(1);});
 it('rejects invalid piece identifiers and non-finite timers',()=>{const s=createState(1);expect(restoreState({...s,active:{...s.active,id:'bad'}})).toBeNull();expect(restoreState({...s,fall:NaN})).toBeNull();});
});

describe('additional regression coverage',()=>{
 it('draws ten complete bags in a reproducible sequence',()=>{const sequence=(seed:number)=>{const s=createState(seed),out=[s.active.id];for(let i=0;i<69;i++){s.board.forEach(row=>row.fill(null));hardDrop(s);out.push(s.active.id);}return out;};const a=sequence(77);expect(a).toEqual(sequence(77));for(let i=0;i<70;i+=7)expect(new Set(a.slice(i,i+7)).size).toBe(7);});
 it('spawns visibly and falls back when blocked',()=>{const s=createState(1);expect(s.active.y).toBe(2);s.phase='running';s.active.y=ghost(s);s.board[3][4]='O';hardDrop(s);expect(s.active.y).toBeLessThan(2);});
 it('resets lock timer and cap after reaching a new lowest row',()=>{const s=createState(1);s.phase='running';s.active={id:'O',x:3,y:10,r:0};s.lowest=11;s.lock=400;s.resets=15;expect(softDrop(s)).toBe(true);expect(s.lock).toBe(0);expect(s.resets).toBe(0);});
 it('decreases gravity through level fifteen and has a floor',()=>{for(let n=1;n<15;n++)expect(gravity(n+1)).toBeLessThan(gravity(n));expect(gravity(100)).toBe(50);});
 it('rejects malformed saves',()=>{const s=createState(3);for(const v of [{...s,version:2},{...s,queue:[]},{...s,held:'bad'},{...s,resets:16},{...s,phase:'bad'},{...s,board:[]},{...s,seed:-1}])expect(restoreState(v)).toBeNull();});
});

it('kicks a regular piece at a wall',()=>{const s=createState(1);s.active={id:'T',x:-1,y:4,r:1};expect(rotate(s,-1)).toBe(true);expect(s.active.x).toBeGreaterThanOrEqual(0);});
it('lands exactly at the ghost and scores two per hard-drop row',()=>{const s=createState(5),a={...s.active},y=ghost(s);hardDrop(s);expect(s.score).toBe((y-a.y)*2);expect(s.board.flat().filter(Boolean)).toHaveLength(4);for(const [x,row] of cells({...a,y}))expect(s.board[row][x]).toBe(a.id);});

it('resets on rotation reaching a new lowest occupied row',()=>{const s=createState(1);s.active={id:'T',x:3,y:10,r:0};s.lowest=11;s.lock=200;s.resets=15;expect(rotate(s,1)).toBe(true);expect(s.lowest).toBe(12);expect(s.lock).toBe(0);expect(s.resets).toBe(0);});

const fill=(x:number)=>Array.from({length:10},(_,i)=>i===x?null:'O' as const);
function slot(){const s=createState(1);s.phase='running';s.board[21]=fill(4);s.board[20]=Array.from({length:10},(_,i)=>i>=3&&i<=5?null:'O' as const);s.board[19][3]='O';return s;}
describe('advanced scoring',()=>{
 it('scores a T-spin double reached by rotation',()=>{const s=slot();s.active={id:'T',x:3,y:19,r:1};expect(rotate(s,1)).toBe(true);expect(spinKind(s)).toBe('full');hardDrop(s);expect(s.lines).toBe(2);expect(s.score).toBe(1200);expect(s.last).toMatchObject({spin:'full',lines:2,b2b:false});expect(s.b2b).toBe(true);});
 it('does not count a T dropped into place without rotating',()=>{const s=slot();s.active={id:'T',x:3,y:19,r:2};hardDrop(s);expect(s.lines).toBe(2);expect(s.score).toBe(300);expect(s.last?.spin).toBe('none');});
 it('cancels a spin when the piece moves after rotating',()=>{const s=slot();s.active={id:'T',x:3,y:19,r:1};rotate(s,1);s.board[19][3]=null;move(s,-1);move(s,1);expect(spinKind(s)).toBe('none');});
 it('awards back-to-back on consecutive difficult clears',()=>{const s=createState(1);s.phase='running';s.b2b=true;s.board[17][0]='O';for(let y=18;y<22;y++)s.board[y]=fill(5);s.active={id:'I',x:3,y:18,r:1};hardDrop(s);expect(s.score).toBe(1200);expect(s.last).toMatchObject({b2b:true,perfect:false});});
 it('breaks back-to-back on an ordinary clear and scores combos',()=>{const s=createState(1);s.phase='running';s.b2b=true;s.board[16][9]='O';s.board[21]=fill(5);s.board[20]=fill(5);s.active={id:'I',x:3,y:18,r:1};hardDrop(s);expect(s.lines).toBe(2);expect(s.b2b).toBe(false);expect(s.combo).toBe(0);expect(s.score).toBe(300);
  s.board[21]=fill(0);s.active={id:'I',x:-2,y:18,r:1};expect(fits(s,s.active)).toBe(true);const before=s.score;hardDrop(s);expect(s.lines).toBe(3);expect(s.combo).toBe(1);expect(s.score-before).toBe(100+50);expect(s.last?.combo).toBe(1);});
 it('resets the combo after a lock without lines',()=>{const s=createState(1);s.phase='running';s.combo=3;hardDrop(s);expect(s.combo).toBe(-1);expect(s.last).toBeNull();});
 it('restores saves made before spin scoring existed',()=>{const s=createState(5) as unknown as Record<string,unknown>;delete s.b2b;delete s.combo;delete s.spin;delete s.last;const r=restoreState(s)!;expect(r.b2b).toBe(false);expect(r.combo).toBe(-1);expect(r.spin).toBe(0);expect(restoreState({...createState(5),combo:-2})).toBeNull();});
});
