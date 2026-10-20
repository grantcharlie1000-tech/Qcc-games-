import {writeFile} from 'node:fs/promises';import {loadArt} from './load-art.mjs';import {coverSvg} from './cover.mjs';
const art=await loadArt();const kinds=Object.keys(art.SPECIES);
for(const kind of kinds)await writeFile('public/game-art/animal-stack/'+kind+'.svg',art.animalSvg(kind));
const cols=4,cellW=150,cellH=190;
const sheet=(species,title)=>{const rows=Math.ceil(species.length/cols),width=cols*cellW,height=rows*cellH+20;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><title>${title}</title><rect width="${width}" height="${height}" fill="#5ec8f2"/>${species.map((kind,i)=>{const x=cellW/2+(i%cols)*cellW,y=100+Math.floor(i/cols)*cellH;return `<g transform="translate(${x} ${y})">${art.animalMarkup(kind)}</g><text x="${x}" y="${y+82}" font-family="sans-serif" font-size="14" font-weight="700" fill="#153e51" text-anchor="middle">${art.SPECIES[kind].name}</text>`;}).join('')}</svg>`;};
await writeFile('public/game-art/animal-stack/species-sheet.svg',sheet(kinds,'Animal Stack toy cutouts at in-game relative scale'));
await writeFile('public/game-art/animal-stack/cover.svg',coverSvg(art.SPECIES));
console.log('wrote',kinds.length,'species');
