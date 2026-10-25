// Decorative posters are bundled with the shell, so the offline games card never needs movie fetches.
const posters=Object.values(import.meta.glob('./card-art/*.svg',{query:'?raw',import:'default',eager:true})) as string[];
export function moviesCard():string {
 return `<a class="movies-launch" href="#/movies" aria-label="Explore Movies and TV"><span class="movies-launch-copy"><span class="movies-eyebrow">A LITTLE ESCAPE, A BIGGER SCREEN</span><strong>Movies <span>&amp;</span> TV</strong><span>Find your next great story.</span><span class="movies-launch-cta">Explore the collection <span aria-hidden="true">↗</span></span></span><span class="movies-miniatures" aria-hidden="true">${posters.map(svg=>`<span class="movies-mini-poster">${svg}</span>`).join('')}</span></a>`;
}
