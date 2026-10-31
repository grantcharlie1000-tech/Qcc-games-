import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';

const css=readFileSync('src/movies/style.css','utf8');

test('no unused legacy Movies styles remain',()=>{
 for(const selector of ['.movies-eyebrow','.movies-card-mark','.movies-poster-logo','.movies-profile','.movies-hero-index','.movies-hero-note','.movies-source-controls','.movies-secondary'])expect(css).not.toContain(selector);
});

test('margins and paddings never need !important in the Movies styles',()=>{
 expect(css).not.toMatch(/(?:margin|padding)[^;{}]*!important/);
});

// The Movies page is black with the shared type, so the old cyan accent is gone from its stylesheet: in hex or rgb, as its variable and by name.
const oldAccent=[/#69d8f4/i,/#8ce8f8/i,/#b4f2ff/i,/#a3edfa/i,/rgba?\(\s*105[\s,]+216[\s,]+244/i,/rgba?\(\s*140[\s,]+232[\s,]+248/i,/rgba?\(\s*180[\s,]+242[\s,]+255/i,/rgba?\(\s*163[\s,]+237[\s,]+250/i,/--movies-accent/,/cyan/i];
test.each(oldAccent.map(pattern=>[pattern.source,pattern] as const))('the Movies styles never use %s',(_source,pattern)=>{
 expect(css).not.toMatch(pattern);
});
