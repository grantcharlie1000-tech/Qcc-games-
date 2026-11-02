import {describe,expect,it} from 'vitest';
import {teamTone} from '../../../src/games/strongroom/operator-tone';

type RGB=[number,number,number];
// Independent CPU reference of composite.js's GLSL (mat3 constructors are columns).
function composite(scene:RGB,exposure:number):RGB{
 const [r,g,b]=scene.map(c=>Math.max(0,c)*exposure/.6);
 const fit=(v:number)=>(v*(v+.0245786)-.000090537)/(v*(.983729*v+.4329510)+.238081);
 const a=fit(.59719*r+.35458*g+.04823*b),c=fit(.076*r+.90834*g+.01566*b),d=fit(.02840*r+.13383*g+.83777*b);
 return [1.60475*a-.53108*c-.07367*d,-.10208*a+1.10813*c-.00605*d,-.00327*a-.07276*c+1.07602*d].map(v=>{
  const x=Math.min(1,Math.max(0,v));return 255*(x<=.0031308?12.92*x:1.055*x**.41666-.055);
 }) as RGB;
}
const bytes=(hex:string):RGB=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)) as RGB;

describe('teamTone',()=>{
 it('reuses the solved tone for the same hex in either case',()=>{
  expect(teamTone('#3d9bff')).toBe(teamTone('#3D9BFF'));
 });
 it.each(['#3D9BFF','#FF8A1F'])('decodes desired %s to linear sRGB',hex=>{
  const expected=bytes(hex).map(b=>{const s=b/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});
  expect(teamTone(hex).linear).toEqual(expected);
 });
 // These saturated targets need negative scene RGB for an exact inverse. Bounds are
 // measured against the original palette, not against a substituted hex color.
 for(const [hex,maxError] of [['#3D9BFF',16],['#FF8A1F',4]] as const)it.each([.5,1.45,2.1])(`projects ${hex} through ACES at exposure %s within its nonnegative gamut bound`,exposure=>{
  const {hdr}=teamTone(hex),supplied=hdr.map(c=>c/exposure) as RGB,actual=composite(supplied,exposure),desired=bytes(hex);
  for(let i=0;i<3;i++)expect(Math.abs(actual[i]-desired[i]),`channel ${i}: ${actual}`).toBeLessThanOrEqual(maxError);
 });
 for(const hex of ['#8090A0','#CC8A44'])it.each([.5,1.45,2.1])(`round-trips feasible ${hex} through ACES at exposure %s`,exposure=>{
  const {hdr}=teamTone(hex),actual=composite(hdr.map(c=>c/exposure) as RGB,exposure),desired=bytes(hex);
  for(let i=0;i<3;i++)expect(Math.abs(actual[i]-desired[i])).toBeLessThan(.01);
 });
 it.each(['#000000','#FFFFFF','#FF0000','#00FF00','#0000FF','#00FFFF','#FF00FF','#FFFF00','#010101'])('keeps gamut edge %s finite and nonnegative',hex=>{
  const {linear,hdr}=teamTone(hex);
  for(const c of [...linear,...hdr]){expect(Number.isFinite(c)).toBe(true);expect(c).toBeGreaterThanOrEqual(0);}
  const actual=composite(hdr,1);for(const c of actual){expect(Number.isFinite(c)).toBe(true);expect(c).toBeGreaterThanOrEqual(0);expect(c).toBeLessThanOrEqual(255);}
 });
});
