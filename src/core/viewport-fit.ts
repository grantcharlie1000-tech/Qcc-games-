/** Scale that makes a designed layout fill the stage on the tighter axis. Grows above 1 when the layout is smaller than the stage. */
export function fitScale(availableWidth:number, availableHeight:number, naturalWidth:number, naturalHeight:number):number {
  if(!availableWidth||!availableHeight||!naturalWidth||!naturalHeight)return 1;
  return Math.min(availableWidth/naturalWidth, availableHeight/naturalHeight);
}

/** Uniformly fit an existing game's logical layout without changing physics units. */
export function fitGameStage(stage:HTMLElement, available:HTMLElement):()=>void {
  const child=stage.firstElementChild;
  if(!(child instanceof HTMLElement))return ()=>{};
  const root:HTMLElement=child;
  let disposed=false;
  stage.classList.add('viewport-fitted');

  function fit(){
    if(disposed||!stage.isConnected)return;
    const width=available.clientWidth,height=available.clientHeight;
    if(!width||!height)return;
    // Lay out at the real stage width so full-width games stay sharp; smaller designed layouts scale up to fill.
    // Synchronous: a viewport change must settle before the next pointer sample, including under a paused test clock.
    const layoutWidth=width;
    if(stage.style.width!==`${layoutWidth}px`)stage.style.width=`${layoutWidth}px`;
    // offset/scroll dimensions are logical CSS pixels, independent of our transform.
    // The stage's old max-height would conceal overflowing controls, so measure root.
    const style=getComputedStyle(root);
    const topMargin=parseFloat(style.marginTop)||0,bottomMargin=parseFloat(style.marginBottom)||0;
    const naturalWidth=Math.max(root.offsetWidth,root.scrollWidth);
    const naturalHeight=Math.max(root.offsetHeight,root.scrollHeight)+topMargin+bottomMargin;
    const scale=fitScale(width,height,naturalWidth,naturalHeight);
    if(!naturalWidth||!naturalHeight)return;
    stage.style.height=`${naturalHeight}px`;
    stage.style.transform=`translate(-50%,-50%) scale(${scale})`;
    stage.dataset.viewportScale=String(scale);
  }
  const observer=new ResizeObserver(()=>{if(!disposed)fit();});
  observer.observe(available);observer.observe(root);
  // Play-surface updates the visual-viewport box on this same event, and it is registered first.
  window.addEventListener('resize',fit);
  fit();
  return ()=>{disposed=true;observer.disconnect();window.removeEventListener('resize',fit);};
}
