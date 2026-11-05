import type {Page,TestInfo} from '@playwright/test';

/** Review evidence, not a pixel assertion. Call only with isolated synthetic fixtures
 * after the visible state is asserted. Never use against signed-in live accounts.
 * Keep the viewport (including fixed navigation), rather than stitching a full page.
 * Do not disable animations: doing so can change the behavior being measured.
 */
export async function captureAuditEvidence(page:Page,testInfo:TestInfo,scenario:string){
 const size=page.viewportSize();
 const name=`after-${scenario.replace(/[^a-z0-9-]/gi,'-')}-${size?`${size.width}x${size.height}`:'viewport'}`;
 await page.evaluate(()=>document.fonts.ready.then(()=>{}));
 const path=testInfo.outputPath(`${name}.png`);
 await page.screenshot({path,fullPage:false,caret:'hide'});
 await testInfo.attach(name,{path,contentType:'image/png'});
}
