import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),source=new URL('docs/art/last-light/reference-quarter.png',root);
const target=new URL('public/game-art/last-light/textures/',root);await mkdir(target,{recursive:true});
// Sample the deliberately authored material swatches, rather than photograph-like
// crops of a scene. Resample once onto the native 32px grid and limit each ramp.
const swatches=[['limestone',17,714,86,99],['slate',114,714,89,99],['brick',212,714,88,99],['moss',17,834,87,99],['ivy',114,834,88,99],['copper',1245,714,83,99],['patina',1339,714,85,99],['verdigris',1435,714,85,99]];
const tiles=[];
for(const [name,left,top,width,height] of swatches){const data=await sharp(source.pathname).extract({left,top,width,height}).resize(32,32,{kernel:'nearest'}).png({palette:true,colours:24,dither:0}).toBuffer();await sharp(data).toFile(new URL(`${name}.png`,target).pathname);tiles.push({input:data,left:tiles.length%4*32,top:Math.floor(tiles.length/4)*32});}
await sharp({create:{width:128,height:64,channels:4,background:'#142330'}}).composite(tiles).png({palette:true,colours:128,dither:0}).toFile(new URL('materials.png',target).pathname);
// The middle of the concept is distant city, separated from gameplay. Its warm
// windows guide value/lighting without importing false foreground landing edges.
await sharp(source.pathname).extract({left:580,top:115,width:520,height:475}).resize(260,238,{kernel:'nearest'}).png({palette:true,colours:48,dither:0}).toFile(new URL('quarter-vista.png',target).pathname);
const districtSource=new URL('docs/art/last-light/reference-districts.png',root);
const panels=[];
for(let i=0;i<4;i++){
 const data=await sharp(districtSource.pathname).extract({left:(i%2)*887,top:Math.floor(i/2)*443+78,width:887,height:365}).resize(384,158,{kernel:'nearest'}).png({palette:true,colours:48,dither:0}).toBuffer();
 panels.push({input:data,left:i%2*384,top:Math.floor(i/2)*158});
}
await sharp({create:{width:768,height:316,channels:4,background:'#142330'}}).composite(panels).png({palette:true,colours:192,dither:0}).toFile(new URL('districts.png',target).pathname);
