import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';

const css=readFileSync('src/movies/style.css','utf8');

test('no unused legacy Movies styles remain',()=>{
 for(const selector of ['.movies-eyebrow','.movies-card-mark','.movies-poster-logo','.movies-profile','.movies-hero-index','.movies-hero-note','.movies-source-controls','.movies-secondary'])expect(css).not.toContain(selector);
});

test('margins and paddings never need !important in the Movies styles',()=>{
 expect(css).not.toMatch(/(?:margin|padding)[^;{}]*!important/);
});
