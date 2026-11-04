import {describe,expect,test} from 'vitest';
import {damage,explode,restore,serialize,step,worldFor,createMatch,chooseLoadout,inZone,standings} from '../../../src/games/quad-clash/sim';
import {GRENADE,MODES,POINTS,RESPAWN_TIME,SPAWN_PROTECT,STEP,STREAKS,WEAPONS,BODY,MAX_GRENADES} from '../../../src/games/quad-clash/config';
import {getMap} from '../../../src/games/quad-clash/map';
import {duel,eventsOf,face,hold,run} from './helpers';

describe('hitscan weapons',()=>{
  test('a Hall Pass headshot at 8 m deals damage x head multiplier, and two finish the target',()=>{
    const m=duel({primary:'hallpass'});const [you,bot]=m.fighters;face(m,you,bot,8);
    run(m,0.4,i=>[hold(you,{fire:i===20})]);
    const hit=eventsOf(m,'hit')[0];
    expect(hit).toMatchObject({target:1,attacker:0,head:true});
    expect(hit.amount).toBeCloseTo(WEAPONS.hallpass.damage*WEAPONS.hallpass.head,5);
    m.events.length=0;
    run(m,0.4,i=>[hold(you,{fire:i===5})]);
    expect(bot.alive).toBe(false);
    expect(eventsOf(m,'kill')[0]).toMatchObject({killer:0,victim:1,weapon:'hallpass',head:true});
    expect(you.kills).toBe(1);expect(you.score).toBe(POINTS.kill+POINTS.head);
  });
  test('body shots below the head use base damage and fall off with range',()=>{
    const m=duel({primary:'bell'});const [you,bot]=m.fighters;face(m,you,bot,40);
    you.pitch=Math.atan2(0.9-BODY.eye,40);
    run(m,0.4,i=>[hold(you,{fire:i===20,pitch:you.pitch})]);
    const hit=eventsOf(m,'hit')[0];
    expect(hit.head).toBe(false);
    const t=Math.hypot(hit.x-you.x,hit.y-(you.y+BODY.eye),hit.z-you.z);
    const [s,e,min]=WEAPONS.bell.falloff,fall=1-(1-min)*(t-s)/(e-s);
    expect(t).toBeGreaterThan(39);expect(hit.amount).toBeCloseTo(WEAPONS.bell.damage*fall,5);
  });
  test('the Detention shotgun fires ten pellets per shot and shreds at close range',()=>{
    const m=duel({primary:'detention'});const [you,bot]=m.fighters;face(m,you,bot,3);
    run(m,0.4,i=>[hold(you,{fire:i===20})]);
    expect(eventsOf(m,'tracer')).toHaveLength(10);
    expect(bot.alive).toBe(false);
  });
  test('walls stop bullets',()=>{
    const m=duel({primary:'hallpass'});const [you,bot]=m.fighters;
    you.x=-18;you.z=0;you.yaw=-Math.PI/2;you.pitch=Math.atan2(0.9-BODY.eye,4);bot.x=-14;bot.z=0;bot.y=0;
    run(m,0.4,i=>[hold(you,{fire:i===20,pitch:you.pitch})]);
    expect(eventsOf(m,'tracer')[0].impact).toBe('world');expect(bot.health).toBe(100);
  });
  test('Triple Period fires a three-round burst from one press',()=>{
    const m=duel({primary:'triple'});const [you,bot]=m.fighters;face(m,you,bot,60);bot.x=50;
    run(m,0.8,i=>[hold(you,{fire:i===20})]);
    expect(eventsOf(m,'shot')).toHaveLength(3);expect(you.mag[0]).toBe(WEAPONS.triple.mag-3);
  });
  test('semi-automatic presses slightly too early are buffered, but holding the trigger does not repeat',()=>{
    const m=duel({primary:'hallpass'});const [you]=m.fighters;you.x=0;you.z=12;you.yaw=Math.PI/2;
    run(m,0.5);
    // Press, release, press again 0.2 s later (interval is 0.28 s): both shots fire.
    run(m,0.5,i=>[hold(you,{fire:i<3||(i>=12&&i<15)})]);
    expect(eventsOf(m,'shot')).toHaveLength(2);
    m.events.length=0;
    run(m,1.5,()=>[hold(you,{fire:true})]);
    expect(eventsOf(m,'shot')).toHaveLength(1);
  });
  test('emptying a magazine reloads from the reserve; the sidearm never runs dry',()=>{
    const m=duel({primary:'bell'});const [you]=m.fighters;you.x=0;you.z=12;you.yaw=Math.PI/2;
    run(m,0.5);
    run(m,4,()=>[hold(you,{fire:true})]);
    expect(eventsOf(m,'reload').length).toBeGreaterThan(0);
    run(m,3);
    expect(you.mag[0]).toBe(WEAPONS.bell.mag);expect(you.reserve).toBeLessThan(WEAPONS.bell.reserve);
    you.reserve=0;you.mag[0]=0;m.events.length=0;
    run(m,0.6,i=>[hold(you,{fire:i<2})]);
    expect(you.slot).toBe(1);expect(eventsOf(m,'dry')).toHaveLength(1);
    for(let k=0;k<4;k++)run(m,1.8,i=>[hold(you,{fire:i%14<2})]);
    expect(eventsOf(m,'shot').length).toBeGreaterThan(WEAPONS.pencil.mag);
  });
  test('swapping weapons and the manual reload key work',()=>{
    const m=duel({primary:'recess'});const [you]=m.fighters;
    run(m,0.1,i=>[hold(you,{swap:i===0})]);expect(you.slot).toBe(1);
    run(m,0.1,i=>[hold(you,{slot:i===0?0:-1})]);expect(you.slot).toBe(0);
    you.mag[0]=3;run(m,0.1,i=>[hold(you,{reload:i===0})]);
    expect(you.reloadEnd).toBeGreaterThan(0);run(m,WEAPONS.recess.reload+0.1);
    expect(you.mag[0]).toBe(WEAPONS.recess.mag);
  });
});

