import {expect,test} from 'vitest';
import {GUN_CATALOG,allowedLoadout,defaultLoadout,validateLoadout,gunFor,damageAt,bodyFor} from '../../../src/games/strongroom/loadouts';

test('operator and side constrain primary/secondary choices, including the Pump fallback',()=>{
 expect(allowedLoadout(true,'cinder').primaries).toEqual(['ak47']);
 expect(allowedLoadout(true,'wren').primaries).toEqual(['m4a1','awp']);
 expect(allowedLoadout(false,'hush').primaries).toEqual(['smg']);
 expect(allowedLoadout(false,'latch').primaries).toEqual(['mp5','m4a1']);
 expect(validateLoadout(true,{operator:'hush',primary:'smg',secondary:'usp'})).toBeNull();
 expect(validateLoadout(true,{operator:'wren',primary:'ak47',secondary:'usp'})).toBeNull();
 expect(validateLoadout(true,{operator:'wren',primary:'awp',secondary:'usp'})).toMatchObject({primary:'awp'});
 expect(defaultLoadout(true)).toEqual({operator:'cadet',primary:'m4a1',secondary:'usp'});
});

test('weapon slot selects the equipped gun without changing the slot protocol',()=>{
 expect(gunFor({weapon:0,primary:'awp',secondary:'glock'}).name).toBe('MR-4 Marksman');
 expect(gunFor({weapon:1,primary:'awp',secondary:'glock'}).mag).toBe(17);
 expect(gunFor({weapon:0}).name).toBe('TC-5 Carbine');
 expect(gunFor({weapon:1}).name).toBe('S-45 Suppressed');
});

test('range and headshot damage use each gun’s own falloff instead of rifle defaults',()=>{
 expect(damageAt(GUN_CATALOG.ak47,10,false)).toBe(41);
 expect(damageAt(GUN_CATALOG.mp5,28,false)).toBe(17);
 expect(damageAt(GUN_CATALOG.awp,70,true)).toBe(136);
 expect(damageAt(GUN_CATALOG.glock,30,false)).toBe(15);
 expect(damageAt(GUN_CATALOG.deagle,40,true)).toBe(84);
});

test('each body type provides the authored health and movement multiplier',()=>{
 expect(bodyFor('cinder')).toEqual({hp:125,speed:.93});
 expect(bodyFor('wren')).toEqual({hp:100,speed:1.06});
 expect(bodyFor('cadet')).toEqual({hp:112,speed:1});
});
