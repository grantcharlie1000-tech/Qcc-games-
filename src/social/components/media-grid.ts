import {appIcon} from '../../apps/icons';
import {mediaUrl} from '../../media/client';
import type {MediaRef} from '../shared';

/** DESIGN 5.4 media grid. Tiles open the viewer; images are thumbs, lazy and decoded off-thread. */
export function mediaGrid(media:MediaRef[],open:(index:number,tile:HTMLElement)=>void):HTMLElement {
 const grid=document.createElement('div');
 grid.className='social-media';grid.dataset.count=String(media.length);
 if(media.length===1){
  const m=media[0]!,ratio=m.width>0&&m.height>0?m.width/m.height:1.5;
  grid.style.aspectRatio=String(Math.min(1.78,Math.max(0.8,ratio)));
 }
 media.forEach((m,index)=>{
  const tile=document.createElement('button');
  tile.type='button';tile.className='social-media-tile';tile.setAttribute('aria-label',`Open photo ${index+1} of ${media.length}`);
  const fallback=()=>{tile.replaceChildren();tile.insertAdjacentHTML('afterbegin',appIcon('photo'));tile.classList.add('is-missing');};
  const img=document.createElement('img');
  img.alt='';img.loading='lazy';img.decoding='async';img.src=mediaUrl(m.id,m.thumb?'thumb':'full');
  img.addEventListener('error',fallback,{once:true});
  tile.append(img);
  tile.addEventListener('click',event=>{event.stopPropagation();open(index,tile);});
  grid.append(tile);
 });
 return grid;
}
