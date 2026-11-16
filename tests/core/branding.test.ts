import {expect,test} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';

const html0=()=>readFileSync('index.html','utf8');
test('public branding changes without changing the existing installation identity',()=>{
 const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
 // The installed app is branded for its games and movies; the web page keeps its title.
 expect(manifest.name).toBe('QCC Games');expect(manifest.short_name).toBe('QCC Games');expect(manifest.description).toMatch(/games.*movies/i);expect(html0()).toContain('<meta name="apple-mobile-web-app-title" content="QCC Games">');
 expect(manifest.start_url).toBe('./');expect(manifest.scope).toBe('./');expect(manifest).not.toHaveProperty('id');for(const icon of manifest.icons)expect(existsSync('public/'+icon.src.slice(2))).toBe(true);expect(manifest.icons.some((icon:{type:string;sizes:string})=>icon.type==='image/png'&&icon.sizes==='512x512')).toBe(true);
 const html=readFileSync('index.html','utf8');expect(html).toContain('<title>Mauri Study Notes · Games &amp; Revision</title>');expect(html).toContain('href="./manifest.webmanifest"');expect(html).not.toContain('Twelve little games');expect(JSON.parse(readFileSync('package.json','utf8')).name).toBe('pocket-offline-arcade');
 for(const base of ['https://example.test/','https://example.test/Qcc-games-/'])expect(new URL(manifest.start_url,new URL('manifest.webmanifest',base)).href).toBe(base);
});
