import {expect} from '../../fixtures';
import type {Page} from '../../fixtures';
import {AIR,blockId} from '../../../src/games/blockcraft/data/blocks';
import {evidencePath} from './helpers/browser';

// Mob photo stage for the passive-look and hostile-look specs: a flat grass stage at noon in the real engine, the mobs
// standing still on it facing the camera, a screenshot saved as evidence (tests/games/blockcraft/evidence/mobs-*.png).
// In development window.blockcraft is the engine; software WebGL is slow, so everything waits with generous timeouts.
type Engine={[k:string]:any};
export type Mob=[kind:string,side:number,ahead:number,turn:number,options?:{data?:Record<string,unknown>;baby?:boolean}];

export async function openStage(page:Page){
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/shader|webglprogram/i.test(m.text()))errors.push(m.text());});
  await page.setViewportSize({width:960,height:600});
  await page.goto('/#/game/blockcraft');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:90000});
  await page.getByRole('button',{name:'Game mode'}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing',{timeout:30000});
  // Hide the HUD and the hand, freeze the clock at noon with clear weather, no natural spawns.
  await page.keyboard.press('F1');
  await page.evaluate(()=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft;
    g.updateSettings({mobSpawning:false,daylightCycle:false,weatherCycle:false});g.skipTime(6000);
  });
  return errors;
}
const frames=(page:Page,n:number)=>page.evaluate(n=>new Promise<void>(done=>{let k=0;const step=()=>{if(++k>=n)done();else requestAnimationFrame(step);};requestAnimationFrame(step);}),n);

/** Clears a flat grass stage north of the player, stands the mobs on it (frozen: no AI, no burning) facing the camera,
 *  waits for the meshes and saves a screenshot. Returns the entity render stats. */
export async function stage(page:Page,name:string,mobs:readonly Mob[],view:{ahead?:number;pitch?:number}={}){
  await page.evaluate(([mobs,blocks])=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft,p=g.player.state;
    // The photo owns the whole entity scene, including animals waiting for unloaded chunks.
    g.entities.reset();
    const cx=Math.floor(p.x),cz=Math.floor(p.z),y0=g.world.topY(cx,cz);
    for(let dx=-9;dx<=9;dx++)for(let dz=-14;dz<=4;dz++){
      g.world.set(cx+dx,y0,cz+dz,blocks.grass);
      for(let y=y0+1;y<=y0+10;y++)g.world.set(cx+dx,y,cz+dz,blocks.air);
      for(let y=y0-1;y>=y0-3;y--)g.world.set(cx+dx,y,cz+dz,blocks.dirt);
    }
    p.flying=true;g.player.teleport(cx+.5,y0+1,cz+.5);
    for(const [kind,side,ahead,turn,options] of mobs as Mob[]){
      const k=g.entities.kind(kind);
      k.tick=()=>{};k.burnsInDaylight=false;
      const e=g.entities.spawn(kind,cx+.5+side,y0+1,cz+.5-ahead,{...options,yaw:Math.PI+turn,reason:'egg'});
      if(e){e.headYaw=e.yaw;Object.assign(e.data,options?.data??{});}
    }
  },[mobs,{grass:blockId('grass_block'),air:AIR,dirt:blockId('dirt')}] as const);
  await page.evaluate(([pitch])=>{const g=(window as unknown as {blockcraft:Engine}).blockcraft;g.player.state.yaw=0;g.player.state.pitch=pitch;},[view.pitch??-.42]);
  // Let the stage remesh and the mobs settle on the grass.
  let meshes=-1;
  for(let i=0;i<20;i++){
    await frames(page,8);
    const m=Number(await page.locator('.blockcraft').getAttribute('data-meshes'));
    if(m===meshes)break;meshes=m;
  }
  await frames(page,20);
  const stats=await page.evaluate(()=>{const g=(window as unknown as {blockcraft:Engine}).blockcraft;return{...g.entities.debug.render,count:g.entities.all().length};});
  // Advancement toasts (creative inventory unlocks) would cover the stage: hide them for the photo.
  await page.evaluate(()=>{for(const el of document.querySelectorAll<HTMLElement>('.bc-adv-toasts'))el.style.visibility='hidden';});
  await page.locator('.blockcraft canvas').screenshot({path:evidencePath(`mobs-${name}.png`)});
  return stats as {entities:number;drawCalls:number;count:number};
}

