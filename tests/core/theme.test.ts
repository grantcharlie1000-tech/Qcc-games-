import {readFileSync} from 'node:fs';import {expect,test} from 'vitest';import {uiIcon} from '../../src/ui/icons';
const css=readFileSync('src/theme.css','utf8');
test('defines the spec tokens',()=>{for(const [name,value] of [['--c-bg','#000'],['--c-950','#09090b'],['--c-900','#18181b'],['--c-800','#27272a'],['--c-400','#9f9fa9'],['--c-300','#d4d4d8'],['--c-rose','#ff2056'],['--c-amber','#ffb900'],['--r-lg','8px'],['--r-xl','12px'],['--header-h','56px'],['--tabbar-h','64px'],['--tabbar-gap','12px'],['--page-max','1280px']])expect(css).toMatch(new RegExp(`${name}:\\s*${value}[;}]`));expect(css).toContain('--ease-drawer:cubic-bezier(.32,.72,0,1)');});
test('focus stays visible and motion can be reduced',()=>{expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid #fff/);expect(css).toContain('prefers-reduced-motion: reduce');expect(css).toContain('.reduce-motion');expect(css).toContain('(hover:hover) and (pointer:fine)');});
test('icons are decorative 24px drawings',()=>{for(const name of ['grid','film','tv','bookmark','search','menu','study','play','chevron-left','chevron-right','back','close','image'] as const){const svg=uiIcon(name);expect(svg).toContain('viewBox="0 0 24 24"');expect(svg).toContain('aria-hidden="true"');expect(svg).not.toContain('undefined');}});
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
test('the white focus ring is scoped to Movies & TV and the island, and the arcade has no global body rule',()=>{
 expect(css).toContain(':root[data-input="keyboard"] :is(.movies-view,.ui-tabbar) :focus-visible{outline:2px solid #fff;outline-offset:2px}');
 expect(css).not.toContain(':not(#game-stage *):focus-visible{outline:2px solid #fff');
 expect(css).not.toMatch(/(^|[^\w.-])body\s*\{/m);
 expect(css).toMatch(/\.ui-tabbar\{[^}]*font-family:var\(--font-sans\)/);
});
test('dormant ui rules and the unread custom properties are gone',()=>{
 const literal=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 for(const selector of ['.ui-empty','.ui-hero-poster','.ui-panel','.ui-pill-count','.ui-sheet','.ui-skeleton','.ui-status','.ui-chip.saved'])expect(css).not.toMatch(new RegExp(literal(selector)+'(?![\\w-])'));
 expect(readFileSync('src/style.css','utf8')).not.toMatch(/--(purple|cream):/);
});
// The forced-colours block takes the island's backdrop off, prefixed and unprefixed, so the bar is the flat system colour.
test('forced colours take the island backdrop off, prefixed and unprefixed',()=>{
 expect(css).toMatch(/@media \(forced-colors:active\)\{\.ui-tabbar,\.ui-tabbar\.is-refracting\{[^}]*-webkit-backdrop-filter:none;backdrop-filter:none/);
});
// The fallbacks that take the glass out hide the lens, its glow and the scroll edge in the stylesheet too, so a solid bar does not wait for the script.
// They also switch off the frost, which is the bar's own backdrop filter, before the script has read the new mode.
test('reduced transparency, more contrast and forced colours hide the glass layers and the scroll edge in CSS',()=>{
 for(const media of ['@media (prefers-reduced-transparency:reduce)','@media (prefers-contrast:more)','@media (forced-colors:active)']){
  const block=css.split('\n').find(line=>line.startsWith(media))??'';
  expect(block,`${media} block`).toContain('.ui-glass-lens{display:none}');
  expect(block,`${media} block`).toContain('.ui-glass-glow{display:none}');
  expect(block,`${media} block`).toContain('.ui-scroll-edge{display:none}');
  expect(block,`${media} block`).toContain('.ui-tabbar[data-glass="frost"]{-webkit-backdrop-filter:none;backdrop-filter:none}');
 }
});
// The frost is the bar's own blur, so the bar is a backdrop root and fades its own opacity. Only the backdrop keeps the bar at full opacity
// and fades its children: below 1 the backdrop lens would lose its frost.
test('the frost bar carries its own blur, and only the backdrop keeps the bar at full opacity',()=>{
 expect(css).toMatch(/\.ui-tabbar\[data-glass="frost"\]\{[^}]*-webkit-backdrop-filter:var\(--glass-frost-body\)/);
 expect(css).toMatch(/\.ui-tabbar\[data-glass="frost"\]\{[^}]*(?<![-\w])backdrop-filter:var\(--glass-frost-body\)/);
 expect(css).toMatch(/\.ui-tabbar\[data-glass="backdrop"\]\{[^}]*opacity:1/);
 expect(css).not.toMatch(/\.ui-tabbar\[data-glass\][{\[:]/);
 expect(css).not.toContain('data-glass="mirror"');
});
// The scroll edge is a phone effect. It is a sibling after the island, so the stylesheet fades it with the island, and it takes no taps.
test('the scroll edge is phone-only, takes no taps, and fades with the island',()=>{
 expect(css).toMatch(/\.ui-scroll-edge\{[^}]*pointer-events:none/);
 expect(css).toMatch(/@media \(min-width:640px\)\{\.ui-scroll-edge\{display:none\}\}/);
 expect(css).toMatch(/\.ui-tabbar\[data-hidden="true"\]:not\(:has\(:focus-visible\)\)\+\.ui-scroll-edge\{opacity:0/);
});
