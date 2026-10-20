// Usage: CHROMIUM_PATH=... node tests/games/animal-stack/preview/render-species.mjs <kind> <outDir>
// Loads only species/<kind>.ts. Writes <kind>.png (art at 4×), <kind>-colliders.png (art + collider overlay),
// <kind>-drop.png (after a solo drop on the platform) and prints JSON checks.
import {writeFile,mkdir,readdir} from 'node:fs/promises';import {existsSync} from 'node:fs';import {homedir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';import {chromium} from '@playwright/test';import Matter from 'matter-js';
const [kind,outDir]=process.argv.slice(2);if(!kind||!outDir)throw new Error('usage: render-species.mjs <kind> <outDir>');
const out=await build({stdin:{contents:`export {${kind} as def} from './species/${kind}';export {speciesBox} from './species/types';export {compoundBody} from './body';`,resolveDir:'src/games/animal-stack',loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,external:['matter-js']});
// Written under node_modules so the bundle shares this script's matter-js instance (body ids must not collide).
const cache=join('node_modules/.cache/animal-stack');await mkdir(cache,{recursive:true});const bundle=join(cache,`render-${kind}-${process.pid}.mjs`);await writeFile(bundle,out.outputFiles[0].text);
const {def,speciesBox,compoundBody}=await import(pathToFileURL(resolve(bundle)).href);
const problems=[];def.shapes.forEach((p,i)=>{if(!Matter.Vertices.isConvex(p))problems.push(`part ${i} not convex (or wrong winding/collinear)`);});
for(const m of def.art.matchAll(/id="([^"]+)"/g))if(!m[1].startsWith(kind))problems.push(`id "${m[1]}" must start with "${kind}"`);
if(/<image|<script|href="http/.test(def.art))problems.push('no <image>, scripts or external refs');
// Falls back to any locally installed Playwright headless shell when the pinned revision is absent.
async function installedShell(){const root=join(homedir(),'AppData/Local/ms-playwright');if(!existsSync(root))return undefined;for(const d of (await readdir(root)).filter(d=>d.startsWith('chromium_headless_shell-')).sort().reverse()){const exe=join(root,d,'chrome-headless-shell-win64/chrome-headless-shell.exe');if(existsSync(exe))return exe;}return undefined;}
// Solo drop: same body construction and platform as model.ts.
const {Bodies,Body,Composite,Engine,Vertices}=Matter;const FLOOR=2000/3*.73;
const engine=Engine.create({enableSleeping:true,positionIterations:12,velocityIterations:10});engine.gravity.y=.9;
const platform=Bodies.rectangle(180,FLOOR+5,324,10,{isStatic:true,friction:.9,frictionStatic:1.5,restitution:0});
const {body,offset}=compoundBody(kind,def.shapes,def.mass);Body.setPosition(body,{x:180,y:2000/3*.43});Composite.add(engine.world,[platform,body]);
for(let i=0;i<900;i++)Engine.update(engine,1000/60);
const drop={onPlatform:body.position.y<FLOOR,finalAngleDeg:Math.round(body.angle*180/Math.PI),width:Math.round(body.bounds.max.x-body.bounds.min.x),height:Math.round(body.bounds.max.y-body.bounds.min.y),area:Math.round(body.area),sleeping:body.isSleeping};
const b=speciesBox(def),overlay=def.shapes.map(p=>`<polygon points="${p.map(q=>q.x+','+q.y).join(' ')}" fill="#ff1c6433" stroke="#ed176b" stroke-width=".7"/>`).join('');
const page=(extra)=>`<html><body style="margin:0;background:#5ec8f2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" width="${b.width*4}" height="${b.height*4}"><g>${def.art}</g>${extra}</svg></body></html>`;
const dropPage=`<html><body style="margin:0;background:#5ec8f2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="40 ${FLOOR-140} 280 170" width="840" height="510"><rect x="18" y="${FLOOR}" width="324" height="10" fill="#9be23c" stroke="#161719" stroke-width="2"/><g transform="translate(${body.position.x} ${body.position.y}) rotate(${body.angle*180/Math.PI}) translate(${offset.x} ${offset.y})"><g>${def.art}</g></g></svg></body></html>`;
await mkdir(outDir,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||await installedShell()});
const errors=[];const tab=await browser.newPage({viewport:{width:b.width*4,height:b.height*4}});tab.on('console',m=>m.type()==='error'&&errors.push(m.text()));
await tab.setContent(page(''));await tab.screenshot({path:`${outDir}/${kind}.png`});
await tab.setContent(page(overlay));await tab.screenshot({path:`${outDir}/${kind}-colliders.png`});
await tab.setViewportSize({width:840,height:510});await tab.setContent(dropPage);await tab.screenshot({path:`${outDir}/${kind}-drop.png`});await browser.close();
await writeFile(`${outDir}/${kind}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.width} ${b.height}">${def.art}</svg>`);
console.log(JSON.stringify({kind,box:b,parts:def.shapes.length,mass:def.mass,drop,problems,errors}));
