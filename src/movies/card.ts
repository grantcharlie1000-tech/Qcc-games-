import {posterUrl} from './artwork';
export function moviesCard():string {
 const titles=[['movie-157336','Interstellar'],['movie-438631','Dune'],['movie-329865','Arrival'],['movie-129','Spirited Away'],['tv-19885','Sherlock']];
 return `<a class="movies-launch" href="#/movies" aria-label="Explore Movies and TV"><span class="movies-launch-copy"><span class="movies-eyebrow">A LITTLE ESCAPE, A BIGGER SCREEN</span><strong>Movies <span>&amp;</span> TV</strong><span>Find your next great story.</span><span class="movies-launch-cta">Explore the collection <span aria-hidden="true">↗</span></span></span><span class="movies-miniatures" aria-hidden="true">${titles.map(([id,name])=>`<span class="movies-mini-poster"><img src="${posterUrl(id,'w185')}" alt="" width="100" height="150" loading="lazy" referrerpolicy="no-referrer"><span>${name}</span></span>`).join('')}</span></a>`;
}
