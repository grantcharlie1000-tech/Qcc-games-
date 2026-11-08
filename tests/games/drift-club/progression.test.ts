import {expect,it} from 'vitest';
import {chooseRivalShot} from '../../../src/games/drift-club/rival';
import {masterOpen,newBook,recordDelivery,readBook} from '../../../src/games/drift-club/logbook';
import {DEFAULT_SHOT,courseIndex,fresh,hasSpin,points,readMatch,replay,slide,totals,validShot} from '../../../src/games/drift-club/model';
it('the pilot finds a legal reply to a scoring guard using only remaining deliveries',()=>{
 const m=fresh('rival');m.shots=[{angle:0,power:59,spin:0}];
 const p=replay(m),response=chooseRivalShot(m,p);expect(validShot(response)&&hasSpin(m,response.spin)).toBe(true);
 const [human,pilot]=totals(slide(p,response,1,0,true)[0]);expect(pilot-human).toBeGreaterThan(0);
});
it('the score is awarded after court three and the alternate layout survives restoration',()=>{
 const book=newBook(),m=fresh();m.shots=Array(4).fill(DEFAULT_SHOT);
 const puck={x:0,z:-4.8,seat:0,bonus:1};
 recordDelivery(book,m,puck,[32,0]);expect(masterOpen(book)).toBe(false);expect(book.bank).toBe(true);
 m.end=2;m.shots=Array(12).fill(DEFAULT_SHOT);recordDelivery(book,m,puck,[32,0]);
 expect(masterOpen(readBook(book))).toBe(true);
 const expert=fresh('master');expert.shots=[DEFAULT_SHOT];const restored=readMatch(expert)!;
 expect(courseIndex(restored)).toBe(3);expect(replay(restored)).not.toEqual(replay({...restored,mode:'solo'}));
});
it('rival wins unlock the master tour, but multiplayer games and rival tricks cannot earn solo awards',()=>{
 const b=newBook(),m=fresh('duel');m.end=2;m.shots=Array(24).fill(DEFAULT_SHOT);
 const puck={x:.38,z:-4.8,seat:1,bonus:2};expect(points(puck,2)).toBe(10);
 recordDelivery(b,m,puck,[35,10]);expect(b).toEqual(newBook());
 m.mode='rival';recordDelivery(b,m,puck,[35,10]);
 expect(b.gate).toBe(false);expect(b.pilot&&masterOpen(b)).toBe(true);
});
