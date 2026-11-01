// Local illustrations and their generation provenance are recorded in
// public/study/image-provenance.json and included in the offline study assets.
export const studyImagesReady=true;
export const studyAsset=(path:string)=>`${import.meta.env.BASE_URL}study/${path}`;
const images:Record<string,{file:string;alt:string;caption:string}>={
 'close-reading':{file:'reading-writing',alt:'An open notebook and reading materials on a desk',caption:'Close reading starts with the details of a passage.'},
 'essay-writing':{file:'reading-writing',alt:'An open notebook and reading materials on a desk',caption:'Notes and quotations help connect a claim with its evidence.'},
 poetry:{file:'reading-writing',alt:'An open notebook and reading materials on a desk',caption:'Reading aloud and annotating can reveal patterns in a poem.'},
 'film-language':{file:'film-making',alt:'A camera and storyboard cards arranged on a desk',caption:'Storyboards connect framing and sequence before filming.'},
 forces:{file:'forces-energy',alt:'A single pendulum bob hanging vertically from a stand',caption:'At rest, weight and tension balance on a pendulum bob.'},
 energy:{file:'forces-energy',alt:'A single pendulum bob hanging vertically from a stand',caption:'A pendulum provides a way to trace transfers between gravitational and kinetic energy.'},
 inheritance:{file:'seedlings-ecology',alt:'Young plants in a soil plot beside a magnifier and notebook',caption:'Plant traits reflect inheritance and growing conditions.'},
 ecosystems:{file:'field-measurement',alt:'A tape, clipboard and quadrat on grass beside a stream',caption:'Quadrats help organise observations of a habitat.'},
 'rivers-flooding':{file:'river-catchment',alt:'A river and its surrounding landscape',caption:'A catchment connects the river with the land that drains into it.'},
 'supply-demand':{file:'produce-market',alt:'Produce displayed at a market',caption:'Supply and demand describe how buyers and sellers respond to prices.'},
 hauora:{file:'community-wellbeing',alt:'Adults walking together in a park, seen from behind',caption:'Shared activities can connect physical wellbeing with relationships and belonging.'}
};
export const topicImage=(id:string)=>images[id];
