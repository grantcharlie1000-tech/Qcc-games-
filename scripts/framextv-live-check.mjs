/** Live contract check only. No QCC history, account or popularity endpoint is used.
 * Big Buck Bunny © 2008 Blender Foundation, https://peach.blender.org/about/ (CC BY 3.0).
 * npm dependency: @playwright/test; browser: npx playwright install --with-deps chromium.
 */
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function sustainedNativeProgress(samples=globalThis.samples){
 if(!Array.isArray(samples)||samples.length<5)return false;
 let seconds=0,previous;
 for(const sample of samples){
  if(!sample||!Number.isFinite(sample.time)||sample.time<0||!Number.isFinite(sample.at)){previous=undefined;continue;}
  if(previous){const elapsed=(sample.at-previous.at)/1000,advance=sample.time-previous.time;if(elapsed>0&&elapsed<=10&&advance>0&&advance<=elapsed*2+.5)seconds+=Math.min(advance,elapsed);}
  previous=sample;
 }
 return seconds>=10;
}
async function main(){
const origin='https://framextv.cc';
const embed=origin+'/embed/10378?autoplay=1&muted=1&no_ads=1';
const output=resolve(process.env.FRAMEXTV_EVIDENCE_DIR||'artifacts/framextv-live');
await mkdir(output,{recursive:true});
const server=createServer((_req,res)=>{
 res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><title>Live FrameXTV contract check</title><style>body{background:#111;color:white;font:16px sans-serif}iframe{width:960px;height:540px}</style><p>Live provider contract check. Big Buck Bunny © 2008 Blender Foundation, CC BY 3.0. No popularity report is sent.</p><iframe title="Lawful open-film test" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen" referrerpolicy="no-referrer" src="${embed}"></iframe><script>window.samples=[];addEventListener('message',event=>{const frame=document.querySelector('iframe');if(event.source!==frame.contentWindow||event.origin!==${JSON.stringify(origin)})return;const data=event.data;if(data&&data.event==='frameXTV:timeupdate'&&typeof data.currentTime==='number'&&Number.isFinite(data.currentTime))samples.length<8192&&samples.push({time:data.currentTime,duration:Number.isFinite(data.duration)?data.duration:null,at:performance.now(),sourceMatched:true,origin:event.origin});});</script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,page;
let passed=false;
try{
 browser=await chromium.launch();page=await browser.newPage({viewport:{width:1100,height:740}});
 // Untouched provider code and standard browser behavior. No request interception,
 // navigator spoofing, source substitution, private API calls or guard disabling.
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(sustainedNativeProgress,undefined,{timeout:90000});
 const frame=page.frame({url:/^https:\/\/framextv\.cc\/embed\/10378(?:\?|$)/});
 if(!frame)throw new Error('The embed redirected or was unloaded.');
 const video=frame.locator('video');
 await video.waitFor({state:'visible',timeout:5000});
 const native=await video.evaluate(node=>{let playedSeconds=0;for(let i=0;i<node.played.length;i++)playedSeconds+=node.played.end(i)-node.played.start(i);return {time:node.currentTime,playedSeconds,paused:node.paused};});
 if(!(native.playedSeconds>=10&&native.time>0&&!native.paused))throw new Error('No advancing native video was observed.');
 const samples=await page.evaluate(()=>window.samples);
 if(!samples.every(sample=>sample.sourceMatched&&sample.origin==='https://framextv.cc'))throw new Error('Unexpected message provenance.');
 await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',kind:'untouched-public-native-player',embed,native,samples},null,2));
 await page.screenshot({path:resolve(output,'native-player.png'),fullPage:true});
 passed=true;console.log('PASS: untouched public native player emitted advancing events from the exact iframe window and expected origin. No popularity report was sent.');
}catch{
 // Do not log arbitrary provider network errors, URLs, tokens or script messages.
 await writeFile(resolve(output,'result.json'),JSON.stringify({status:'failed',kind:'untouched-public-native-player',embed,reason:'Native playback and parent progress were not both verified within the deadline. No detection or access control was bypassed.'},null,2));
 if(page)await page.screenshot({path:resolve(output,'failed-player.png'),fullPage:true}).catch(()=>{});
 console.error('FAIL: live native player contract was not verified. Static source and synthetic fixtures are not a substitute.');
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
if(!passed)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
