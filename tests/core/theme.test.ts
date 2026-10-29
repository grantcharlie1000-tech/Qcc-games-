import {readFileSync} from 'node:fs';import {expect,test} from 'vitest';import {uiIcon} from '../../src/ui/icons';
const css=readFileSync('src/theme.css','utf8');
test('defines the spec tokens',()=>{for(const [name,value] of [['--c-bg','#000'],['--c-950','#09090b'],['--c-900','#18181b'],['--c-800','#27272a'],['--c-400','#9f9fa9'],['--c-300','#d4d4d8'],['--c-rose','#ff2056'],['--c-amber','#ffb900'],['--r-lg','8px'],['--r-xl','12px'],['--header-h','56px'],['--tabbar-h','57px'],['--page-max','1280px']])expect(css).toMatch(new RegExp(`${name}:\\s*${value}[;}]`));});
test('focus stays visible and motion can be reduced',()=>{expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid #fff/);expect(css).toContain('prefers-reduced-motion: reduce');expect(css).toContain('.reduce-motion');expect(css).toContain('(hover:hover) and (pointer:fine)');});
test('icons are decorative 24px drawings',()=>{for(const name of ['grid','film','tv','bookmark','star','search','menu','study','play','chevron-left','chevron-right','back','close','image'] as const){const svg=uiIcon(name);expect(svg).toContain('viewBox="0 0 24 24"');expect(svg).toContain('aria-hidden="true"');expect(svg).not.toContain('undefined');}});
test('image states apply only inside .ui-images and footer separators carry no text',()=>{
 for(const rule of ['.ui-images .ui-card-img.is-loaded{','.ui-images .ui-hero-backdrop.is-loaded{','.ui-images .ui-card-img.is-failed,.ui-images .ui-hero-backdrop.is-failed{'])expect(css).toContain(rule);
 expect(css).toContain(".ui-footer-links>*+*::before{content:'';");
 expect(css).not.toContain("content:'•'");
});
test('cards press in, reduced motion holds them still, and the footer button reset lives in the theme',()=>{
 expect(css).toContain('.ui-card:active{transform:scale(.98)}');
 expect(css).toContain('.ui-card-img,.ui-card-play,.ui-btn,.ui-tab,.ui-card{transform:none!important}');
 expect(css).toContain('.reduce-motion :is(.ui-card-img,.ui-card-play,.ui-btn,.ui-tab,.ui-card){transform:none!important}');
 expect(css).toContain('.ui-footer-links button{padding:0;border:0;background:none;color:inherit;cursor:pointer}');
 expect(css).toContain('.ui-card-title{display:block;');
});
