import {test} from '../../fixtures';
test('diag',async({page})=>{
  test.setTimeout(120000);
  page.on('pageerror',e=>console.log('PAGEERROR',e.message,e.stack?.split('\n').slice(0,6).join(' | ')));
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('CONSOLE',m.type(),m.text().slice(0,300));});
  await page.setViewportSize({width:960,height:540});
  await page.goto('/#/game/blockcraft');
  await page.locator('.blockcraft[data-ready="true"]').waitFor({timeout:60000});
  await page.getByRole('button',{name:'Play',exact:true}).click();
  for(let i=0;i<8;i++){
    const r=await page.evaluate(()=>{
      const g=(window as unknown as {blockcraft:{time:{tick:number};state:string}}).blockcraft;
      return {phase:document.querySelector('.blockcraft')!.getAttribute('data-phase'),tick:g.time.tick,state:g.state,hidden:document.hidden};
    });
    console.log(JSON.stringify(r));
    await page.waitForTimeout(3000);
  }
});
