// Offline packs are retired. Keep this entry point as the production recovery gate.
import {spawn} from 'node:child_process';
import {verifyBuiltKillSwitch} from './verify-sw-kill-switch.mjs';
await verifyBuiltKillSwitch();
async function browserAudit(config){
 return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','--config='+config],{stdio:'inherit'});
 child.once('error',reject);
 child.once('exit',(code,signal)=>code===0?resolve():reject(new Error('Worker recovery browser tests failed: '+(signal||code))));
});
}
await browserAudit('playwright.sw-kill-switch.config.ts');
await browserAudit('playwright.offline-downloads.config.ts');
