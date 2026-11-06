/**
 * The simulated tracker shown once Santa has left. Loaded lazily by SantaView.
 *
 * Layout: a status card (where Santa is, the next stop and its estimated arrival in the
 * visitor's time), a map from a `TrackerRenderer`, and the list of stops. The renderer is
 * the seam for the planned 3D globe: a GlobeRenderer (globe.gl is already a dependency,
 * used by Globle) can implement the same interface and replace FlatMapRenderer, with the
 * flat map kept as the fallback for low-end devices and no-WebGL school computers.
 */
import {positionAt,arrivalMs,ROUTE,type Stop,type TrackerState} from './route';
import {localClock} from '../format';

export interface TrackerRenderer {
  /** Draws the whole route once. */
  mount(container:HTMLElement,route:readonly Stop[]):void;
  /** Moves the sleigh and the travelled line. Called once a second. */
  update(state:TrackerState):void;
  dispose():void;
}

const W=720,H=360;
const project=(lat:number,lon:number)=>[(lon+180)/360*W,(90-lat)/180*H] as const;

/** A lightweight equirectangular SVG map: one path for the route, one for the travelled part, one sleigh. */
export class FlatMapRenderer implements TrackerRenderer {
  private svg:SVGSVGElement|undefined;
  private route:readonly Stop[]=[];
  mount(container:HTMLElement,route:readonly Stop[]):void{
    this.route=route;
    const grid:string[]=[];
    for(let lon=-150;lon<=150;lon+=30){const [x]=project(0,lon);grid.push(`M${x} 0V${H}`);}
    for(let lat=-60;lat<=60;lat+=30){const [,y]=project(lat,0);grid.push(`M0 ${y}H${W}`);}
    // The two North Pole ends sit off the top edge, so the map shows the stops, not the polar legs.
    const dots=route.slice(1,-1).map(stop=>{const [x,y]=project(stop.lat,stop.lon);return `<circle class="trk-stop" data-id="${stop.id}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2"/>`;}).join('');
    container.innerHTML=`<svg class="trk-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of Santa’s simulated route">
      <rect width="${W}" height="${H}" rx="18" class="trk-ocean"/>
      <path d="${grid.join('')}" class="trk-grid"/>
      <path class="trk-travelled" d=""/>
      ${dots}
      <g class="trk-sleigh"><circle r="11" class="trk-sleigh-glow"/><circle r="5.5" class="trk-sleigh-dot"/></g>
    </svg>`;
    this.svg=container.querySelector('svg')!;
  }
  update(state:TrackerState):void{
    if(!this.svg)return;
    const [x,y]=project(Math.min(state.lat,84),state.lon);
    this.svg.querySelector('.trk-sleigh')!.setAttribute('transform',`translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    // Travelled line through visited stops; a new segment starts where it would wrap round the date line.
    const points=[...this.route.slice(1,Math.min(this.route.length-1,Math.max(1,state.visited+1))),...(state.visited>=1&&!state.landed?[{lat:state.lat,lon:state.lon}]:[])];
    let d='',prev:number|undefined;
    for(const p of points){const [px,py]=project(p.lat,p.lon);d+=`${prev===undefined||Math.abs(px-prev)>W/2?'M':'L'}${px.toFixed(1)} ${py.toFixed(1)}`;prev=px;}
    this.svg.querySelector('.trk-travelled')!.setAttribute('d',d);
    for(const dot of this.svg.querySelectorAll<SVGCircleElement>('.trk-stop')){
      const index=this.route.findIndex(stop=>stop.id===dot.dataset.id);
      dot.classList.toggle('is-visited',index<=state.visited);
    }
  }
  dispose():void{this.svg?.remove();this.svg=undefined;}
}

export class TrackerPanel {
  private renderer:TrackerRenderer;
  private lastVisited=-2;
  private lastDeparture=NaN;
  constructor(private root:HTMLElement,private deps:{reducedMotion:()=>boolean}){
    root.innerHTML=`<section class="trk" aria-labelledby="trk-title">
      <h2 id="trk-title" class="sr-only">Santa’s simulated flight</h2>
      <div class="trk-status" role="status" aria-live="polite" aria-atomic="true"><p class="trk-now"></p><p class="trk-next"></p></div>
      <div class="trk-progress" aria-hidden="true"><span></span></div>
      <div class="trk-map-wrap"></div>
      <p class="trk-note">Simulated route by QCC, based on the pattern of past Christmas Eve flights. Times are estimates in your time zone, not live tracking.</p>
      <ol class="trk-stops"></ol>
    </section>`;
    this.renderer=new FlatMapRenderer();
    this.renderer.mount(root.querySelector('.trk-map-wrap')!,ROUTE);
    root.querySelector('.trk')!.classList.toggle('trk-still',deps.reducedMotion());
  }
  update(nowMs:number,departureMs:number):void{
    const state=positionAt(nowMs,departureMs);
    this.renderer.update(state);
    (this.root.querySelector('.trk-progress span') as HTMLElement).style.transform=`scaleX(${state.progress.toFixed(4)})`;
    if(state.visited===this.lastVisited&&departureMs===this.lastDeparture)return;
    // Status text changes only at each stop, so the live region speaks once per city.
    this.lastVisited=state.visited;this.lastDeparture=departureMs;
    const here=ROUTE[Math.max(0,state.visited)];
    const home=!state.next;
    this.root.querySelector('.trk-now')!.textContent=home
      ?'Santa has finished his simulated round and is back at the North Pole. Merry Christmas!'
      :state.visited<=0?'Santa has left the North Pole and is heading for the first stop.'
      :`Santa has just visited ${here.name}, ${here.country}.`;
    this.root.querySelector('.trk-next')!.textContent=home||!state.next?'':`Next stop: ${state.next.name}${state.next.id==='north-pole-return'?'':`, ${state.next.country}`}, estimated ${localClock(state.nextAtMs!)} your time.`;
    this.root.querySelector('.trk-stops')!.innerHTML=ROUTE.slice(1).map((stop,i)=>{
      const done=i+1<=state.visited;
      return `<li class="${done?'is-visited':''}${state.next?.id===stop.id?' is-next':''}"><span>${stop.name}</span><span class="trk-country">${stop.id==='north-pole-return'?'Home':stop.country}</span><time datetime="${new Date(arrivalMs(stop,departureMs)).toISOString()}">${localClock(arrivalMs(stop,departureMs))}</time></li>`;
    }).join('');
  }
  dispose():void{this.renderer.dispose();this.root.replaceChildren();}
}
