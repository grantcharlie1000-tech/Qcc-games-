import type {StudyArticle} from './articles';
import type {StudyTopic} from './topics';
import {studyAsset,topicImage} from './media';
import {renderFictionalAd,renderFictionalAdRail} from './fictional-ads';

const html=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const fallback={file:'reading-writing',alt:'An open notebook and reading materials on a desk',caption:'Generated illustration of a study workspace.'};
const photo=(topicId:string)=>topicImage(topicId)??fallback;
const games=()=>`<a href="${html(window.location.hash||'#/')}" data-study-return>Games</a>`;
const choices=()=>'<button class="variant-choices" data-reading-choices>Reading storage choices</button>';
const wordmark='<span class="variant-wordmark">Mauri Study Notes</span>';
const sourceList=(article:StudyArticle)=>`<section class="variant-sources"><h2>Further reading</h2><ul>${article.sources.map(([label,url])=>`<li><a href="${html(url)}" target="_blank" rel="noopener">${html(label)}</a></li>`).join('')}</ul></section>`;
const practice=(topic:StudyTopic)=>`<section class="variant-practice"><h2>Try it yourself</h2><p>${html(topic.example.question)}</p><ol>${topic.example.steps.map(step=>`<li>${html(step)}</li>`).join('')}</ol><p>${html(topic.example.result)}</p><details><summary>Check your understanding</summary><p>${html(topic.check.question)}</p><p>${html(topic.check.answer)}</p></details></section>`;
const textBody=(article:StudyArticle,topic:StudyTopic)=>`<div class="study-article-body variant-prose">${article.paragraphs.map((paragraph,index)=>`<p${index===0?' class="variant-lede"':''}>${html(paragraph)}</p>${index===1?renderFictionalAd(article.id,1,'landscape'):index===3?renderFictionalAd(article.id,2,'banner'):''}`).join('')}${practice(topic)}${renderFictionalAd(article.id,3,'landscape')}${sourceList(article)}<p class="study-games-sentence">Continue exploring ideas through ${games()} and practical exercises.</p></div>`;
const essayTextBody=(article:StudyArticle,topic:StudyTopic)=>{
  const ad=(slot:number,format:'landscape'|'banner',layout:'compact'|'wide')=>`<div class="essay-ad-${layout}">${renderFictionalAd(article.id,slot,format)}</div>`;
  const paragraphs=article.paragraphs.map((paragraph,index)=>`<p${index===0?' class="variant-lede"':''}>${html(paragraph)}</p>${index===1?ad(1,'landscape','compact'):index===3?ad(2,'banner','compact'):''}`).join('');
  return `<div class="study-article-body variant-prose">${paragraphs}${ad(1,'landscape','wide')}${practice(topic)}${renderFictionalAd(article.id,3,'landscape')}${sourceList(article)}${ad(2,'banner','wide')}<p class="study-games-sentence">Continue exploring ideas through ${games()} and practical exercises.</p></div>`;
};
const imageMarkup=(topicId:string,classname:string)=>{const image=photo(topicId);return `<figure class="${classname}"><img src="${studyAsset(`photos/${image.file}.webp`)}" alt="${html(image.alt)}" width="1280" height="853"><figcaption>${html(image.caption)}</figcaption></figure>`;};
const footer=(select:string)=>`<footer class="variant-footer">${select}<button class="variant-next" data-study-next>Next article</button>${choices()}<p>Original learning notes from Mauri Study Notes.</p></footer>`;

export function renderVariant(article:StudyArticle,topic:StudyTopic,select:string){
  const title=`<h1 id="study-title" tabindex="-1">${html(article.title)}</h1>`;
  const meta=`<span>${html(topic.subject)}</span><span>${Math.max(1,Math.ceil(article.paragraphs.join(' ').split(/\s+/).length/180))} min read</span>`;
  if(article.style==='quanta')return `<main class="study-variant variant-quanta" data-article-id="${html(article.id)}"><header class="variant-topbar">${wordmark}<nav aria-label="Reading navigation">${choices()}${games()}</nav></header><article><header class="quanta-heading"><p class="variant-kicker">${html(topic.subject)} · Study notes</p>${title}<p class="variant-deck">${html(article.deck)}</p></header>${imageMarkup(topic.id,'quanta-hero')}<div class="quanta-reading"><aside class="variant-rail"><strong>Mauri Study Notes</strong><p>Original educational reading</p><p>${meta}</p>${renderFictionalAdRail(article.id,0,3)}</aside>${textBody(article,topic)}<aside class="variant-rail variant-right-rail"><p>Explore the topic</p><p>${html(topic.subtitle)}</p>${renderFictionalAdRail(article.id,4,3)}</aside></div>${footer(select)}</article></main>`;
  if(article.style==='aeon')return `<main class="study-variant variant-aeon" data-article-id="${html(article.id)}"><article><div class="aeon-opening">${imageMarkup(topic.id,'aeon-hero')}<header class="variant-topbar">${wordmark}<nav aria-label="Reading navigation">${choices()}${games()}</nav></header><div class="aeon-heading"><p class="variant-kicker">${html(topic.subject)} · An essay</p>${title}<p class="variant-deck">${html(article.deck)}</p></div></div><div class="aeon-reading"><aside class="variant-rail"><strong>Mauri Study Notes</strong><p>Original educational reading for curious minds.</p><p>${meta}</p>${renderFictionalAdRail(article.id,0,3)}</aside>${textBody(article,topic)}</div>${footer(select)}</article></main>`;
  return `<main class="study-variant variant-essay" data-article-id="${html(article.id)}"><aside class="essay-nav"><span class="essay-brand">Mauri<br>Study Notes</span><nav aria-label="Reading navigation">${games()}${choices()}</nav></aside><article class="essay-article"><header>${title}<p class="essay-date">${html(topic.subject)} · Original study essay</p></header>${essayTextBody(article,topic)}${footer(select)}</article><aside class="essay-ad-rail" aria-label="Fictional advertisements">${renderFictionalAdRail(article.id,0,4)}</aside></main>`;
}
