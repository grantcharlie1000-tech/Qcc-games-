/** Display only: scoring, saves and accessible values keep the exact mass. */
export function compactMass(value:number){
  const whole=Math.floor(value);if(whole<10000)return String(whole);
  const units=['k','M','B','T','Q'];let index=0,scaled=whole/1000;
  while(scaled>=999.5&&index<units.length-1){scaled/=1000;index++;}
  return `${Number(scaled.toFixed(scaled<10?1:0))}${units[index]}`;
}
/** Keep the arena-owned ranking beside the existing shared controls. The dock
 * itself is never replaced, positioned or skinned by this adapter. */
export function mountDockRanking(root:HTMLElement,container:HTMLElement,panel:HTMLElement){
  const dock=container.closest('.game-view')?.querySelector<HTMLElement>('.game-dock');
  const hud=dock?.querySelector<HTMLElement>('.game-hud');
  const before={min:hud?.style.minWidth??'',padding:hud?.style.paddingInline??'',shrink:hud?.style.flexShrink??''};
  // The existing Mass label/value needs 48px; its typography and glass stay shared.
  if(hud){hud.style.minWidth='48px';hud.style.paddingInline='8px';hud.style.flexShrink='0';}
  let mass=30;
  const syncMass=()=>{const value=hud?.querySelector('strong');if(value){const text=compactMass(mass);if(value.textContent!==text)value.textContent=text;value.classList.add('nc-dock-mass');value.setAttribute('aria-label',String(Math.floor(mass)));value.title=String(Math.floor(mass));}};
  const mirror=new MutationObserver(syncMass);if(hud)mirror.observe(hud,{childList:true,subtree:true,characterData:true});
  const space=document.createElement('span');space.className='nc-ranking-space';space.setAttribute('aria-hidden','true');
  function fit(){
    const bounds=root.getBoundingClientRect();
    panel.style.removeProperty('width');panel.style.removeProperty('right');panel.style.removeProperty('margin-inline-end');
    const style=getComputedStyle(panel),desired=parseFloat(style.width)||188,right=parseFloat(style.right)||12;
    if(dock&&bounds.width<700){
      if(panel.parentElement!==dock)dock.append(space,panel);
      const controls=[...dock.querySelectorAll<HTMLElement>(':scope > .game-glass')];
      const layout=getComputedStyle(dock),gap=parseFloat(layout.columnGap)||0;
      const padding=(parseFloat(layout.paddingLeft)||0)+(parseFloat(layout.paddingRight)||0);
      const safeRight=Math.max(0,right-(bounds.right-dock.getBoundingClientRect().right+(parseFloat(layout.paddingRight)||0)));
      const available=dock.clientWidth-padding-controls.reduce((sum,e)=>sum+e.getBoundingClientRect().width,0)-gap*4-safeRight;
      panel.dataset.dockSlot='true';panel.style.width=`${Math.max(0,Math.min(desired,available))}px`;
      panel.toggleAttribute('data-compact',available<124);
      panel.style.marginInlineEnd=`${safeRight}px`;panel.style.right='0';panel.style.top='0';
    }else{
      if(panel.parentElement!==root)root.append(panel);space.remove();delete panel.dataset.dockSlot;panel.removeAttribute('data-compact');
      // The full-width wrapper has no paint. Align with its actual controls.
      const controls=dock?.querySelector<HTMLElement>('.game-glass');
      panel.style.top=`${Math.max(16,controls?controls.getBoundingClientRect().top-bounds.top:16)}px`;
    }
  }
  return{fit,hud,setMass(value:number){mass=value;syncMass();},dispose(){mirror.disconnect();space.remove();if(panel.parentElement!==root)root.append(panel);if(hud){hud.style.minWidth=before.min;hud.style.paddingInline=before.padding;hud.style.flexShrink=before.shrink;hud.querySelector('.nc-dock-mass')?.classList.remove('nc-dock-mass');}}};
}
