import {describe,expect,test} from 'vitest';
import {WallStore,type PanelDefinition} from '../../../src/games/strongroom/walls';
import {CUSTOMS_HOUSE} from '../../../src/games/strongroom/maps/customs-house';

const drywall=(extra:Partial<PanelDefinition>={}):PanelDefinition=>({id:0,axis:'x',x:0,y:0,z:0,cols:4,rows:6,material:'drywall',...extra});
const wood=(extra:Partial<PanelDefinition>={}):PanelDefinition=>drywall({id:1,cols:2,rows:4,y:.25,material:'wood',opening:'door',...extra});

describe('deterministic wall cells',()=>{
 test('maps global cell indices from authored panel order and lower-corner origins',()=>{
  const store=new WallStore([drywall({id:7}),drywall({id:2,axis:'z',x:8,y:1,z:-3,cols:2,rows:2})]);
  expect(store.cellCount).toBe(28);
  expect(store.cellIndex(7,3,5)).toBe(23);
  expect(store.cellIndex(2,1,1)).toBe(27);
  expect(store.cellCenter(27)).toEqual({x:8,y:1.75,z:-2.25});
  expect(store.panels[1].firstCell).toBe(24);
 });
 test.each([
  [drywall({id:96})],[drywall({cols:5})],[drywall({rows:7})],[drywall({x:NaN})],
  [drywall({thickness:0})],[drywall(),drywall()],
 ].map(defs=>({defs})))('rejects invalid panel definitions before building cells ($defs)',({defs})=>{
  expect(()=>new WallStore(defs)).toThrow();
 });
 test('enforces both map budgets before allocating an oversized wall store',()=>{
  const tooMany=Array.from({length:97},(_,id)=>drywall({id,cols:1,rows:1}));
  const tooDense=Array.from({length:86},(_,id)=>drywall({id}));
  expect(()=>new WallStore(tooMany)).toThrow();expect(()=>new WallStore(tooDense)).toThrow();
 });
 test('treats absent opening barricades as empty space',()=>{
  const store=new WallStore([wood()]);
  expect([...store.states]).toEqual([3,3,3,3,3,3,3,3]);
  expect(store.panels[0].boxes).toHaveLength(0);
  expect(store.raycast({x:.25,y:.5,z:-2},{x:0,y:0,z:1},4)).toBeNull();
 });
});

describe('wall damage and rays',()=>{
 test.each([
  ['rifle',34,103],['smg',30,108],['pistol',40,106],['shotgun',40,80],['melee',0,60],
 ] as const)('applies the %s drywall damage multiplier', (source,damage,hp)=>{
  const store=new WallStore([drywall()]);store.damageCell(0,source,damage);
  expect(store.hp[0]).toBeCloseTo(hp);expect(store.hp[1]).toBe(120);
 });
 test('changes state only at the 66%, 33%, and zero thresholds',()=>{
  const store=new WallStore([drywall()]);
  store.damageCell(0,'rifle',80);expect(store.states[0]).toBe(0);
  store.damageCell(0,'rifle',2);expect(store.states[0]).toBe(1);
  store.damageCell(0,'rifle',80);expect(store.states[0]).toBe(2);
  store.damageCell(0,'rifle',78);expect(store.states[0]).toBe(3);expect(store.hp[0]).toBe(0);
 });
 test('takes two melee bashes to remove drywall and one to remove wood',()=>{
  const store=new WallStore([drywall(),wood({startBarricaded:true})]);
  store.damageCell(0,'melee');expect(store.hp[0]).toBe(60);expect(store.states[0]).toBe(1);
  store.damageCell(0,'melee');expect(store.states[0]).toBe(3);
  store.damageCell(24,'melee');expect(store.states[24]).toBe(3);
 });
 test('shattered cells pass sight and attenuate shots while retaining movement colliders',()=>{
  const store=new WallStore([drywall({cols:1,rows:1})]);
  const from={x:.25,y:.25,z:-2},direction={x:0,y:0,z:1};
  store.damageCell(0,'rifle',180);
  expect(store.states[0]).toBe(2);expect(store.panels[0].boxes).toHaveLength(1);
  expect(store.raycast(from,direction,4,'sight')).toBeNull();
  expect(store.raycast(from,direction,4,'shot')).toMatchObject({cell:0,state:2,distance:2,penetration:.8});
  store.damageCell(0,'melee');expect(store.panels[0].boxes).toHaveLength(0);
  expect(store.raycast(from,direction,4,'shot')).toBeNull();
 });
 test('chooses the nearest crossed cell and handles the z-axis and non-unit directions',()=>{
  const store=new WallStore([drywall({id:8,axis:'z',x:4,z:2,y:1,cols:2,rows:2}),drywall({id:2,axis:'z',x:2,z:2,y:1,cols:2,rows:2})]);
  expect(store.raycast({x:0,y:1.75,z:2.75},{x:2,y:0,z:0},8)).toMatchObject({distance:2,panelId:2,panelIndex:1,cell:7,state:0,penetration:.55,point:{x:2,y:1.75,z:2.75}});
  expect(store.raycast({x:0,y:1.75,z:3},{x:1,y:0,z:0},8)).toBeNull();
  expect(store.raycast({x:0,y:1.75,z:2.75},{x:0,y:0,z:0},8)).toBeNull();
 });
 test('ignores invalid damage amounts and out-of-range cell indices',()=>{
  const store=new WallStore([drywall()]);
  for(const damage of [NaN,Infinity,-1,0])expect(store.damageCell(0,'rifle',damage)).toBe(false);
  expect(store.damageCell(-1,'melee')).toBe(false);expect(store.damageCell(24,'melee')).toBe(false);
  expect(store.hp[0]).toBe(120);expect(store.revision).toBe(0);
 });
 test('rejects unknown runtime damage sources before applying the wood multiplier',()=>{
  const store=new WallStore([wood({startBarricaded:true})]);
  expect(store.damageCell(0,'unknown' as never,20)).toBe(false);expect(store.hp[0]).toBe(40);
 });
 test('applies shotgun pellet damage once on wood rather than doubling the rifle compensation',()=>{
  const store=new WallStore([wood({startBarricaded:true})]);
  expect(store.damageCell(0,'shotgun',25)).toBe(true);expect(store.hp[0]).toBe(15);
 });
});

