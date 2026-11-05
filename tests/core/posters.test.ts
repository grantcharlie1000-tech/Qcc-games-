import {readFileSync} from 'node:fs';
import {describe,expect,test} from 'vitest';
import {games} from '../../src/core/catalog';

// Every library poster comes from scripts/generate-posters.mjs and shares one frame and stage.
describe.each(games.map(game=>[game.id,game] as const))('%s poster',(id,game)=>{
  const svg=readFileSync(new URL(`../../public/game-art/${id}/cover.svg`,import.meta.url),'utf8');
  test('is well-formed SVG in the shared 320×410 frame with an accessible title',()=>{
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
  test('uses the shared stage and matches its library card',()=>{
    for(const id of ['bg','glow','dots','drop'])expect(svg).toContain(`id="${id}"`);
    expect(svg).toContain(`<stop stop-color="${game.color}"/>`);
    expect(game.ink).toBe('#fff3df');
  });
});
