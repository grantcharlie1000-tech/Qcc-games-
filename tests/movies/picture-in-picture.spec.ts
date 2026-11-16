import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';

async function openPlayer(page:Page){
 await page.goto('/#/movies/movie-157336/play');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
}
const hide=(page:Page)=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});

test.beforeEach(async({page})=>{
 await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>{await dialog.getByRole('button',{name:'Continue',exact:true}).click();});
 await page.route('https://framextv.cc/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
 await page.route('https://image.tmdb.org/**',r=>r.abort());
 await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

test('without picture in picture, switching away still stops the stream',async({page})=>{
 await openPlayer(page);
 await hide(page);
 await expect(page.locator('.movies-provider-frame')).toHaveCount(0);
});

test('picture in picture keeps the stream playing while the app is in the background',async({page})=>{
 // The fallback path: no Document Picture-in-Picture, as on iPhone, Safari and Firefox.
 await page.addInitScript(()=>{delete (window as Window&{documentPictureInPicture?:unknown}).documentPictureInPicture;});
 await openPlayer(page);
 const button=page.getByRole('button',{name:'Picture in picture'});
 await button.click();
 await expect(button).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#movies-player-status')).toContainText('picture in picture');
 await hide(page);
 await expect(page.locator('.movies-provider-frame')).toHaveCount(1);
});

test('where the browser has a picture in picture window, the player moves into it and back at the same time',async({page})=>{
 await page.addInitScript(()=>{if(window===window.top)localStorage.setItem('qcc:movies:v1',JSON.stringify({list:[],progress:{'movie-157336':120},titles:{},meta:{'movie-157336':{duration:5400,updated:1}}}));});
 await openPlayer(page);
 test.skip(!await page.evaluate(()=>'documentPictureInPicture' in window),'This browser has no Document Picture-in-Picture');
 await page.getByRole('button',{name:'Picture in picture'}).click();
 await expect(page.getByText('Playing in picture in picture')).toBeVisible();
 // The real picture in picture window holds the player, resumed at the saved time.
 const pipSource=()=>page.evaluate(()=>(window as unknown as {documentPictureInPicture:{window:Window|null}}).documentPictureInPicture.window?.document.querySelector('iframe')?.src??'');
 await expect.poll(pipSource).toMatch(/[?&]t=120\b/);
 await hide(page);
 await expect.poll(pipSource).toMatch(/framextv/);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});});
 await page.getByRole('button',{name:'Back to page'}).click();
 await expect(page.locator('.movies-media .movies-provider-frame')).toHaveCount(1);
 await expect(page.getByText('Playing in picture in picture')).toHaveCount(0);
});
