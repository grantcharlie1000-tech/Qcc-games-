/** Uniformly fit an existing game's logical layout without changing physics units. */
export function fitGameStage(stage:HTMLElement, available:HTMLElement):()=>void {
  const child=stage.firstElementChild;
  if(!(child instanceof HTMLElement))return ()=>{};
  const root:HTMLElement=child;
  let frame=0,disposed=false;
  stage.classList.add('viewport-fitted');

  function fit(){
    frame=0;if(disposed||!stage.isConnected)return;
    const width=available.clientWidth,height=available.clientHeight;
    if(!width||!height)return;
    const layoutWidth=Math.min(1080,width);
    if(stage.style.width!==`${layoutWidth}px`)stage.style.width=`${layoutWidth}px`;
    // offset/scroll dimensions are logical CSS pixels, independent of our transform.
    // The stage's old max-height would conceal overflowing controls, so measure root.
    const style=getComputedStyle(root);
    const topMargin=parseFloat(style.marginTop)||0,bottomMargin=parseFloat(style.marginBottom)||0;
    const naturalWidth=Math.max(root.offsetWidth,root.scrollWidth);
    const naturalHeight=Math.max(root.offsetHeight,root.scrollHeight)+topMargin+bottomMargin;
    if(!naturalWidth||!naturalHeight)return;
    const scale=Math.min(1,width/naturalWidth,height/naturalHeight);
    stage.style.height=`${naturalHeight}px`;
    stage.style.transform=`translate(-50%,-50%) scale(${scale})`;
    stage.dataset.viewportScale=String(scale);
  }
  function schedule(){if(!disposed&&!frame)frame=requestAnimationFrame(fit);}
  const observer=new ResizeObserver(schedule);
  observer.observe(available);observer.observe(root);
  fit();
  return ()=>{disposed=true;observer.disconnect();if(frame)cancelAnimationFrame(frame);};
}
