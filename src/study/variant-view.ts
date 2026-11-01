import type {StudyArticle} from './articles';
import type {StudyTopic} from './topics';
import {studyAsset,topicImage} from './media';

const html=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const games=()=>`<a href="${html(window.location.hash||'#/')}" data-study-return>Games</a>`;
const choices=()=>'<button class="variant-choices" data-reading-choices>Reading storage choices</button>';
const wordmark='<span class="variant-wordmark">Mauri Study Notes</span>';
const sourceList=(article:StudyArticle)=>`<section class="variant-sources"><h2>Further reading</h2><ul>${article.sources.map(([label,url])=>`<li><a href="${html(url)}" target="_blank" rel="noopener">${html(label)}</a></li>`).join('')}</ul></section>`;
const practice=(topic:StudyTopic)=>`<section class="variant-practice"><h2>Try it yourself</h2><p>${html(topic.example.question)}</p><ol>${topic.example.steps.map(step=>`<li>${html(step)}</li>`).join('')}</ol><p>${html(topic.example.result)}</p><details><summary>Check your understanding</summary><p>${html(topic.check.question)}</p><p>${html(topic.check.answer)}</p></details></section>`;

// Each pair of paragraphs develops a distinct part of the subject before practice.
const sectionHeadings:Record<string,readonly [string,string,string]>={
  'close-reading':['Start with the words','Test an interpretation','Build a supported reading'],
  'essay-writing':['Connect claim and evidence','Develop the argument','Revise for precision'],
  poetry:['Read across the line','Listen to the pattern','Support an interpretation'],
  'film-language':['Describe the shot','Connect image and sound','Explain the sequence'],
  'linear-relationships':['Rate and starting value','Compare the models','Check the rule'],
  quadratics:['Roots and turning points','Connect the representations','Interpret the solution'],
  trigonometry:['Choose the ratio','Set up the calculation','Check the result'],
  probability:['Define the possibilities','Follow the conditions','Interpret the probability'],
  forces:['Choose the object','Combine the forces','Explain the motion'],
  energy:['Define the system','Account for transfers','Interpret efficiency'],
  'acids-bases':['Separate strength and concentration','Use the particle model','Explain the observations'],
  inheritance:['From alleles to traits','Work through the cross','Interpret the proportions'],
  ecosystems:['Trace the relationships','Examine the evidence','Explain the wider effects'],
  'historical-evidence':['Ask what a source can show','Compare the evidence','Qualify the conclusion'],
  'te-tiriti':['Read the texts in context','Compare terms and meanings','Support the interpretation'],
  'wwi-causes':['Distinguish cause and trigger','Trace the decisions','Weigh the explanation'],
  'rivers-flooding':['Follow water through a catchment','Read the evidence','Evaluate the response'],
  'supply-demand':['Read price and quantity','Explain a shift','Check the prediction'],
  algorithms:['Define the rule','Trace the steps','Test the boundaries'],
  hauora:['Understand the dimensions','Connect experience and context','Evaluate support']
};
const textBody=(article:StudyArticle,topic:StudyTopic)=>{
  const headings=sectionHeadings[topic.id];
  const sections=headings.map((heading,index)=>`<section class="variant-text-section"><h2>${html(heading)}</h2>${article.paragraphs.slice(index*2,index===2?undefined:index*2+2).map(paragraph=>`<p>${html(paragraph)}</p>`).join('')}</section>`).join('');
  return `<div class="study-article-body variant-prose">${sections}${practice(topic)}${sourceList(article)}<p class="study-games-sentence">Continue exploring ideas through ${games()} and practical exercises.</p></div>`;
};
const imageMarkup=(topicId:string,classname:string)=>{
  const image=topicImage(topicId);
  return image?`<figure class="${classname}"><img src="${studyAsset(`photos/${image.file}.webp`)}" alt="${html(image.alt)}" width="1280" height="853"><figcaption>${html(image.caption)}</figcaption></figure>`:'';
};
const footer=(select:string)=>`<footer class="variant-footer">${select}<button class="variant-next" data-study-next>Next article</button>${choices()}</footer>`;

export function renderVariant(article:StudyArticle,topic:StudyTopic,select:string){
  const title=`<h1 id="study-title" tabindex="-1">${html(article.title)}</h1>`;
  const meta=`<p class="variant-meta">${html(topic.subject)} · ${Math.max(1,Math.ceil(article.paragraphs.join(' ').split(/\s+/).length/180))} min read</p>`;
  const topbar=`<header class="variant-topbar">${wordmark}<nav aria-label="Reading navigation">${choices()}${games()}</nav></header>`;
  if(article.style==='quanta')return `<main class="study-variant variant-quanta" data-article-id="${html(article.id)}">${topbar}<article aria-labelledby="study-title"><header class="quanta-heading">${meta}${title}<p class="variant-deck">${html(article.deck)}</p></header>${imageMarkup(topic.id,'quanta-hero')}<div class="quanta-reading">${textBody(article,topic)}</div>${footer(select)}</article></main>`;
  if(article.style==='aeon')return `<main class="study-variant variant-aeon" data-article-id="${html(article.id)}">${topbar}<article aria-labelledby="study-title"><header class="aeon-heading">${meta}${title}<p class="variant-deck">${html(article.deck)}</p></header>${imageMarkup(topic.id,'aeon-hero')}<div class="aeon-reading">${textBody(article,topic)}</div>${footer(select)}</article></main>`;
  return `<main class="study-variant variant-essay" data-article-id="${html(article.id)}">${topbar}<article class="essay-article" aria-labelledby="study-title"><header class="essay-heading">${meta}${title}<p class="variant-deck">${html(article.deck)}</p></header>${textBody(article,topic)}${footer(select)}</article></main>`;
}
