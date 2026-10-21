// Approved generated illustrations are served from the same origin and included
// in the offline study assets. Provenance is in study/image-provenance.json.
export const studyImagesReady=true;
export const studyAsset=(path:string)=>`${import.meta.env.BASE_URL}study/${path}`;
const images:Record<string,{file:string;alt:string;caption:string}>={
 'close-reading':{file:'reading-writing',alt:'An open notebook and reading materials on a desk',caption:'Generated illustration of a reading workspace; the passages in this chapter are original invented examples.'},
 'essay-writing':{file:'reading-writing',alt:'An open notebook and reading materials on a desk',caption:'Generated illustration of a writing workspace, not a record of an actual essay.'},
 poetry:{file:'reading-writing',alt:'An open notebook and reading materials on a desk',caption:'Generated illustration of a reading workspace; the poem examples are invented.'},
 'film-language':{file:'film-making',alt:'An unbranded camera and storyboard cards arranged on a desk',caption:'Generated illustration of film planning, not a frame from the invented scene discussed below.'},
 forces:{file:'forces-energy',alt:'A single pendulum bob hanging vertically from a stand',caption:'Generated illustration of a stationary pendulum setup; the numerical examples below are separate models.'},
 energy:{file:'forces-energy',alt:'A single pendulum bob hanging vertically from a stand',caption:'Generated illustration of a pendulum setup, not evidence of motion or a measured energy transfer.'},
 inheritance:{file:'seedlings-ecology',alt:'Young plants in a soil plot beside a magnifier and notebook',caption:'Generated illustration of plant observation. Appearance alone does not establish a plant’s genotype.'},
 ecosystems:{file:'field-measurement',alt:'A tape, clipboard and quadrat on grass beside a stream',caption:'Generated fieldwork illustration. No counts, measurements or sampling results can be inferred from this image.'},
 'rivers-flooding':{file:'river-catchment',alt:'A river and its surrounding landscape',caption:'Generated landscape illustration, not a known catchment or a record of flood conditions.'},
 'supply-demand':{file:'produce-market',alt:'Produce displayed at a market',caption:'Generated market illustration, not a record of prices, sales or a real business.'},
 hauora:{file:'community-wellbeing',alt:'Fictional adults walking together in a park, seen from behind',caption:'Generated illustration of fictional people in a park. It does not depict the person in the chapter’s scenario.'}
};
export const topicImage=(id:string)=>images[id];
