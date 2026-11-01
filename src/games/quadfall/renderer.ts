import {cells,ghost,COLUMNS,HIDDEN_ROWS,VISIBLE_ROWS,type State,type Piece} from './model';
import type {Settings} from '../../core/types';
const colors:Record<Piece,string>={I:'#53d9ed',O:'#ffd461',T:'#c88cff',S:'#71e8a4',Z:'#ff7e91',J:'#799dff',L:'#ffa35d'};
const marks:Record<Piece,string>={I:'━',O:'●',T:'▲',S:'/',Z:'\\',J:'◆',L:'■'};
export interface ClearEffect {board:State['board'];rows:number[];remaining:number;duration:number;reduced:boolean}
type Surface={canvas:HTMLCanvasElement;g:CanvasRenderingContext2D;width:number;height:number;dpr:number};

/** All layout reads live in ResizeObserver. Frames only paint cached dimensions. */
export function createRenderer(board:HTMLCanvasElement,held:HTMLCanvasElement,next:HTMLCanvasElement,settings:Readonly<Settings>,invalidate:()=>void){
 const surfaces=[board,held,next].map(canvas=>({canvas,g:canvas.getContext('2d')!,width:0,height:0,dpr:0}));
 function size(s:Surface){
  if(!s.width||!s.height)return;
  s.dpr=window.devicePixelRatio||1;
  s.canvas.width=Math.round(s.width*s.dpr);s.canvas.height=Math.round(s.height*s.dpr);
  s.g.setTransform(s.canvas.width/s.width,0,0,s.canvas.height/s.height,0,0);
 }
 const observer=new ResizeObserver(entries=>{
  for(const entry of entries){const surface=surfaces.find(s=>s.canvas===entry.target)!;surface.width=entry.contentRect.width;surface.height=entry.contentRect.height;size(surface);}
  invalidate();
 });
 surfaces.forEach(s=>observer.observe(s.canvas));
 const resize=()=>{for(const s of surfaces)if(s.dpr!==(window.devicePixelRatio||1))size(s);invalidate();};
 window.addEventListener('resize',resize);
 function block(g:CanvasRenderingContext2D,x:number,y:number,unit:number,id:Piece,outline=false){
  const gap=Math.max(.8,unit*.045),side=unit-gap*2;
  g.fillStyle=colors[id];g.beginPath();g.roundRect(x+gap,y+gap,side,side,Math.max(1,unit*.1));
  if(outline){g.globalAlpha=.13;g.fill();g.globalAlpha=.65;g.strokeStyle=colors[id];g.lineWidth=Math.max(1,unit*.04);g.stroke();}
  else{g.globalAlpha=1;g.fill();g.fillStyle='#ffffff40';g.fillRect(x+gap+unit*.12,y+gap+1,side-unit*.24,Math.max(1,unit*.055));
   if(settings.colorBlind){g.fillStyle='#101631';g.font=`bold ${Math.max(8,unit*.43)}px system-ui`;g.textAlign='center';g.textBaseline='middle';g.fillText(marks[id],x+unit/2,y+unit*.55);}
  }
  g.globalAlpha=1;
 }
 function mini(s:Surface,ids:Piece[]){
  const {g,width:w,height:h}=s;if(!w||!h)return;g.clearRect(0,0,w,h);
  const slot=w/Math.max(1,ids.length),unit=Math.min((slot-4)/4,(h-4)/2);
  ids.forEach((id,i)=>{
   const shape=cells({id,x:0,y:0,r:0}),xs=shape.map(p=>p[0]),ys=shape.map(p=>p[1]);
   const minX=Math.min(...xs),minY=Math.min(...ys),width=Math.max(...xs)-minX+1,height=Math.max(...ys)-minY+1;
   for(const [x,y] of shape)block(g,i*slot+(slot-width*unit)/2+(x-minX)*unit,(h-height*unit)/2+(y-minY)*unit,unit,id);
  });
 }
 return {
  cellSize:()=>surfaces[0].width/COLUMNS,
  draw(state:State,effect:ClearEffect|null){
   const {g,width:w,height:h}=surfaces[0];if(!w||!h)return;
   const unit=w/COLUMNS;g.fillStyle='#10191f';g.fillRect(0,0,w,h);
   g.strokeStyle='#ffffff09';g.lineWidth=1;g.beginPath();
   for(let x=1;x<COLUMNS;x++){g.moveTo(x*unit,0);g.lineTo(x*unit,h);}
   for(let y=1;y<VISIBLE_ROWS;y++){g.moveTo(0,y*unit);g.lineTo(w,y*unit);}g.stroke();
   const progress=effect?1-effect.remaining/effect.duration:0;
   const collapse=effect&&!effect.reduced?Math.max(0,(progress-.55)/.45):0;
   (effect?.board??state.board).forEach((row,y)=>row.forEach((id,x)=>{
    if(!id||y<HIDDEN_ROWS)return;
    if(effect?.rows.includes(y)){
     g.save();g.globalAlpha=1-progress;
     // Canvas transform is paint-only: collapse each cleared row around its centre.
     g.translate(0,(y-HIDDEN_ROWS+.5)*unit);g.scale(1,1-collapse);block(g,x*unit,-unit/2,unit,id);g.restore();
    }else{
     const fallen=effect?effect.rows.filter(r=>r>y).length*collapse:0;
     block(g,x*unit,(y-HIDDEN_ROWS+fallen)*unit,unit,id);
    }
   }));
   if(effect){
    g.fillStyle=`rgba(255,255,255,${(effect.reduced?.16:.55)*(1-progress)})`;
    for(const y of effect.rows)if(y>=HIDDEN_ROWS)g.fillRect(0,(y-HIDDEN_ROWS)*unit,w,unit*(1-collapse));
   }else if(state.phase!=='lost'){
    for(const [x,y] of cells({...state.active,y:ghost(state)}))if(y>=HIDDEN_ROWS)block(g,x*unit,(y-HIDDEN_ROWS)*unit,unit,state.active.id,true);
    for(const [x,y] of cells(state.active))if(y>=HIDDEN_ROWS)block(g,x*unit,(y-HIDDEN_ROWS)*unit,unit,state.active.id);
   }
   mini(surfaces[1],state.held?[state.held]:[]);mini(surfaces[2],state.queue.slice(0,2));
  },
  dispose(){observer.disconnect();window.removeEventListener('resize',resize);}
 };
}
