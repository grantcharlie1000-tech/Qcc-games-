// Approved generated illustrations are served from the same origin and included
// in the offline study assets. Provenance is in study/image-provenance.json.
export const studyImagesReady=true;
export const studyAsset=(path:string)=>`${import.meta.env.BASE_URL}study/${path}`;
const images:Record<string,{file:string;alt:string;caption:string}>={
 'close-reading':{file:'reading-writing',alt:'An open notebook and reading materials on a desk',caption:'A reading workspace with a notebook and source material.'},
 'essay-writing':{file:'reading-writing',alt:'An open notebook and reading materials on a desk',caption:'A writing workspace arranged for planning and revision.'},
 poetry:{file:'reading-writing',alt:'An open notebook and reading materials on a desk',caption:'Reading materials arranged for close analysis.'},
 'film-language':{file:'film-making',alt:'An unbranded camera and storyboard cards arranged on a desk',caption:'A camera and storyboard cards used for planning a film sequence.'},
 forces:{file:'forces-energy',alt:'A single pendulum bob hanging vertically from a stand',caption:'A pendulum bob hangs from a stand.'},
 energy:{file:'forces-energy',alt:'A single pendulum bob hanging vertically from a stand',caption:'A pendulum setup for exploring energy transfer.'},
 inheritance:{file:'seedlings-ecology',alt:'Young plants in a soil plot beside a magnifier and notebook',caption:'Young plants in a soil plot beside a magnifier and notebook.'},
 ecosystems:{file:'field-measurement',alt:'A tape, clipboard and quadrat on grass beside a stream',caption:'A quadrat, tape and clipboard arranged for field sampling.'},
 'rivers-flooding':{file:'river-catchment',alt:'A river and its surrounding landscape',caption:'A river within its surrounding landscape.'},
 'supply-demand':{file:'produce-market',alt:'Produce displayed at a market',caption:'Produce displayed at a market.'},
 hauora:{file:'community-wellbeing',alt:'adults walking together in a park, seen from behind',caption:'A group walks together through a park.'}
};
export const topicImage=(id:string)=>images[id];
