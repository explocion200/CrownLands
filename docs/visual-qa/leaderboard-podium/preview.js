"use strict";
// Standalone design fixture: no accounts, persistence, game imports or backend calls.
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const number = value => Number(value).toLocaleString("en-US");
const heraldry = CrownlandsClanHeraldryRenderer.create({config:CrownlandsClanHeraldryConfig,assets:CrownlandsClanHeraldryAssets,legacyRenderer:CrownlandsClanHeraldryLegacyV1});
const names = ["Alden Greywatch","Mira Ashford","Edric Stone","Elowen Reed","Oswin Vale","Rowan Hawke","Isolde Fen","Cedric North","Maeve Thorn","Gareth Wells","Alys Wren","Hugh Oakward"];
const houses = ["Ironford Wardens","House Ashford","The Stone Circle","Riverwatch","Order of the Stag","Ashen Banner"];
const tags = ["IRON","ASH","STONE","RIV","STAG","OATH"];
const colors = ["#653336","#485c67","#526043","#795433","#5d5064","#4c5d55"];
const charges = ["lion","eagle","stag","oak-tree","wolf","tower"];
const categories = {
  players:{title:"The foremost kingdoms",label:"POWER & DOMINION",score:"King Power",identity:"Ruler & clan",status:"Published King Power · highest first",rules:"Kingdoms are ranked by their published King Power. The podium highlights the top three; the ledger continues from fourth place.\n\nYour standing uses a published entry only. Existing power calculations remain unchanged."},
  clans:{title:"The great noble houses",label:"STRENGTH IN ALLEGIANCE",score:"Clan Power",identity:"Noble house",status:"Combined member King Power",rules:"Clans are ranked by combined member King Power. The top three houses display their clan heraldry.\n\nThis draft keeps the existing clan ranking rules."},
  glory:{title:"Champions of the battlefield",label:"SEASONAL PVP RANKINGS",score:"PvP kills",identity:"Ruler & clan",status:"Enemy troops defeated · this season",rules:"PROPOSED SCORING\nOne point per enemy player troop defeated, on attack or defense, during this season. Neutral and NPC troops do not count.\n\nA shared battle divides credit among participants; it never awards the whole kill total to every ruler. Totals reset with the season.\n\nWhether recovered troops count and how shared credit is divided still need confirmation. These are sample totals."}
};
const states = {
  loading:["The scribes are at work","Reading this season's rankings…"],
  empty:["The roll awaits its first names","No eligible scores have been recorded yet."],
  error:["The roll could not be reached","Use Refresh to try the sample again."],
  offline:["Sign in to read the roll","Published rankings require an online account."]
};
const params = new URLSearchParams(location.search);
let section = Object.hasOwn(categories, params.get("section")) ? params.get("section") : "players";
let sample = params.get("sample") || "standard";
let refreshTimer, noticeTimer, rulesReturnFocus;
function fixtures() {
  return Array.from({length:sample === "two" ? 2 : 100}, (_, i) => ({
    rank:i+1, name:section === "clans" ? (i < 6 ? houses[i] : houses[i%6] + " " + (Math.floor(i/6)+1)) : (i < 12 ? names[i] : names[i%12].split(" ")[0] + " of " + ["Westmere","Oakfield","Dunford","Reedhall","Hillwatch","Flintbank","Woodmere","Greyhaven"][Math.floor(i/12)-1]),
    tag:tags[i%6], color:colors[i%6], charge:charges[i%6],
    value:section === "clans" ? 824650000-i*6791500 : section === "glory" ? 2438716-i*22811 : 48264000-i*442231,
    meta:section === "clans" ? (30-i%17)+" members" : ["Frostwolf March","Ashen Flats","Stoneveil Steppe","Emberwood"][i%4]+" · "+(76-i%70)+" cities",
    current:sample !== "unranked" && i === (sample === "winner" ? 0 : section === "clans" ? 7 : 11)
  })).map((row,i) => sample === "long" && i === 0 ? {...row,name:section === "clans" ? "Wardens of the Far Northern Marches" : "TheNorthernWarden",value:987654321012} : row);
}
function emblem(row, extra="") {
  return section === "clans" ? '<span class="crest '+extra+'" data-crest="'+row.rank+'" aria-hidden="true"></span>' :
    '<span class="banner '+extra+'" style="--flag:'+row.color+'" aria-hidden="true"><img src="assets/flag-symbols/selected/svg/'+row.charge+'.svg" alt=""></span>';
}
function champion(row) {
  const medal = ["first","second","third"][row.rank-1];
  return '<article class="champion '+medal+'" '+(row.current?'id="yourRank" tabindex="-1"':'')+' aria-label="Rank '+row.rank+', '+escapeHtml(row.name)+'">'+
    '<div class="crown-rank"><img src="assets/flag-symbols/selected/svg/crown.svg" alt=""><span>'+row.rank+'</span></div>'+emblem(row)+
    '<button class="champion-name" data-profile="'+escapeHtml(row.name)+'">'+escapeHtml(row.name)+'</button><span class="tag">['+row.tag+']'+(row.current?' · YOU':'')+'</span>'+
    '<strong class="champion-score">'+number(row.value)+'</strong><span class="score-label">'+categories[section].score+'</span><span class="rank-plinth" aria-hidden="true"></span></article>';
}
function ledgerRow(row) {
  return '<article class="rank-row '+(row.current?'current':'')+'" '+(row.current?'id="yourRank" tabindex="-1"':'')+'>'+
    '<span class="row-rank">'+row.rank+'</span>'+emblem(row,section === "clans" ? "row-crest" : "row-banner")+
    '<div class="row-identity"><button class="row-name" data-profile="'+escapeHtml(row.name)+'">'+escapeHtml(row.name)+(row.current?'<span class="you">YOU</span>':'')+'</button><p class="row-meta">'+(section !== "clans"?'['+row.tag+'] · ':'')+row.meta+'</p></div>'+
    '<div class="row-total">'+number(row.value)+'<small>'+(section === "glory"?'This season':section === "clans"?'Clan Power':'Updated 2m ago')+'</small></div></article>';
}
function status(message) {
  if (parent !== window) parent.postMessage({type:"podium-status",message,section},location.origin);
}
function notify(message) {
  clearTimeout(noticeTimer);$("notice").textContent=message;$("notice").hidden=false;
  noticeTimer=setTimeout(()=>$("notice").hidden=true,4000);status(message);
}
function render() {
  const category=categories[section], rows=fixtures(), current=rows.find(row=>row.current), hasRows=!Object.hasOwn(states,sample);
  $("rankPanel").setAttribute("aria-labelledby",section+"Tab");
  $("rankScroll").setAttribute("aria-label",category.title);
  $("rankScroll").setAttribute("aria-busy",String(sample === "loading"));
  $("refresh").disabled=sample === "loading" || sample === "offline";
  document.querySelectorAll("[data-tab]").forEach(button=>{
    const active=button.dataset.tab === section;button.setAttribute("aria-selected",String(active));button.tabIndex=active?0:-1;
  });
  $("categoryLabel").textContent=category.label;$("rollTitle").textContent=category.title;
  $("status").textContent=hasRows?category.status:states[sample][1];
  $("standing").classList.toggle("empty-standing",!hasRows);
  $("standing").innerHTML=hasRows ? '<h2>'+(section === "clans"?"Your clan":"Your standing")+'</h2>'+
    (current?'<div class="rank"><small>RANK</small> '+current.rank+'</div>'+emblem(current)+'<h3 class="standing-name">'+escapeHtml(current.name)+'</h3><p class="standing-meta">['+current.tag+']</p><span class="standing-rule"></span><strong class="standing-score">'+number(current.value)+'</strong><span class="score-label">'+category.score+'</span><button class="find-rank" id="findRank">Find my '+(section === "clans"?"clan":"rank")+' ↓</button><p class="standing-foot">Your published standing<br>in this season’s roll.</p>':'<div class="rank outside">Not in the<br>Top 100</div><p class="standing-meta">No published entry in this ranking.</p><span class="standing-rule"></span><p class="standing-foot">Your place will appear here when you enter the roll.</p>') :
    '<img src="assets/flag-symbols/selected/svg/crown.svg" alt=""><h2>Your standing</h2><p class="standing-meta">Awaiting published ranks</p>';
  $("rankScroll").innerHTML=hasRows ? '<section class="podium" aria-label="Top three">'+rows.slice(0,3).map(champion).join("")+'</section>'+
    (rows.length>3?'<div class="columns" aria-hidden="true"><span>Rank</span><span class="identity-label">'+category.identity+'</span><span>'+category.score+'</span></div><div class="rank-list" aria-label="Ranks four onward">'+rows.slice(3).map(ledgerRow).join("")+'</div>':'<p class="row-meta">All published entries are shown above.</p>') :
    '<div class="empty-state"><h3>'+states[sample][0]+'</h3><p>'+states[sample][1]+'</p></div>';
  if (hasRows && section === "clans") document.querySelectorAll("[data-crest]").forEach(el=>{
    const row=rows[Number(el.dataset.crest)-1];
    heraldry.render(el,{...CrownlandsClanHeraldryConfig.DEFAULT_V2,division:"solid",primary:row.color,charge:row.charge === "tower"?"fortress-keep":row.charge,chargeColor:"#eee1bd",borderColor:"#b5a078",finish:"weathered"},{width:100,variant:"full",label:row.name+" heraldry"});
  });
  $("rankScroll").scrollTop=0;
  $("findRank")?.addEventListener("click",()=>{
    $("yourRank").scrollIntoView({block:"center",behavior:"instant"});$("yourRank").focus({preventScroll:true});notify("Your "+(section === "clans"?"clan":"kingdom")+" is ranked "+current.rank+" in this sample.");
  });
}
document.querySelectorAll("[data-tab]").forEach((button,index,buttons)=>{
  button.addEventListener("click",()=>{clearTimeout(refreshTimer);if(sample === "loading")sample="standard";section=button.dataset.tab;render();status("Showing "+button.textContent);});
  button.addEventListener("keydown",event=>{
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();
    const next=event.key==="Home"?0:event.key==="End"?buttons.length-1:(index+(event.key==="ArrowRight"?1:-1)+buttons.length)%buttons.length;
    buttons[next].click();buttons[next].focus();
  });
});
$("rankScroll").addEventListener("click",event=>{const button=event.target.closest("[data-profile]");if(button)notify("Sample "+(section === "clans"?"clan":"ruler")+": "+button.dataset.profile+". Live profiles will open here after integration.");});
$("refresh").addEventListener("click",()=>{
  const restore=Object.hasOwn(states,sample)?"standard":sample;sample="loading";render();
  refreshTimer=setTimeout(()=>{sample=restore;render();status("Sample rankings refreshed.");},450);
});
function closeRules(){ $("rulesPanel").hidden=true;document.querySelector(".ledger-shell").inert=false;rulesReturnFocus?.focus(); }
$("rules").addEventListener("click",()=>{rulesReturnFocus=document.activeElement;$("rulesText").textContent=categories[section].rules;$("rulesPanel").hidden=false;document.querySelector(".ledger-shell").inert=true;$("closeRules").focus();});
$("closeRules").addEventListener("click",closeRules);
$("leaderboardDialog").addEventListener("cancel",event=>{if(!$("rulesPanel").hidden){event.preventDefault();closeRules();}});
$("close").addEventListener("click",()=>$("leaderboardDialog").close());
$("leaderboardDialog").addEventListener("close",()=>{clearTimeout(refreshTimer);$("notice").hidden=true;$("reopen").focus();});
$("reopen").addEventListener("click",()=>{section="players";if(sample==="loading")sample="standard";render();$("leaderboardDialog").showModal();$("playersTab").focus();});
window.addEventListener("message",event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.type!=="podium-review")return;
  clearTimeout(refreshTimer);closeRules();
  sample=["standard","winner","long","two","unranked",...Object.keys(states)].includes(event.data.sample)?event.data.sample:"standard";
  section=Object.hasOwn(categories,event.data.section)?event.data.section:"players";render();
  if(!$("leaderboardDialog").open)$("leaderboardDialog").showModal();status("Draft ready. All rankings are fictional sample data.");
});
render();$("leaderboardDialog").showModal();$(section+"Tab").focus();
