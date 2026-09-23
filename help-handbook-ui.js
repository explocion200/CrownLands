(function (global) {
  "use strict";
  function mount(host, options = {}) {
    const chapters=global.CrownlandsHelpContent;
    if(!host || !chapters)return;
    host.innerHTML=`<div class="handbook">
<header class="window-header"><img src="assets/optimized/item-royal-tax-decree-384x384-86d99a278ab1.webp" alt=""><div><p>The kingdom handbook</p><h1 id="helpTitle">Help & first steps</h1></div><span class="header-note">A guide to your realm</span><button id="closeHelp" class="close" aria-label="Close Help" type="button">×</button></header>
<div class="guide-body"><aside class="contents"><p class="contents-label">Chapters</p><nav id="chapters" aria-label="Guide chapters"></nav><div class="margin-note"><span aria-hidden="true">◆</span><p>Choose a chapter.<br>Open a topic for more detail.</p></div></aside><section class="reading-pane" aria-label="Guide content"><div class="search-bar"><label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><span class="sr-only">Search the handbook</span><input id="search" type="search" placeholder="Find a rule or action…" autocomplete="off" maxlength="100"></label><button id="clearSearch" type="button" hidden>Clear</button><span id="pageCount"></span></div><div id="readingScroll" class="reading-scroll" tabindex="0" aria-label="Scrollable help chapter"><div id="article"></div></div></section></div>
<footer class="guide-footer"><button id="tips" type="button" class="tips-button" aria-pressed="false"><span class="check" aria-hidden="true">✓</span><span>Show first steps tips</span></button><span id="tipsNote">Guidance on the map and in Profile</span><button id="backToGame" type="button" class="primary">Back to game</button></footer>
</div><p class="sr-only" id="liveStatus" role="status" aria-live="polite"></p>`;
    const $=selector=>host.querySelector(selector),article=$('#article');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=src=>src.includes('#')?`<svg viewBox="0 0 64 64" aria-hidden="true"><use href="${esc(src)}"></use></svg>`:`<img src="${esc(src)}" alt="">`;
let selected='first-steps',query='',tips=Boolean(options.tipsEnabled);const scrolls=new Map(),expanded=new Set();
function notify(message){$('#liveStatus').textContent=message;}
function topicCard(topic,index,chapter,search=false){const key=chapter.id+':'+topic.id;return `<article class="topic-card ${topic.badge?'important':''}" id="topic-${topic.id}"><div class="topic-heading"><span class="topic-emblem">${icon(topic.icon)}${chapter.id==='first-steps'?`<b>${index+1}</b>`:''}</span><div><p class="topic-kicker">${search?esc(chapter.name):chapter.id==='first-steps'?`Step ${index+1}`:'Field notes'}</p><h3>${esc(topic.title)}</h3></div></div>${topic.badge?`<p class="rule-badge">${esc(topic.badge)}</p>`:''}<p class="topic-summary">${esc(topic.text)}</p><details data-topic="${key}" ${expanded.has(key)?'open':''}><summary><span>Read more</span><i aria-hidden="true">⌄</i></summary><div class="topic-more"><p>${esc(topic.more)}</p>${topic.related?`<button type="button" data-related="${topic.related}">Read ${esc(chapters.find(c=>c.id===topic.related).name.toLowerCase())} <span aria-hidden="true">›</span></button>`:''}</div></details></article>`;}
function renderNav(){
 $('#chapters').innerHTML=chapters.map(c=>`<button type="button" data-chapter="${c.id}" ${selected===c.id?'aria-current="page"':''}><img src="${c.icon}" alt=""><span><strong>${esc(c.name)}</strong><small>${esc(c.hint)}</small></span><b aria-hidden="true">${c.numeral}</b></button>`).join('');
}
function render(){
 const chapter=chapters.find(c=>c.id===selected);renderNav();$('#clearSearch').hidden=!query;
 if(query){
  const words=query.toLocaleLowerCase().trim().split(/\s+/),matches=chapters.flatMap(c=>c.topics.map((t,i)=>({t,i,c}))).filter(({t,c})=>words.every(w=>(c.name+' '+t.title+' '+t.text+' '+t.more+' '+(t.tags||'')).toLocaleLowerCase().includes(w)));
  $('#pageCount').textContent=`${matches.length} ${matches.length===1?'result':'results'}`;
  article.innerHTML=`<header class="results-heading"><p class="eyebrow">Search the handbook</p><h2>Results for “${esc(query)}”</h2><p>${matches.length?'Open a topic for its full explanation.':'Try a shorter search, such as “shield”, “scout”, or “tower”.'}</p></header>${matches.length?`<div class="topic-grid">${matches.map(({t,i,c})=>topicCard(t,i,c,true)).join('')}</div>`:'<div class="empty-state"><img src="assets/optimized/item-royal-tax-decree-384x384-86d99a278ab1.webp" alt=""><h3>No matching topics</h3><p>Browse the chapters or clear your search to start again.</p><button type="button" data-clear>Back to chapter</button></div>'}`;
 }else{
  $('#pageCount').textContent=`Chapter ${chapter.numeral} · ${chapter.topics.length} topics`;
  article.innerHTML=`<header class="chapter-hero"><div><p class="eyebrow">Chapter ${chapter.numeral} · ${esc(chapter.name)}</p><h2>${esc(chapter.title)}</h2><p>${esc(chapter.intro)}</p></div><figure><img src="${chapter.art}" alt=""><figcaption>${chapter.id==='first-steps'?'Your story starts here':chapter.id==='clans'?'One clan. One Tower.':chapter.id==='combat'?'Know before you march':chapter.id==='items'?'Provisions for your realm':'Across the connected realm'}</figcaption></figure></header><div class="topic-grid ${chapter.id==='first-steps'?'steps-grid':''}">${chapter.topics.map((t,i)=>topicCard(t,i,chapter)).join('')}</div><aside class="chapter-note"><span aria-hidden="true">◆</span><p>${esc(chapter.note)}</p></aside>`;
 }
 article.querySelectorAll('details').forEach(node=>node.addEventListener('toggle',()=>{if(node.open)expanded.add(node.dataset.topic);else expanded.delete(node.dataset.topic);}));
}
function chooseChapter(id,{focus=false,reset=false}={}){
 if(!chapters.some(c=>c.id===id))return;
 if(!query)scrolls.set(selected,$('#readingScroll').scrollTop);
 selected=id;query='';$('#search').value='';render();$('#readingScroll').scrollTop=reset?0:scrolls.get(id)||0;
 if(focus)$('#readingScroll').focus({preventScroll:true});notify(chapters.find(c=>c.id===id).name+' chapter.');
}
$('#chapters').addEventListener('click',e=>{const target=e.target.closest('[data-chapter]');if(target)chooseChapter(target.dataset.chapter);});
$('#chapters').addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const i=chapters.findIndex(c=>c.id===selected),index=e.key==='Home'?0:e.key==='End'?chapters.length-1:(i+(e.key==='ArrowDown'?1:-1)+chapters.length)%chapters.length;chooseChapter(chapters[index].id);$(`[data-chapter="${selected}"]`).focus();});
$('#search').addEventListener('input',()=>{if(!query)scrolls.set(selected,$('#readingScroll').scrollTop);query=$('#search').value.trim().slice(0,100);render();$('#readingScroll').scrollTop=0;$('#liveStatus').textContent=$('#pageCount').textContent;});
function clearSearch(){chooseChapter(selected);$('#search').focus();}
$('#clearSearch').addEventListener('click',clearSearch);$('#search').addEventListener('keydown',e=>{if(e.key==='Escape'&&query){e.preventDefault();e.stopPropagation();clearSearch();}});
article.addEventListener('click',e=>{const related=e.target.closest('[data-related]');if(related)chooseChapter(related.dataset.related,{focus:true,reset:true});if(e.target.closest('[data-clear]'))clearSearch();});
$('#tips').addEventListener('click',()=>{
  const next=options.onToggleTips?.(!tips);
  if(typeof next!=='boolean')return;
  tips=next;updateTips();notify(tips?'First steps tips enabled.':'First steps tips hidden.');
});
function updateTips(){
  $('#tips').setAttribute('aria-pressed',String(tips));
  $('#tips').disabled=options.canEditTips===false;
  $('#tipsNote').textContent=options.canEditTips===false?'Sign in to save your preference':tips?'First steps guidance enabled':'Guidance on the map and in Profile';
}
$('#closeHelp').addEventListener('click',()=>options.onClose?.());
$('#backToGame').addEventListener('click',()=>options.onClose?.());
render();updateTips();host.dataset.helpReady='true';

  }
  global.CrownlandsHelpHandbookUi=Object.freeze({mount});
})(window);
