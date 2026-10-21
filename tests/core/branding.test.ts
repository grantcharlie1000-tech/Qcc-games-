import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

test('public branding changes without changing the existing installation identity',()=>{
 const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
 expect(manifest.name).toBe('Mauri Study Notes');expect(manifest.short_name).toBe('Mauri Notes');expect(manifest.description).toMatch(/revision chapters.*games/i);
 expect(manifest.start_url).toBe('./');expect(manifest.scope).toBe('./');expect(manifest).not.toHaveProperty('id');expect(manifest.icons).toEqual([{src:'./icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]);
 const html=readFileSync('index.html','utf8');expect(html).toContain('<title>Mauri Study Notes · Games &amp; Revision</title>');expect(html).toContain('href="./manifest.webmanifest"');expect(html).not.toContain('Twelve little games');expect(JSON.parse(readFileSync('package.json','utf8')).name).toBe('pocket-offline-arcade');
 for(const base of ['https://example.test/','https://example.test/Qcc-games-/'])expect(new URL(manifest.start_url,new URL('manifest.webmanifest',base)).href).toBe(base);
});
