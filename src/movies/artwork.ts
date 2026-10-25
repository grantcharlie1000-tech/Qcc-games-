// Real title artwork from TMDB's image CDN. No generated substitutes.
export const TMDB_IMAGE_ORIGIN='https://image.tmdb.org';
export const posterFiles:Record<string,string>={
 'movie-157336':'gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
 'movie-438631':'d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
 'movie-329865':'x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg',
 'movie-129':'39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
 'movie-120467':'eWdyYQreja6JGCzqHWXpWHDrrPo.jpg',
 'movie-286217':'sGz80DpcdpYWl5aKM0wIA2C90rc.jpg',
 'tv-19885':'7WTsnHkbA0FaG6R9twfFde0I9hl.jpg',
 'tv-68595':'5maYKYzWpE68ycxGh1luu4P2LOS.jpg'
};
export const posterUrl=(id:string,width='w500')=>`${TMDB_IMAGE_ORIGIN}/t/p/${width}/${posterFiles[id]}`;