describe('breach tools and reinforcement',()=>{
 test.each([-20,0,1,2,3,20])('clamps a floor-aligned 3 by 4 charge footprint at aim column %s',aim=>{
  const store=new WallStore([drywall()]);
  expect(store.breach(0,aim,'charge')).toBe(12);
  const start=aim<=1?0:1;
  const removed=[...store.states].flatMap((state,i)=>state===3?[i]:[]);
  const left=[0,1,2,4,5,6,8,9,10,12,13,14],right=[1,2,3,5,6,7,9,10,11,13,14,15];
  expect(removed).toEqual(start===0?left:right);
  expect(store.hasDoorway(0)).toBe(true);
  expect(store.hp[start===0?3:0]).toBe(60);
  expect(store.hp[16]).toBe(60);expect(store.hp[19]).toBe(60);
  expect(store.hp[20]).toBe(120);
 });
 test('truncates breach footprints to narrow and short panels',()=>{
  const store=new WallStore([drywall({cols:2,rows:2})]);
  expect(store.breach(0,99,'charge')).toBe(4);
  expect([...store.states]).toEqual([3,3,3,3]);expect(store.hasDoorway(0)).toBe(false);
 });
 test('requires at least 80% non-gone cells and restores every damaged cell when reinforcing',()=>{
  const store=new WallStore([drywall()]);
  for(let i=0;i<4;i++){store.damageCell(i,'melee');store.damageCell(i,'melee');}
  store.damageCell(10,'melee');expect(store.reinforce(0)).toBe(true);
  expect([...store.states]).toEqual(Array(24).fill(0));expect([...store.hp]).toEqual(Array(24).fill(120));
  expect(store.panels[0].flags&1).toBe(1);expect(store.reinforce(0)).toBe(false);
  const rejected=new WallStore([drywall()]);
  for(let i=0;i<5;i++){rejected.damageCell(i,'melee');rejected.damageCell(i,'melee');}
  expect(rejected.reinforce(0)).toBe(false);expect(rejected.states[0]).toBe(3);
 });
 test('reinforced panels block every soft damage source and shots until a cutter removes the plate',()=>{
  const store=new WallStore([drywall()]);store.reinforce(0);
  for(const source of ['rifle','smg','pistol','shotgun','melee','frag'] as const)expect(store.damageCell(0,source,10000)).toBe(false);
  expect(store.explode('frag',{x:.25,y:.25,z:0})).toBe(0);
  expect(store.explode('impact',{x:.25,y:.25,z:0})).toBe(0);
  expect(store.breach(0,2,'charge')).toBe(0);expect(store.hp[0]).toBe(120);
  expect(store.raycast({x:.25,y:.25,z:-2},{x:0,y:0,z:1},4)?.penetration).toBe(0);
  expect(store.breach(0,2,'cutter')).toBe(12);expect(store.panels[0].flags&1).toBe(0);
  expect(store.hp[0]).toBe(120);expect(store.hasDoorway(0)).toBe(true);
 });
 test('damages frag cells by distance with no damage at the outer radius',()=>{
  const store=new WallStore([drywall()]);store.explode('frag',{x:.25,y:.25,z:0});
  expect(store.hp[0]).toBe(0);expect(store.hp[3]).toBe(0);
  expect(store.hp[16]).toBe(45);expect(store.hp[20]).toBe(120);
 });
 test('removes the 3 by 3 cells within a .75m impact radius',()=>{
  const store=new WallStore([drywall()]);expect(store.explode('impact',{x:.75,y:.75,z:0})).toBe(9);
  expect([...store.states].flatMap((s,i)=>s===3?[i]:[])).toEqual([0,1,2,4,5,6,8,9,10]);
 });
 test('barricades can be reclaimed only by their owner while completely undamaged',()=>{
  const store=new WallStore([wood()]);
  expect(store.placeBarricade(1,3)).toBe(true);expect(store.placeBarricade(1,3)).toBe(false);
  expect(store.reclaimBarricade(1,2)).toBe(false);expect(store.reclaimBarricade(1,3)).toBe(true);
  expect(store.panels[0].boxes).toHaveLength(0);
  expect(store.placeBarricade(1,3)).toBe(true);store.damageCell(0,'pistol',1);
  expect(store.states[0]).toBe(0);expect(store.reclaimBarricade(1,3)).toBe(false);
  expect(store.reinforce(1)).toBe(false);
  for(let i=0;i<8;i++)store.damageCell(i,'melee');
  expect(store.panels[0].flags&2).toBe(0);expect(store.placeBarricade(1,4)).toBe(true);
 });
 test('retains a shot cell index and wood attenuation above the drone gap',()=>{
  const store=new WallStore([wood({startBarricaded:true})]);
  expect(store.raycast({x:.25,y:.2,z:-2},{x:0,y:0,z:1},4)).toBeNull();
  expect(store.raycast({x:.25,y:.5,z:-2},{x:0,y:0,z:1},4)).toMatchObject({cell:0,penetration:.8});
 });
 test('does not let a missing owner reclaim an authored default barricade',()=>{
  const store=new WallStore([wood({startBarricaded:true})]);
  expect(store.reclaimBarricade(1,null as never)).toBe(false);expect(store.states[0]).toBe(0);
 });
});

