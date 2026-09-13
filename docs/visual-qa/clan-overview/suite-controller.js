"use strict";
const screens=["overview","warroom","rewards","members","discover","create","heraldry","rename","public","rally-create"];
function announce(message) {
 $("liveStatus").textContent=message;
 parent.postMessage({type:"clan-review-status",message,screen:screen==="rally-order"?"rally-create":screen,sample:state.key,rewardTab},location.origin);
}
function drawShield(el,shield,width=100,variant="full") {renderer.render(el,shield,{width,variant,label:`${state.name} heraldry`});}
function renderNavigation() {
 const nav=$("clanSections");
 const badgeLabel=(id,n)=>!n?"":id==="members"?isManager()&&state.applications.length?`${n} pending applications`:`${n} clan members`:id==="rewards"?`${n} ready rewards`:`${n} active rallies`;
 const items=state.member?[["overview","Overview",0],["warroom","War Room",state.rallies.length],["rewards","Rewards",readyRewards()],["members","Members",isManager()&&state.applications.length?state.applications.length:state.roster.length]]:[["discover","Discover Clans",0],["create","Create Clan",0]];
 nav.classList.toggle("browser-tabs",!state.member);
 nav.innerHTML=items.map(([id,label,badge])=>`<button data-action="screen" data-id="${id}" aria-label="${label}${badge?", "+badgeLabel(id,badge):""}" ${screen===id?'aria-current="page"':""}>${label}${badge?`<span class="badge ${id==="rewards"||id==="members"&&isManager()&&state.applications.length?"alert":""}">${badge}</span>`:""}</button>`).join("");
}
function renderOverview() {
 $("clanName").textContent=state.name;$("clanName").setAttribute("aria-label",`View ${state.name} public clan profile`);
 $("clanTag").textContent=`[${state.tag}]`;$("role").textContent=`YOUR CLAN · ${state.role}`;$("description").textContent=state.description;
 $("clanPower").textContent=compact(memberPower());$("memberTotal").innerHTML=`${state.roster.length} <small>/ 30</small>`;
 $("rallyCount").textContent=state.rallies.length;$("giftValue").textContent=giftLabel();$("giftState").textContent=state.giftMinutes?"Gold gifts to collect":state.giftCooldown?"Gold gift cooldown":"Gold gift available";
 document.querySelector(".gifts").classList.toggle("ready",state.giftMinutes>0);
 $("conquestValue").textContent=`${number(state.captures)} / 2,000`;$("conquestFill").style.width=`${Math.min(100,state.captures/20)}%`;
 document.querySelector(".conquest-track").setAttribute("aria-valuenow",state.captures);
 $("rosterValue").textContent=`${state.roster.length} / 30`;$("rosterState").textContent=isManager()&&state.applications.length?`${state.applications.length} pending applications`:"Clan members";
 $("leaderActions").hidden=!isLeader();$("memberNote").hidden=isLeader();
 drawShield($("clanShield"),state.shield,176);$("clanShield").setAttribute("aria-label",`View ${state.name} public clan profile`);
}
function renderArt() {
 document.querySelectorAll("[data-shield]").forEach(el=>{
  const id=el.dataset.shield,shield=id==="editor"||id==="micro"?shieldDraft:id==="public"?publicClan?.shield||state.shield:clanDirectory.find(c=>c.id===id)?.shield||defaultShield;
  drawShield(el,shield,id==="editor"?210:id==="micro"?44:id==="public"?180:64,id==="micro"?"micro":"full");
 });
 document.querySelectorAll("[data-choice-shield]").forEach(el=>{const [key,value]=el.dataset.choiceShield.split(":");drawShield(el,{...shieldDraft,[key]:value},42);});
}
function renderScreen() {
 renderNavigation();if(!$("clanDialog").open)$("clanDialog").showModal();$("dismissed").hidden=true;
 const overview=screen==="overview"&&state.member&&state.hero>=10&&!state.loading&&!state.error;
 $("overviewBody").hidden=!overview;$("suitePanel").hidden=overview;
 if(overview){renderOverview();return;}
 let html="";
 if(state.hero<10)html=empty("Clans unlock at Level 10",`Raise your Hero to Level 10 to create or join a clan. Your Hero is Level ${state.hero} / 10.`);
 else if(state.loading)html=empty("Loading clan ledger…","Gathering your household’s latest records.");
 else if(state.error)html=empty("The ledger is unavailable",escapeHtml(state.error),action("Try again","retry"));
 else if(["heraldry","rename"].includes(screen)&&!isLeader())html=empty("Leader management","Only the Clan Leader may change the clan’s name or heraldry.",action("Back to Overview","screen",'data-id="overview"'));
 else if(screen==="members")html=membersView();else if(screen==="warroom")html=warView();else if(screen==="rewards")html=rewardsView();else if(screen==="discover")html=discoveryView();else if(screen==="create")html=createView();else if(screen==="rename")html=renameView();else if(screen==="heraldry")html=heraldryView();else if(screen==="public")html=publicView();else if(screen==="rally-order"||screen==="rally-create")html=orderView();
 else html=empty("Find your household","Discover a clan or found a house of your own.",action("Discover Clans","screen",'data-id="discover"'));
 $("suitePanel").innerHTML=html;renderArt();
}
function go(next,review=false) {
 if(!screens.includes(next)&&next!=="rally-order")return;
 if(review&&["discover","create"].includes(next)&&state.member)makeExample("recruit");
 if(review&&!state.member&&["overview","members","warroom","rewards","heraldry","rename","rally-create"].includes(next))makeExample("leader");
 if(next==="rally-create"){orderMode="create";orderRally="";}
 if(next==="heraldry"&&isLeader()&&!shieldDraft){if(state.shield.version===1){const m=config.createV2DraftFromV1(state.shield);shieldDraft=copy(m.shield);migrationFields=[...m.unresolvedFields];}else shieldDraft=copy(state.shield);heraldryTab="field";}
 screen=next;renderScreen();announce(`${next==="rally-create"?"Rally order":next[0].toUpperCase()+next.slice(1)} draft · all changes stay in this review.`);
}
function dialog(title,body,acceptLabel="",onAccept=null,danger=false) {
 pendingConfirm=onAccept;$("detailTitle").textContent=title;$("detailBody").innerHTML=body;
 $("detailActions").innerHTML=`<button class="suite-button" data-dialog="close">${acceptLabel?"Cancel":"Back"}</button>${acceptLabel?`<button class="suite-button ${danger?"danger":"primary"}" data-dialog="accept">${acceptLabel}</button>`:""}`;$("detailDialog").showModal();
}
function complete(message){state.roster.sort((a,b)=>({Leader:0,Officer:1,Member:2}[a.role]-{Leader:0,Officer:1,Member:2}[b.role])||b.power-a.power);renderScreen();announce(`${message} (Draft only.)`);}
function memberDeparture(id){state.rallies=state.rallies.filter(r=>!(r.creator===id&&r.status==="forming"));for(const r of state.rallies){if(r.creator===id&&r.status==="launched")r.status="recalling";if(r.status==="forming")r.participants=r.participants.filter(p=>p.id!==id);}}
function adoptClan(c,creating=false){
 state.member=true;state.name=c.name;state.tag=c.tag;state.description=c.description||"No description yet.";state.mode=c.mode;state.shield=copy(c.shield||defaultShield);state.role=creating?"Leader":"Member";state.pendingApplication="";state.joinCooldown="";
 state.roster=creating?[{id:"self",name:names[0],role:"Leader",power:6400000,login:"Last active just now",seed:0}]:names.slice(1,c.count+1).map((name,i)=>({id:`joined${i}`,name,role:i===0?"Leader":"Member",power:Math.round(c.power/c.count),login:"Last active 1h ago",seed:i})).concat([{id:"self",name:names[0],role:"Member",power:6400000,login:"Last active just now",seed:0}]);
 state.applications=[];state.rallies=[];state.captures=0;state.claimed=[];state.giftMinutes=0;state.giftCooldown="";state.recent=[];state.giftsSent=state.giftsReceived=state.giftsClaimed=0;state.treasury={balance:0,totalDonated:0,totalSpent:0,cap:960000,donated:0,rate:80000,locked:false,available:true};go("overview");
}
function handleAction(b){
 const a=b.dataset.action,id=b.dataset.id;if(b.disabled)return;
 if(a==="screen"){if(id==="public")publicClan=null;go(id);}
 else if(a==="reward-tab"){rewardTab=id;renderScreen();announce(`${b.textContent} draft.`);}
 else if(a==="player")dialog(b.dataset.name||"Ruler Profile","<p>This name opens the existing shared Player Profile. The clan draft preserves that connection.</p>");
 else if(a==="public"){publicClan=clanDirectory.find(c=>c.id===id)||null;go("public");}
 else if(a==="member-select"){selectedMember=selectedMember===id?"":id;renderScreen();}
 else if(a==="retry"){state.error="";state.loading=false;complete("Clan records loaded");}
 else if(a==="retry-applications"){state.applicationsError=false;complete("Applications loaded");}
 else if(a==="role"||a==="remove"){
  const m=state.roster.find(m=>m.id===id);if(!isLeader()||!m||id==="self"||m.role==="Leader")return;const next=m.role==="Officer"?"Member":"Officer";
  dialog(a==="role"?`${next==="Officer"?"Promote":"Demote"} ${m.name}?`:`Remove ${m.name}?`,a==="role"?`<p>Their role will become <strong>${next}</strong>.</p>`:"<p>This ruler leaves your roster. A forming rally they created is cancelled; a launched rally they created is recalled. Their other contributions follow the existing return rules.</p>",a==="role"?"Confirm Role":"Remove Ruler",()=>{if(a==="role")m.role=next;else{state.roster=state.roster.filter(x=>x.id!==id);memberDeparture(id);}selectedMember="";complete(a==="role"?"Role updated":"Ruler removed");},a==="remove");
 }
 else if(a==="accept"||a==="reject"){const p=state.applications.find(x=>x.id===id);if(!isManager()||!p||a==="accept"&&state.roster.length>=30)return;if(a==="accept")state.roster.push({...p,role:"Member",login:"Last active just now"});state.applications=state.applications.filter(x=>x.id!==id);complete(a==="accept"?`${p.name} joined the household`:`Application from ${p.name} rejected`);}
 else if(a==="disband"||a==="leave"){
  if(a==="disband"&&!isLeader())return;
  dialog(a==="disband"?`Disband ${state.name}?`:`Leave ${state.name}?`,a==="disband"?`<p><strong>This cannot be undone.</strong> All ${state.roster.length} members are removed, shared clan bonuses end, and applications are cleared.</p><p>Forming rallies are cancelled. A launched rally whose creator departs is recalled under the Rally departure rules.</p><p>Other members may join another clan immediately. Your 24-hour clan cooldown begins when you disband.</p>`:"<p>You leave this household and lose its shared bonuses. A rally you created is cancelled if forming, or recalled if launched.</p><p>A 24-hour clan cooldown applies before joining, applying, or creating another clan.</p>",a==="disband"?"Disband Clan Permanently":"Leave Clan",()=>{state.member=false;state.role="Member";state.joinCooldown="24h";state.pendingApplication="";go("discover");announce("Departure preview complete. The example is now in clan cooldown.");},true);
 }
 else if(a==="select-rally"){selectedRally=id;renderScreen();}
 else if(a==="rally-join"){orderMode="join";orderRally=id;go("rally-order");}
 else if(a.startsWith("rally-")){
  const r=state.rallies.find(x=>x.id===id);if(!r)return;
  if(a==="rally-launch"&&(r.status!=="forming"||!(isLeader()||r.creator==="self")||r.participants.length<2||r.participants.some(p=>p.status!=="assembled")))return;
  if(a==="rally-cancel"&&(r.status!=="forming"||!(isLeader()||r.creator==="self")))return;
  if(a==="rally-withdraw"&&(r.status!=="forming"||!r.participants.some(p=>p.id==="self")))return;
  if(a==="rally-recall"&&(r.status!=="launched"||r.creator!=="self"||!state.horns))return;
  const labels={"rally-launch":["Launch Rally?",`All ${r.participants.length} Ready participants march together at the slowest contribution’s speed.`,"Launch Rally"],"rally-cancel":["Cancel Rally?","The creator’s troops return to the assembly city. Assembled allies and inbound contributions travel back normally.","Cancel Rally"],"rally-withdraw":["Withdraw contribution?","Your committed troops will travel back normally.","Withdraw"],"rally-recall":["Recall the rally?","Spend one Recall Horn to turn the complete combined army home.","Recall · 1 Horn"]};
  const [title,body,label]=labels[a]||[];if(!title)return;
  dialog(title,`<p><strong>${r.target}</strong></p><p>${body}</p>`,label,()=>{if(a==="rally-launch")r.status="launched";else if(a==="rally-cancel")state.rallies=state.rallies.filter(x=>x.id!==id);else if(a==="rally-withdraw")r.participants=r.participants.filter(x=>x.id!=="self");else{r.status="recalling";state.horns--;}complete(label+" complete");},a!=="rally-launch");
 }
 else if(a==="send-gift"&&!state.giftCooldown){state.giftCooldown="5h";state.giftsSent++;state.recent.unshift({name:names[0],age:"Just now"});state.recent=state.recent.slice(0,10);complete("A .5h Gold gift was sent to every other member");}
 else if(a==="collect-gifts"&&state.giftMinutes){const n=state.giftMinutes;state.giftsClaimed+=n;state.gold+=Math.floor(n/60*80000);state.giftMinutes=0;complete(`${hours(n)}h Gold collected`);}
 else if(a==="claim"){const r=milestoneData.find(([n])=>n===Number(id));if(!r||state.late||state.claimed.includes(r[0])||state.captures<r[0])return;state.claimed.push(r[0]);if(r[1]==="gold")state.gold+=Math.floor(r[2]/60*80000);complete(`${hours(r[2])}h ${r[1]==="gold"?"Gold":"Troops"} collected`);}
 else if(a==="apply"){if(state.joinCooldown||state.pendingApplication)return;state.pendingApplication=id;complete("Application sent");}
 else if(a==="cancel-application"){state.pendingApplication="";complete("Application cancelled");}
 else if(a==="join-clan"){const c=clanDirectory.find(c=>c.id===id);if(!c||c.count>=30||state.joinCooldown||state.pendingApplication)return;adoptClan(c);announce("Joined the example clan. No real membership changed.");}
 else if(a==="heraldry-tab"){heraldryTab=id;renderScreen();}
 else if(a==="shield-choice"||a==="shield-color"){if(!isLeader())return;const top=document.querySelector(".heraldry-controls")?.scrollTop||0;shieldDraft[b.dataset.key]=b.dataset.value;migrationFields=migrationFields.filter(f=>f!==b.dataset.key);renderScreen();document.querySelector(".heraldry-controls").scrollTop=top;document.querySelector(`[data-action="${a}"][data-key="${b.dataset.key}"][data-value="${b.dataset.value}"]`)?.focus({preventScroll:true});}
 else if(a==="shield-random"){const pick=arr=>arr[Math.floor(Math.random()*arr.length)];shieldDraft={...config.DEFAULT_V2,shape:pick(config.SHAPE_KEYS),division:pick(config.DIVISION_KEYS),charge:pick(config.SELECTABLE_CHARGE_KEYS.filter(c=>c!=="none")),primary:pick(config.COLOR_VALUES),secondary:pick(config.COLOR_VALUES),chargeColor:"#eee1bd"};migrationFields=[];renderScreen();}
 else if(a==="cancel-shield"){shieldDraft=null;migrationFields=[];go("overview");}
 else if(a==="save-shield"){if(!isLeader()||migrationFields.length)return;const check=config.validateV2Write(shieldDraft,{existing:state.shield});if(!check.ok){dialog("Choose a valid heraldic palette",`<p>${escapeHtml(check.errors.join(" "))}</p>`);return;}state.shield=copy(check.value);shieldDraft=null;go("overview");announce("Heraldry saved to this draft only.");}
}
document.addEventListener("click",event=>{
 const b=event.target.closest("button");if(!b)return;
 if(b.dataset.dialog==="close"){$("detailDialog").close();pendingConfirm=null;return;}
 if(b.dataset.dialog==="accept"){const run=pendingConfirm;pendingConfirm=null;$("detailDialog").close();run?.();return;}
 if(b.dataset.action){handleAction(b);return;}
 if(b.hasAttribute("data-overview")){go(state.member?"overview":"discover");return;}
 if(b.dataset.preview){const map={"War Room":"warroom",Rewards:"rewards","Weekly Conquest":"rewards",Members:"members","Edit Heraldry":"heraldry","Rename Clan":"rename","Clan profile":"public"};if(map[b.dataset.preview]){if(b.dataset.preview==="Weekly Conquest")rewardTab="conquest";else if(b.dataset.preview==="Rewards")rewardTab="gifts";publicClan=null;go(map[b.dataset.preview]);}else dialog(b.dataset.preview,`<p>This returns to the existing ${escapeHtml(b.dataset.preview)} screen outside the clan draft.</p>`);}
});
document.addEventListener("submit",event=>{
 const form=event.target.closest("[data-form]");if(!form)return;event.preventDefault();if(!form.reportValidity())return;const d=Object.fromEntries(new FormData(form)),kind=form.dataset.form;
 if(kind==="search"){searchTerm=d.search.trim();renderScreen();announce("Search results updated.");}
 else if(kind==="create"||kind==="rename"){
  const creating=kind==="create",cost=creating?100000:500000;if(state.gold<cost||creating&&(state.member||state.joinCooldown||state.hero<10)||!creating&&(!isLeader()||state.renameCooldown))return;
  const name=d.name.trim().replace(/\s+/g," ");if(name.length<3||!creating&&name===state.name){dialog("Choose a different name","<p>Use a new clan name with 3–24 characters.</p>");return;}if(clanDirectory.some(c=>c.name.toLowerCase()===name.toLowerCase())){dialog("That name is in use","<p>Choose another clan name.</p>");return;}
  state.gold-=cost;if(creating){adoptClan({name,tag:d.tag.toUpperCase(),description:d.description,mode:d.admissionMode},true);announce("Clan founded in this draft only.");}else{state.name=name;state.renameCooldown="7d";go("overview");announce("Clan renamed in this draft only.");}
 }
 else if(kind==="donate"){const n=Number(d.amount),t=state.treasury;if(!t.available||!Number.isSafeInteger(n)||n<1||n>state.gold||n>t.cap-t.donated)return;dialog("Donate to the Clan Treasury?",`<p>Move <strong>${number(n)} Gold</strong> into the clan’s war chest. Donations are final and cannot be withdrawn.</p>`,"Donate Gold",()=>{state.gold-=n;t.balance+=n;t.totalDonated+=n;t.donated+=n;t.locked=true;complete(`${number(n)} Gold donated`);});}
 else if(kind==="order"){const n=Number(d.troops),r=state.rallies.find(x=>x.id===orderRally);if(!Number.isSafeInteger(n)||n<1||n>60000)return;if(orderMode==="join"){if(!r||r.status!=="forming"||r.participants.length>=20||r.participants.some(p=>p.id==="self"))return;r.participants.push({id:"self",name:names[0],troops:n,status:"inbound",eta:"12m 34s"});selectedRally=r.id;}else{if(!isManager()||state.rallies.length>=5)return;const id=`draft-${Date.now()}`;state.rallies.push({id,target:"Northwatch Stronghold",region:"Northern March",assembly:"Greywatch",creator:"self",leader:names[0],status:"forming",participants:[{id:"self",name:names[0],troops:n,status:"assembled"}]});selectedRally=id;}go("warroom");announce("Troop contribution preview created. No real troops moved.");}
});
document.addEventListener("input",e=>{if(!["troopCount","troopRange"].includes(e.target.id))return;const n=Math.max(1,Math.min(60000,Math.floor(Number(e.target.value)||1)));if(e.target.id==="troopRange")$("troopCount").value=n;else $("troopRange").value=n;$("troopsRemaining").textContent=number(60000-n);});
$("closeDetail").addEventListener("click",()=>{$("detailDialog").close();pendingConfirm=null;});$("detailDialog").addEventListener("cancel",()=>pendingConfirm=null);
$("close").addEventListener("click",()=>$("clanDialog").close());$("clanDialog").addEventListener("close",()=>{$("dismissed").hidden=false;announce("Clan draft closed.");});$("reopen").addEventListener("click",()=>{$("clanDialog").showModal();$("dismissed").hidden=true;});
window.addEventListener("message",e=>{
 if(e.origin!==location.origin||e.source!==parent)return;if(e.data?.type==="clan-review-screen"){go(e.data.screen,true);return;}if(e.data?.type!=="clan-review")return;
 $("detailDialog").close();pendingConfirm=null;makeExample(e.data.sample||"leader");if(!state.member)screen="discover";else if(["discover","create"].includes(screen))screen="overview";
 if(e.data.screen&&screens.includes(e.data.screen)){go(e.data.screen,true);return;}if(screen==="heraldry"){go("heraldry");return;}if(screen==="rally-order")screen="warroom";renderScreen();announce("Example reset. All changes stay in this draft.");
});
makeExample("leader");renderScreen();
