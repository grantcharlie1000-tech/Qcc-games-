import {posterFiles,posterUrl} from './artwork';
export function moviesCard():string {
 const titles=Object.keys(posterFiles);
 return `<a class="movies-launch" href="#/movies" aria-label="Movies &amp; TV"><span class="movies-poster-wall movies-miniatures" aria-hidden="true">${(navigator.onLine===false?[]:titles).map(id=>`<span class="movies-mini-poster"><img src="${posterUrl(id,'w185')}" alt="" width="185" height="278" draggable="false" referrerpolicy="no-referrer"></span>`).join('')}</span><h2>Movies &amp; TV</h2></a>`;
}
