/**
 * The seasonal theme switch. Christmas is the default; `qcc:festive=off` in
 * localStorage (or `?festive=off` in the URL, for screenshots) restores the
 * original artwork. The value lives outside the `pocket-arcade:v1:` namespace,
 * so it is never synced, never part of a save and never touches scores.
 *
 * Games read `christmas()` when they draw or mount. CSS overrides are scoped
 * under `:root[data-festive="christmas"]`, so turning the theme off removes
 * every one of them at once.
 */
export type FestiveTheme='christmas'|'off';
export const FESTIVE_KEY='qcc:festive';

export function storedFestiveTheme():FestiveTheme{
  try{
    // A URL parameter wins for that visit only (used for screenshots); it does not change the stored choice.
    const param=new URLSearchParams(location.search).get('festive');
    if(param==='off'||param==='christmas')return param;
    if(localStorage.getItem(FESTIVE_KEY)==='off')return 'off';
  }catch{/* blocked storage keeps the default */}
  return 'christmas';
}

export function applyFestiveTheme(theme:FestiveTheme=storedFestiveTheme()):void{
  document.documentElement.dataset.festive=theme;
}

export function setFestiveTheme(theme:FestiveTheme):void{
  try{
    if(theme==='off')localStorage.setItem(FESTIVE_KEY,'off');
    else localStorage.removeItem(FESTIVE_KEY);
  }catch{/* the choice still applies for this visit */}
  applyFestiveTheme(theme);
}

/** True while the Christmas theme is showing. Safe outside a browser (tests). */
export function christmas():boolean{
  return typeof document!=='undefined'&&document?.documentElement?.dataset?.festive==='christmas';
}