describe('explosives',()=>{
  test('Fire Drill rockets explode on contact with splash damage and knockback',()=>{
    const m=duel({primary:'firedrill'});const [you,bot]=m.fighters;face(m,you,bot,12);
    you.pitch=Math.atan2(0.6-BODY.eye,12);
    run(m,1,i=>[hold(you,{fire:i===20,pitch:you.pitch})]);
    expect(eventsOf(m,'explode')).toHaveLength(1);expect(bot.alive).toBe(false);
  });
  test('splash hurts its owner at reduced strength, never teammates, and walls block it',()=>{
    const m=duel({mode:'house',keep:[0,1,4]});const [you,mate]=m.fighters,foe=m.fighters[4];
    const w=worldFor(m);
    you.x=0;you.z=12;mate.x=1;mate.z=12;foe.x=-1;foe.z=12.5;
    explode(m,w,0,0.5,13,4,100,0,'firedrill','rocket');
    expect(mate.health).toBe(100);
    expect(foe.health).toBeLessThan(100);
    expect(100-you.health).toBeLessThan(100-foe.health);
    // A wall between blast and target.
    const m2=duel();const [a,b]=m2.fighters;a.x=-10;a.z=20;b.x=-14;b.z=0;
    explode(m2,worldFor(m2),-17.2,0.5,0,4,100,0,'firedrill','rocket');
    expect(b.health).toBe(100);
  });
  test('a rocket fired while hugging a wall bursts on that wall, never behind it',()=>{
    const m=duel({primary:'firedrill'});const [you,bot]=m.fighters;
    // The low wall at x = -16.5..-15.5; you press against its west face, the bot hides on the far side.
    you.x=-16.5-BODY.radius-0.01;you.z=0;you.yaw=-Math.PI/2;you.pitch=Math.atan2(0.6-BODY.eye,1);bot.x=-14;bot.z=0;bot.y=0;
    run(m,0.5,i=>[hold(you,{fire:i===20,pitch:you.pitch})]);
    const blast=eventsOf(m,'explode')[0];
    expect(blast.x).toBeLessThan(-16.4);expect(bot.health).toBe(100);
  });
  test('a thrown flask bounces, explodes after its fuse and uses up a grenade',()=>{
    const m=duel();const [you,bot]=m.fighters;face(m,you,bot,2);
    run(m,0.6);
    // Dropped at your own feet: it bounces, then the blast catches you (reduced) and the bot.
    run(m,GRENADE.fuse+0.5,i=>[hold(you,{grenade:i===0,pitch:-1.4})]);
    expect(you.grenades).toBe(0);
    expect(eventsOf(m,'throw')).toHaveLength(1);
    expect(eventsOf(m,'bounce').length).toBeGreaterThan(0);
    expect(eventsOf(m,'explode')[0].kind).toBe('grenade');
    expect(bot.health).toBeLessThan(100);
    expect(100-you.health).toBeLessThan(100-bot.health+1e-9);
  });
});

