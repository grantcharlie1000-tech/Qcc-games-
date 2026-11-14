import {test,expect} from '../fixtures';
import {handleMoviesCatalog} from '../../server/movies-catalog';

// Exercise the actual catalog rail definitions without a live TMDB credential.
const christmas={id:771,title:'Home Alone',release_date:'1990-11-16',genre_ids:[35,10751],overview:'Christmas fixture',poster_path:'/homealone.jpg'};
const ordinary={id:99,media_type:'movie',title:'Other movie',release_date:'2024-01-01',genre_ids:[28],overview:'Ordinary fixture',poster_path:'/other.jpg'};
for(const theme of ['off','christmas'])test(`Christmas rail stays available with seasonal artwork ${theme}`,async({page},testInfo)=>{
 await page.route('**/api/movie-popularity',route=>route.fulfill({json:{titleIds:[],windowDays:7}}));
 await page.route('**/api/movies?*',async route=>{
  const response=await handleMoviesCatalog(new Request(route.request().url()),'fixture',async input=>{
   const url=new URL(String(input));
   if(url.pathname.includes('/movie/771'))return Response.json(christmas);
   return Response.json({results:[url.searchParams.get('with_keywords')==='207317'?christmas:ordinary]});
  });
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
 });
 await page.goto(`/?festive=${theme}#/movies`);
 const rail=page.locator('[data-rail="christmas"]');
 await expect(rail.getByRole('heading',{name:'Christmas movies',exact:true})).toBeVisible();
 await expect(rail.locator('[data-title="movie-771"]')).toHaveAttribute('href','#/movies/movie-771');
 await rail.locator('[data-title="movie-771"]').click();
 await expect(page.locator('.movies-detail h1')).toHaveText('Home Alone');
 await page.goBack();
 await expect(rail).toBeVisible();
 await page.locator('.movies-top').getByRole('button',{name:'Movies',exact:true}).click();
 await expect(rail).toBeVisible();
 await page.screenshot({path:testInfo.outputPath(`christmas-${theme}.png`),fullPage:false});
 await page.locator('#movies-search').fill('Other');
 await expect(rail).toHaveCount(0);
 await page.locator('#movies-search').fill('');
 await expect(rail).toBeVisible();
 await page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true}).click();
 await expect(rail).toHaveCount(0);
});
