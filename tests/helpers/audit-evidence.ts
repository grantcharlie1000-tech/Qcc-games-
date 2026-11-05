import type {Page,TestInfo} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

/** Review evidence, not a pixel assertion. Call only with isolated synthetic fixtures
 * after the visible state is asserted. Never use against signed-in live accounts.
 * Keep the viewport (including fixed navigation), rather than stitching a full page.
 * Do not disable animations: doing so can change the behavior being measured.
 */
export async function captureAuditEvidence(page:Page,testInfo:TestInfo,scenario:string,assertState?:(phase:'before'|'after')=>Promise<void>){
 const size=page.viewportSize();
 const name=`after-${scenario.replace(/[^a-z0-9-]/gi,'-')}-${size?`${size.width}x${size.height}`:'viewport'}`;
 await page.evaluate(()=>document.fonts.ready.then(()=>{}));
 await assertState?.('before');
 const path=testInfo.outputPath(`${name}.png`);
 const png=await page.screenshot({fullPage:false,caret:'hide'});
 // The after guard must inspect immediately, without waiting for state to return.
 // Do not retain a successful-state image if the UI changed during capture.
 await assertState?.('after');
 await writeFile(path,png);
 await testInfo.attach(name,{path,contentType:'image/png'});
}
