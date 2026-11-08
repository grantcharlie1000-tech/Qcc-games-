import './library-strip.css';

const AFTER_CARDS=12;

/**
 * The games-library row where the election strip used to sit. It opens Predictions.
 * It does not show prices or made-up questions; the Predictions page reads the server.
 */
export function mountPredictionsStrip(grid:Element):void{
  if(import.meta.env.VITE_QCC_PREDICTIONS==='off')return;
  const link=document.createElement('a');
  link.className='predictions-banner';
  link.href='#/predictions';
  link.setAttribute('aria-label','Predictions. Free credits with no cash value. Open questions.');
  link.innerHTML=`<span class="pb-badge">Free credits</span><span class="pb-title">Predictions</span><span class="pb-go" aria-hidden="true">›</span>`;
  const cards=grid.querySelectorAll(':scope > .game-card');
  if(cards.length>AFTER_CARDS)cards[AFTER_CARDS-1].after(link);else grid.append(link);
}
