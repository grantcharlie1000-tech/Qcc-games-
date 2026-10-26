import {posterFiles,posterUrl} from './artwork';
export function moviesCard():string {
 const titles=Object.keys(posterFiles);
 const wall=[...titles,...titles.slice(3),...titles.slice(0,3)];
 return `<a class="movies-launch" href="#/movies" aria-label="Movies &amp; TV"><span class="movies-poster-wall" aria-hidden="true">${(navigator.onLine===false?[]:wall).map(id=>`<img src="${posterUrl(id,'w185')}" alt="" width="185" height="278" draggable="false" referrerpolicy="no-referrer">`).join('')}</span><h2>Movies &amp; TV</h2></a>`;
}
