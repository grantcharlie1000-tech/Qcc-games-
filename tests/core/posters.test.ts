import {readFileSync} from 'node:fs';
import {describe,expect,test} from 'vitest';
import {games} from '../../src/core/catalog';

// Every library poster shares the generated voxel frame.
describe.each(games.map(game=>[game.id,game] as const))('%s poster',(id,game)=>{
  const svg=readFileSync(new URL(`../../public/game-art/${id}/cover.svg`,import.meta.url),'utf8');
  test('is well-formed SVG in its artwork frame with an accessible title',()=>{
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg ')).toBe(true);
    expect(svg).toContain('viewBox="0 0 320 410"');
    expect(svg).toMatch(/<title id="title">[^<]+<\/title>/);
    expect(svg).not.toMatch(/<script|href=|<image/);
    // svg-skill: lettering is drawn as paths (no device-font dependency) and coordinates keep two decimals.
    expect(svg).not.toContain('<text');
    expect(svg).not.toMatch(/\d\.\d{3,}/);
    const stack:string[]=[],body=svg.replace(/^<\?xml[^>]*\?>/,'');
    for(const [,close,name,attrs,self] of body.matchAll(/<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g)){
      expect(attrs.replace(/\s+[\w:-]+="[^"<]*"/g,'').trim(),`<${name}${attrs}>`).toBe('');
      if(close)expect(stack.pop()).toBe(name);else if(!self)stack.push(name);
    }
    expect(stack).toEqual([]);
  });
  test('uses flat artwork on a backdrop that matches its library card',()=>{
    // Flat-shaded blocks only: no gradients, filters, blurs or masks.
    expect(svg).not.toMatch(/Gradient|<filter|<mask|<pattern/);
    expect(svg).toContain(`<path fill="${game.color}" d="M0 0h320v410H0Z"/>`);
    expect(game.ink).toBe('#fff3df');
  });
});