describe('greedy movement colliders',()=>{
 test('merges a full z-axis panel into one world-space box',()=>{
  const store=new WallStore([drywall({axis:'z',x:3,z:-2,y:1,cols:2,rows:4})]);
  expect(store.panels[0].rectangles).toEqual([{col:0,row:0,cols:2,rows:4}]);
  expect(store.panels[0].boxes).toEqual([{min:{x:2.9,y:1,z:-2},max:{x:3.1,y:3,z:-1}}]);
 });
 test('covers precisely the surviving cells, including shattered frames, without duplicate coverage',()=>{
  const holes=new Set([1,2,5,10,11,16,20,23]);
  const store=new WallStore([drywall()]);
  for(const cell of holes){store.damageCell(cell,'melee');store.damageCell(cell,'melee');}
  store.damageCell(3,'rifle',180);
  const coverage=new Uint8Array(24);
  for(const rect of store.panels[0].rectangles)for(let row=rect.row;row<rect.row+rect.rows;row++)for(let col=rect.col;col<rect.col+rect.cols;col++)coverage[row*4+col]++;
  expect([...coverage]).toEqual([1,0,0,1,1,0,1,1,1,1,0,0,1,1,1,1,0,1,1,1,0,1,1,0]);
  expect(store.states[3]).toBe(2);
 });
 test('maintains exact rectangle coverage for every 3 by 3 hole pattern',()=>{
  for(let mask=0;mask<512;mask++){
   const store=new WallStore([drywall({cols:3,rows:3})]);
   for(let cell=0;cell<9;cell++)if(mask&(1<<cell)){store.damageCell(cell,'melee');store.damageCell(cell,'melee');}
   const counts=new Uint8Array(9);
   for(const r of store.panels[0].rectangles)for(let y=r.row;y<r.row+r.rows;y++)for(let x=r.col;x<r.col+r.cols;x++)counts[y*3+x]++;
   for(let cell=0;cell<9;cell++)expect(counts[cell],`mask ${mask}, cell ${cell}`).toBe(mask&(1<<cell)?0:1);
  }
 });
});

