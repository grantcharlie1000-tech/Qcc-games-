// Hide-on-scroll for the phone tab bar. nextTabbarState is the rule the unit tests cover. autoHideTabbar reads
// the scroll position and sets data-hidden on the bar, which theme.css turns into a slide, or a fade under reduced motion.
export interface TabbarScroll{hidden:boolean;lastY:number;travel:number}
// px of travel in one direction before the bar changes state.
export const TABBAR_THRESHOLD=12;
// px from the top or the end of the page where the bar always shows.
export const TABBAR_EDGE=24;

export function nextTabbarState(state:TabbarScroll,y:number,max:number):TabbarScroll{
  const limit=Math.max(0,max);
  // Rubber-band overscroll is ignored: the position is clamped to the page.
  const at=Math.min(Math.max(y,0),limit);
  if(limit<=2*TABBAR_EDGE||at<=TABBAR_EDGE||at>=limit-TABBAR_EDGE)return {hidden:false,lastY:at,travel:0};
  const delta=at-state.lastY;
  // Travel counts in one direction. A reversal starts the count again, so jitter never adds up to a toggle.
  const sameWay=state.travel===0||Math.sign(delta)===Math.sign(state.travel);
  const travel=sameWay?state.travel+delta:delta;
  let hidden=state.hidden;
  if(travel>=TABBAR_THRESHOLD)hidden=true;
  else if(travel<=-TABBAR_THRESHOLD)hidden=false;
  return {hidden,lastY:at,travel};
}

function position(scroller:Window|HTMLElement):{y:number;max:number}{
  if(scroller instanceof HTMLElement)return {y:scroller.scrollTop,max:scroller.scrollHeight-scroller.clientHeight};
  return {y:scroller.scrollY,max:scroller.document.documentElement.scrollHeight-scroller.innerHeight};
}

// One passive scroll listener per scroller, with at most one frame of work pending. Returns reset(), which shows
// the bar and counts travel from the current position, and dispose(), which removes the listener.
export function autoHideTabbar(bar:HTMLElement,scroller:Window|HTMLElement):{reset():void;dispose():void}{
  const target:EventTarget=scroller;
  let state:TabbarScroll={hidden:false,lastY:position(scroller).y,travel:0};
  let frame=0;
  // Writes the attribute only when the state changes.
  const apply=(hidden:boolean)=>{
    if(bar.hasAttribute('data-hidden')===hidden)return;
    if(hidden)bar.setAttribute('data-hidden','true');
    else bar.removeAttribute('data-hidden');
  };
  const sync=()=>{
    frame=0;
    const {y,max}=position(scroller);
    state=nextTabbarState(state,y,max);
    apply(state.hidden);
  };
  // Scrolling and resizing both re-check the position. A resize can shorten the scrollable range with no scroll event.
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(sync);};
  target.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  return{
    reset(){
      if(frame)cancelAnimationFrame(frame);
      frame=0;
      state={hidden:false,lastY:position(scroller).y,travel:0};
      apply(false);
    },
    dispose(){
      target.removeEventListener('scroll',schedule);
      window.removeEventListener('resize',schedule);
      if(frame)cancelAnimationFrame(frame);
      frame=0;
      apply(false);
    }
  };
}
