import {expect,type Locator} from '@playwright/test';

export async function expectCleanStudy(view:Locator){
  // Include closed explanations, image descriptions and accessible control names.
  const text=await view.evaluate(root=>root.textContent+' '+[...root.querySelectorAll('[aria-label],img')].map(el=>[el.getAttribute('aria-label'),el.getAttribute('alt')].join(' ')).join(' '));
  expect(text).not.toMatch(/\b(?:fictional|demo|advertisement|sponsor|sponsored)\b|Ari Rowan|Mina Vale|Leo Finch|Nell Moss|generated (?:illustration|portrait|landscape|market|fieldwork)/i);
  const labels=await view.locator('h1,h2,h3,figcaption,label,[aria-label],button,summary,img').evaluateAll(elements=>elements.map(el=>[el.textContent,el.getAttribute('aria-label'),el.getAttribute('alt')].filter(Boolean).join(' ')));
  expect(labels.join(' ')).not.toMatch(/\b(?:fictional|demo|example|advertisement|sponsor|sponsored|ad)\b/i);
  await expect(view.locator('.fictional-ad,.study-ad-rail,.study-inline-ad,.study-ad-placeholder,.essay-ad-rail,[data-ad-rail],.study-byline,.study-author-name,.byline,[rel=author],[itemprop=author],[class*="sponsor"],[data-sponsor],iframe')).toHaveCount(0);
}