describe('eliminations, streaks and respawns',()=>{
  test('the victim drops ammo, respawns after three seconds with a spawn shield that firing removes',()=>{
    const m=duel();const [you,bot]=m.fighters;
    damage(m,bot,you,500,'bell',false,bot.x,bot.y,bot.z);
    expect(m.pickups.some(p=>p.dropped&&p.kind==='ammo')).toBe(true);
    run(m,RESPAWN_TIME+0.05);
    expect(bot.alive).toBe(true);expect(bot.health).toBe(100);
    expect(damage(m,bot,you,50,'bell',false,0,0,0)).toBe(0);
    run(m,SPAWN_PROTECT);
    expect(damage(m,bot,you,50,'bell',false,0,0,0)).toBe(50);
  });
  test('streak rewards arrive at 3, 5 and 8 eliminations and reset on death',()=>{
    const m=duel({keep:[0,1,2,3,4,5,6,7]});const you=m.fighters[0];
    you.reserve=0;you.grenades=0;
    let kills=0;
    const killOne=()=>{const v=m.fighters[1+(kills%7)];v.alive=true;v.protectUntil=0;damage(m,v,you,999,'bell',false,0,0,0);kills++;};
    for(let i=0;i<3;i++)killOne();
    expect(you.reserve).toBe(WEAPONS.bell.reserve);expect(you.grenades).toBe(1);
    for(let i=0;i<2;i++)killOne();
    expect(you.shieldUntil).toBeGreaterThan(m.t);
    const before=you.health;damage(m,you,m.fighters[2],40,'bell',false,0,0,0);expect(before-you.health).toBeCloseTo(20,5);
    for(let i=0;i<3;i++)killOne();
    expect(you.boostUntil).toBeGreaterThan(m.t);
    expect(eventsOf(m,'streak').map(e=>e.index)).toEqual([0,1,2]);
    expect(you.score).toBe(8*POINTS.kill+3*POINTS.streak);
    damage(m,you,m.fighters[3],999,'bell',false,0,0,0);
    expect(you.streak).toBe(0);expect(you.bestStreak).toBe(8);
    expect(STREAKS.map(s=>s.kills)).toEqual([3,5,8]);
  });
  test('teammates cannot hurt each other in house modes',()=>{
    const m=duel({mode:'house',keep:[0,1]});const [you,mate]=m.fighters;
    expect(you.team).toBe(mate.team);
    expect(damage(m,mate,you,50,'bell',false,0,0,0)).toBe(0);
  });
  test('health refills after time out of fire',()=>{
    const m=duel();const [you,bot]=m.fighters;
    damage(m,you,bot,60,'bell',false,0,0,0);
    run(m,BODY.regenDelay-0.5);expect(you.health).toBeCloseTo(40,5);
    run(m,5);expect(you.health).toBe(100);
  });
  test('ammo and grenade pickups refill and then respawn',()=>{
    const m=duel();const you=m.fighters[0];
    const spot=m.pickups.find(p=>p.kind==='grenade'&&!p.dropped)!;
    you.x=spot.x;you.z=spot.z+3;you.y=spot.y;you.grenades=0;
    run(m,0.1);you.x=spot.x;you.z=spot.z;you.y=spot.y;run(m,0.1);
    expect(you.grenades).toBe(1);expect(spot.active).toBe(false);
    you.z=spot.z+3;run(m,20);expect(spot.active).toBe(true);
    you.z=spot.z;
    you.grenades=MAX_GRENADES;run(m,0.2);expect(spot.active).toBe(true);
  });
  test('a loadout change applies at once while spawn-shielded, else at the next life',()=>{
    const m=createMatch({mode:'brawl',map:'quad',difficulty:'easy',primary:'bell',seed:9});const you=m.fighters[0];
    chooseLoadout(m,you,'detention');expect(you.primary).toBe('detention');
    you.protectUntil=0;chooseLoadout(m,you,'recess');expect(you.primary).toBe('detention');expect(you.nextPrimary).toBe('recess');
  });
});