describe('compact host wall replication',()=>{
 test('coalesces repeated cell changes into one sorted diff per drain, without consuming render changes',()=>{
  const store=new WallStore([drywall()]);
  store.damageCell(4,'melee');store.damageCell(4,'melee');store.damageCell(0,'melee');
  expect(store.drainPackets()).toEqual([['wd',1,0,1,4,3]]);
  expect(store.drainPackets()).toEqual([]);
  expect(store.changesSince(0)).toMatchObject({cells:[0,4],panels:[0]});
  expect(store.changesSince(store.revision).cells).toEqual([]);
 });
 test('does not send unchanged damage states and sends bounded numeric panel ids',()=>{
  const store=new WallStore([drywall({id:9})]);store.damageCell(0,'rifle',34);
  expect(store.drainPackets()).toEqual([]);
  expect(store.setAttached(9,true)).toBe(true);expect(store.drainPackets()).toEqual([['wp',1,9,4]]);
  expect(store.setAttached(9,false)).toBe(true);expect(store.drainPackets()).toEqual([['wp',2,9,0]]);
 });
 test('packs four 2-bit states per byte and hashes the bitfield with FNV-1a',()=>{
  const store=new WallStore([drywall({cols:4,rows:1})],5);
  store.damageCell(1,'melee');store.damageCell(2,'rifle',180);store.damageCell(3,'melee');store.damageCell(3,'melee');store.drainPackets();
  expect(store.snapshot()).toEqual(['wf',5,'5A==','AA==',1]);
  expect(store.hash()).toBe('610b5af3');
  expect(new WallStore([]).hash()).toBe('811c9dc5');
 });
 test('loopback replicates breaches, reinforcement and barricades without echoing packets',()=>{
  const defs=[drywall(),wood()],host=new WallStore(defs,2),guest=new WallStore(defs,2);
  host.damageCell(0,'melee');host.placeBarricade(1,2);host.reinforce(0);
  for(const packet of host.drainPackets())expect(guest.applyPacket(packet)).toEqual({ok:true,resync:false});
  expect(guest.hash()).toBe(host.hash());expect(guest.panels.map(p=>p.flags)).toEqual([1,2]);expect(guest.drainPackets()).toEqual([]);
  host.breach(0,1,'cutter');for(const packet of host.drainPackets())expect(guest.applyPacket(packet).ok).toBe(true);
  expect(guest.hash()).toBe(host.hash());expect(guest.panels[0].flags).toBe(0);
 });
 test('stops on a sequence gap until a full snapshot establishes the baseline',()=>{
  const defs=[drywall()],host=new WallStore(defs,3),guest=new WallStore(defs,3);
  host.damageCell(0,'melee');const first=host.drainPackets()[0];host.damageCell(1,'melee');const second=host.drainPackets()[0];
  expect(guest.applyPacket(second)).toMatchObject({ok:false,resync:true});expect(guest.states[1]).toBe(0);
  expect(guest.applyPacket(first)).toMatchObject({ok:false,resync:true});expect(guest.seq).toBe(0);
  expect(guest.applyPacket(host.snapshot())).toEqual({ok:true,resync:false});expect(guest.seq).toBe(2);expect(guest.needsResync).toBe(false);
  host.damageCell(2,'melee');expect(guest.applyPacket(host.drainPackets()[0]).ok).toBe(true);
  expect(guest.hash()).toBe(host.hash());
 });
 test('ignores stale diffs and old-round snapshots without rolling state back',()=>{
  const store=new WallStore([drywall()],4);expect(store.applyPacket(['wd',1,0,1]).ok).toBe(true);
  expect(store.applyPacket(['wd',1,0,3])).toMatchObject({ok:false,resync:false});expect(store.states[0]).toBe(1);
  expect(store.applyPacket(['wf',3,'AAAAAAAA','AA==',9])).toMatchObject({ok:false,resync:false});expect(store.roundId).toBe(4);
 });
 test('reset restores authored defaults, clears owners and pending diffs, and preserves room sequence',()=>{
  const store=new WallStore([drywall(),wood()],1);store.breach(0,1,'charge');store.drainPackets();store.placeBarricade(1,3);store.setAttached(0,true);
  const seq=store.seq,revision=store.revision;store.reset(2);
  expect(store.roundId).toBe(2);expect(store.seq).toBe(seq);expect(store.drainPackets()).toEqual([]);
  expect([...store.states]).toEqual([...Array(24).fill(0),...Array(8).fill(3)]);
  expect(store.panels.map(p=>[p.flags,p.owner])).toEqual([[0,null],[0,null]]);
  expect(store.changesSince(revision)).toMatchObject({reset:true,cells:Array.from({length:32},(_,i)=>i)});
 });
 test.each([
  null,{},[],['wd'],['wd',1],['wd',1,0,3,1],['wd',1,0,3,1,4],['wd',1,0,3,0,1],
  ['wd',1,24,3],['wd',1,-1,3],['wd',1,0,NaN],['wd',1,0,'3'],['wd',1,0,2.5],
  ['wd',Infinity,0,3],['wd',-.1,0,3],['wd',0x80000000,0,3],
  ['wp',1,0,8],['wp',1,0,2],['wp',1,95,0],['wp',1,0,NaN],['wp',1,0,1,0],
  ['wf',1,'AA==','AA==',0],['wf',1,'AAAAAAAA','AB==',0],['wf',1,'AAAAAAAA','CA==',0],
  ['wf',NaN,'AAAAAAAA','AA==',0],['wf',-1,'AAAAAAAA','AA==',0],['wf',0x80000000,'AAAAAAAA','AA==',0],
  ['wf',1,'AAAAAAAA','AA==',Infinity],['wf',1,'AAAAAAAA','AA=='],['wf',1,'AAAA!!!!','AA==',0],
 ].map(packet=>({packet})))('atomically rejects malformed or out-of-bounds wall packets ($packet)',({packet})=>{
  const store=new WallStore([drywall()],1),hash=store.hash(),revision=store.revision;
  expect(store.applyPacket(packet).ok).toBe(false);expect(store.hash()).toBe(hash);expect(store.seq).toBe(0);expect(store.revision).toBe(revision);
 });
 test('rejects nonzero unused cell bits and inconsistent full-snapshot panel flags',()=>{
  const store=new WallStore([drywall({cols:3,rows:1})],1);
  expect(store.applyPacket(['wf',1,'wA==','AA==',0]).ok).toBe(false);
  expect(store.applyPacket(['wf',1,'Pw==','AQ==',0]).ok).toBe(false);
  const opening=new WallStore([wood()],1);
  expect(opening.applyPacket(['wf',1,'AAA=','AA==',0]).ok).toBe(false);
  expect(opening.applyPacket(['wf',1,'//8=','Ag==',0]).ok).toBe(false);
 });
 test('rejects a diff beyond the cell budget before applying its leading valid pair',()=>{
  const store=new WallStore([drywall()],1),packet:unknown[]=['wd',1,0,3];
  for(let i=0;i<2048;i++)packet.push(0,3);
  expect(store.applyPacket(packet).ok).toBe(false);expect(store.states[0]).toBe(0);
 });
 test('rejects a gadget attachment flag on an absent wood barricade',()=>{
  const store=new WallStore([wood()],1);
  expect(store.applyPacket(['wp',1,1,4]).ok).toBe(false);expect(store.panels[0].flags).toBe(0);expect(store.seq).toBe(0);
 });
});

