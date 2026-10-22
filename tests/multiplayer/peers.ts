// Independent browser sessions for online tests: each player gets its own Chromium process (separate storage, separate
// WebRTC stack), signalling through the real PeerJS Cloud. Inside a proxied container the browsers reach PeerJS through
// HTTPS_PROXY; the game server itself is local.
import {chromium,type Browser,type Page} from '@playwright/test';
import {seedStudyTopic} from '../fixtures';

export const BASE=process.env.ARCADE_URL||'http://127.0.0.1:4173';
const proxy=process.env.HTTPS_PROXY||process.env.https_proxy;
export interface Player{browser:Browser;page:Page}
export async function launchPlayer(name:string):Promise<Player>{
  const browser=await chromium.launch({
    executablePath:process.env.CHROMIUM_PATH||undefined,
    // Same-machine peers connect over host candidates; mDNS-obfuscated candidates do not resolve in containers.
    args:['--no-sandbox','--disable-features=WebRtcHideLocalIpsWithMdns','--enable-webgl','--use-gl=angle','--use-angle=swiftshader'],
    proxy:proxy?{server:proxy,bypass:'127.0.0.1,localhost'}:undefined
  });
  const context=await browser.newContext({ignoreHTTPSErrors:!!proxy,viewport:{width:1280,height:900}});
  await seedStudyTopic(context);
  await context.addInitScript(n=>localStorage.setItem('pocket-arcade:v1:mp:name',JSON.stringify(n)),name);
  const page=await context.newPage();
  page.on('pageerror',e=>console.log(`[${name}] pageerror`,e.message));
  return {browser,page};
}
export async function closeAll(players:Player[]){for(const p of players)await p.browser.close().catch(()=>{});}