describe('modes',()=>{
  test('Lunchtime Brawl ends when someone reaches 25 eliminations, with win bonus for you',()=>{
    const m=duel({keep:[0,1]});const [you,bot]=m.fighters;
    for(let i=0;i<MODES.brawl.limit;i++){bot.alive=true;bot.protectUntil=0;damage(m,bot,you,999,'bell',false,0,0,0);}
    expect(m.over).toBe(true);expect(m.winner).toBe(0);
    expect(you.score).toBe(MODES.brawl.limit*POINTS.kill+3*POINTS.streak+POINTS.finish+POINTS.win);
    expect(standings(m)[0].id).toBe(0);
  });
  test('House Match counts team eliminations to 40',()=>{
    const m=duel({mode:'house',keep:[0,4]});const you=m.fighters[0],foe=m.fighters[4];
    for(let i=0;i<MODES.house.limit-1;i++){foe.alive=true;foe.protectUntil=0;damage(m,foe,you,999,'bell',false,0,0,0);}
    expect(m.teamScores[0]).toBe(39);expect(m.over).toBe(false);
    foe.alive=true;damage(m,foe,you,999,'bell',false,0,0,0);
    expect(m.over).toBe(true);expect(m.winner).toBe(0);
  });
  test('Hold the Quad: the house with more fighters in the zone scores; equal numbers contest; the zone moves each minute',()=>{
    const m=duel({mode:'quad',keep:[0,1,4]});const [you,mate]=m.fighters,foe=m.fighters[4];
    const zone=getMap('quad').zones[0];
    for(const f of [you,mate]){f.x=zone.x+(f.id?1:-1);f.z=zone.z+1;f.y=zone.y;}
    foe.x=20;foe.z=20;foe.y=0;
    expect(inZone(m,you)).toBe(true);
    run(m,3.05);
    expect(m.teamScores[0]).toBe(3);expect(you.zoneSeconds).toBe(3);expect(you.score).toBe(3*POINTS.zone);
    foe.x=zone.x;foe.z=zone.z-1;foe.y=zone.y;mate.x=20;mate.z=20;mate.y=0;
    run(m,2);expect(m.zoneOwner).toBe(-2);expect(m.teamScores).toEqual([3,0]);
    m.t=59.99;run(m,0.05);
    expect(m.zoneIndex).toBe(1);expect(eventsOf(m,'zone')).toHaveLength(1);
  });
  test('every mode stops at the five-minute limit and reports a winner or a draw',()=>{
    for(const mode of ['brawl','house','quad'] as const){
      const m=duel({mode,keep:[0]});m.t=MODES[mode].duration-0.01;run(m,0.05);
      expect(m.over).toBe(true);expect(eventsOf(m,'end')).toHaveLength(1);
      if(mode!=='brawl')expect(m.winner).toBe(-1);
    }
  });
});

describe('saving',()=>{
  test('a match survives a JSON round trip exactly',()=>{
    const m=createMatch({mode:'quad',map:'field',difficulty:'hard',primary:'triple',seed:77});
    run(m,2,()=>[hold(m.fighters[0],{mx:1,fire:true})]);
    const copy=restore(JSON.parse(JSON.stringify(serialize(m))))!;
    expect(copy).not.toBeNull();
    const strip=(x:typeof m)=>({...x,events:[]});
    expect(strip(copy)).toEqual(strip(m));
    step(m,STEP,[]);step(copy,STEP,[]);
    expect(copy.fighters.map(f=>[f.x,f.z,f.health])).toEqual(m.fighters.map(f=>[f.x,f.z,f.health]));
  });
  test('malformed or foreign snapshots are rejected',()=>{
    const m=createMatch({mode:'brawl',map:'quad',difficulty:'normal',primary:'bell',seed:1});
    const good=JSON.parse(JSON.stringify(serialize(m)));
    expect(restore(null)).toBeNull();expect(restore('x')).toBeNull();
    expect(restore({...good,version:99})).toBeNull();
    expect(restore({...good,fighters:good.fighters.slice(1)})).toBeNull();
    expect(restore({...good,settings:{...good.settings,map:'moon'}})).toBeNull();
    const bad=JSON.parse(JSON.stringify(good));bad.fighters[2].x='NaN';expect(restore(bad)).toBeNull();
    const badGun=JSON.parse(JSON.stringify(good));badGun.fighters[0].primary='laser';expect(restore(badGun)).toBeNull();
    const still=JSON.parse(JSON.stringify(good));still.projectiles=[{kind:'rocket',owner:1,x:0,y:1,z:12,vx:0,vy:0,vz:0,age:0,fuse:0.01}];
    const r0=restore(still)!;expect(r0.projectiles).toHaveLength(0);
    const clamp=JSON.parse(JSON.stringify(good));clamp.fighters[0].health=9999;clamp.fighters[0].grenades=50;
    const r=restore(clamp)!;expect(r.fighters[0].health).toBe(100);expect(r.fighters[0].grenades).toBe(MAX_GRENADES);
  });
});