test('supports the actual Customs House budget and measures a 12-cell breach with collider and packet rebuilds',()=>{
 const store=new WallStore(CUSTOMS_HOUSE.panels),replica=new WallStore(CUSTOMS_HOUSE.panels);
 expect(store.panels.length).toBeLessThanOrEqual(96);expect(store.cellCount).toBeLessThanOrEqual(2048);
 const target=store.panels.find(p=>p.material==='drywall'&&p.cols===4&&p.rows===6)!;
 const samples:number[]=[];let packetBytes=0;
 for(let sample=0;sample<300;sample++){
  store.reset(sample+1);const start=performance.now();
  const removed=store.breach(target.id,2,'charge'),packets=store.drainPackets();packetBytes=JSON.stringify(packets).length;
  const ms=performance.now()-start;if(sample>=50)samples.push(ms);
  expect(removed).toBe(12);
 }
 expect(replica.applyPacket(store.snapshot()).ok).toBe(true);expect(replica.hash()).toBe(store.hash());
 samples.sort((a,b)=>a-b);
 console.info(`Strongroom wall model: ${store.panels.length} panels / ${store.cellCount} cells; breach + collider + packet mean ${(samples.reduce((a,b)=>a+b,0)/samples.length).toFixed(3)} ms, p95 ${samples[Math.floor(samples.length*.95)].toFixed(3)} ms, ${packetBytes} packet chars (Node; browser CPU test is separate).`);
});
