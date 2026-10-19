import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:1366,height:900}});
await page.goto(`${process.env.ARCADE_URL || 'http://127.0.0.1:4182'}/#/game/water-sort`);
await page.locator('.ws-game[data-phase="ready"]').waitFor();
const measurements = await page.evaluate(async () => {
  const { LEVELS } = await import('/src/games/water-sort/levels.ts');
  const { solve } = await import('/src/games/water-sort/solver.ts');
  const levels = LEVELS.map((level,index)=>{
    const start = performance.now(), route = solve(level.board);
    return {level:index+1,name:level.name,shortestPours:route?.length,solveMs:Math.round((performance.now()-start)*100)/100};
  });
  const intervals = await new Promise(resolve=>{
    const values=[];let previous;
    const frame = time=>{if(previous!==undefined)values.push(time-previous);previous=time;if(values.length<40)requestAnimationFrame(frame);else resolve(values);};
    requestAnimationFrame(frame);
  });
  return {engine:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},levels,raf:{samples:intervals.length,meanMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,maxMs:Math.max(...intervals)}};
});
await page.getByRole('combobox',{name:'Level',exact:true}).selectOption('8');
await page.screenshot({path:'tests/games/water-sort/evidence/chromium-desktop.png',fullPage:true});
await writeFile('tests/games/water-sort/evidence/tube.svg',await page.locator('.ws-glass').first().evaluate(el=>new XMLSerializer().serializeToString(el)));
await writeFile('tests/games/water-sort/evidence/measurements.json',JSON.stringify(measurements,null,2)+'\n');
console.log(JSON.stringify(measurements,null,2));
await browser.close();
