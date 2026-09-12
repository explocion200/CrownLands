/* Approved Common Gear Box presentation and server-backed opening flow. */
/* exported showCommonGearBoxScreen */

// Original, code-native oak-and-iron illustration. The lid rotates about its actual back hinge.
function createCommonGearChest(host){
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox","0 0 500 390");svg.setAttribute("role","img");svg.setAttribute("aria-label","Oak equipment chest with iron bands and a hinged wooden lid");
  svg.innerHTML='<defs><radialGradient id="cgbChestShadow"><stop stop-color="#40351f" stop-opacity=".22"/><stop offset="1" stop-color="#40351f" stop-opacity="0"/></radialGradient></defs><ellipse cx="252" cy="337" rx="215" ry="42" fill="url(#cgbChestShadow)"/>';
  const body=document.createElementNS(ns,"g"),lid=document.createElementNS(ns,"g");lid.setAttribute("class","chest-lid");svg.append(body,lid);host.append(svg);
  const project=([x,y,z])=>[244+x*140+y*80,312+x*22-y*44-z*105];
  const point=p=>project(p).map(v=>v.toFixed(2)).join(",");
  function poly(group,points,fill,stroke="#3b3426",width=1.6){const e=document.createElementNS(ns,"polygon");e.setAttribute("points",points.map(point).join(" "));e.setAttribute("fill",fill);e.setAttribute("stroke",stroke);e.setAttribute("stroke-width",width);e.setAttribute("stroke-linejoin","round");group.append(e);return e;}
  function line(group,points,color="#55432b",width=1){const e=document.createElementNS(ns,"polyline");e.setAttribute("points",points.map(point).join(" "));e.setAttribute("fill","none");e.setAttribute("stroke",color);e.setAttribute("stroke-width",width);e.setAttribute("stroke-linecap","round");e.setAttribute("stroke-linejoin","round");group.append(e);return e;}
  function rivet(group,p,r=2.1){const[x,y]=project(p),e=document.createElementNS(ns,"circle");e.setAttribute("cx",x);e.setAttribute("cy",y);e.setAttribute("r",r);e.setAttribute("fill","#b1a280");e.setAttribute("stroke","#3d3c2e");e.setAttribute("stroke-width","1");group.append(e);}
  poly(body,[[-1,-.5,.07],[1,-.5,.07],[1,-.5,1.03],[-1,-.5,1.03]],"#aa8349");
  poly(body,[[1,-.5,.07],[1,.5,.07],[1,.5,1.03],[1,-.5,1.03]],"#786442");
  poly(body,[[-1,-.5,1.03],[1,-.5,1.03],[1,.5,1.03],[-1,.5,1.03]],"#c0a06a");
  poly(body,[[-.9,-.41,1.045],[.9,-.41,1.045],[.9,.41,1.045],[-.9,.41,1.045]],"#332d22");
  poly(body,[[-.9,-.41,1.049],[.9,-.41,1.049],[.75,-.23,1.052],[-.7,-.23,1.052]],"#65573b","none");
  for(let z=.26;z<1;z+=.23){line(body,[[-.98,-.507,z],[1,-.507,z],[1,.49,z]],"#695232",1.4);line(body,[[-.93,-.51,z+.025],[.95,-.51,z+.025]],"#d3b17a",.9);}
  for(let i=0;i<20;i++){const x=-.96+(i*37%100)/53,z=.13+(i*17%79)/100;line(body,[[x,-.513,z],[Math.min(.95,x+.1),-.513,z+.012],[Math.min(.97,x+.25),-.513,z+.004]],i%3?"#775932":"#d1ad73",.65);}
  for(const x of[-.65,.65]){poly(body,[[x-.065,-.525,.08],[x+.065,-.525,.08],[x+.065,-.525,1.04],[x-.065,-.525,1.04]],"#6b6d57");line(body,[[x-.041,-.53,.13],[x-.041,-.53,.99]],"#a8a58a",1.3);for(const z of[.16,.55,.96])rivet(body,[x,-.53,z]);}
  for(const z of[.13,.94]){poly(body,[[1.01,-.49,z-.035],[1.01,.49,z-.035],[1.01,.49,z+.035],[1.01,-.49,z+.035]],"#60614d");for(const y of[-.4,.4])rivet(body,[1.015,y,z],1.8);}
  const handle=document.createElementNS(ns,"path");const[hx,hy]=project([1.02,.03,.56]);handle.setAttribute("d",`M${hx-15} ${hy-4}q-7 16 5 17l20-10q8-5 0-13`);handle.setAttribute("fill","none");handle.setAttribute("stroke","#383c30");handle.setAttribute("stroke-width","4");body.append(handle);
  poly(body,[[-.115,-.538,.61],[.115,-.538,.61],[.115,-.538,.96],[.05,-.538,1.015],[-.05,-.538,1.015],[-.115,-.538,.96]],"#929075");
  const[kx,ky]=project([0,-.55,.76]);const key=document.createElementNS(ns,"path");key.setAttribute("d",`M${kx} ${ky-4}a4 4 0 1 0 0 8l-2 7h6l-2-7a4 4 0 0 0-2-8Z`);key.setAttribute("fill","#39372a");body.append(key);
  for(const x of[-.92,.92]){poly(body,[[x-.06,-.5,-.005],[x+.06,-.5,-.005],[x+.06,-.5,.11],[x-.06,-.5,.11]],"#5b5038");}
  function setOpen(progress){
    const angle=Math.max(0,Math.min(1,progress))*1.85;
    const p=(x,d,thickness=0)=>[x,.5-d*Math.cos(angle)+thickness*Math.sin(angle),1.11+d*Math.sin(angle)+thickness*Math.cos(angle)];
    lid.replaceChildren();
    poly(lid,[p(-1.03,0),p(1.03,0),p(1.03,1.04),p(-1.03,1.04)],progress>.15?"#9b7948":"#c19a5e");
    for(let d=.18;d<1;d+=.2){line(lid,[p(-1.02,d),p(1.02,d)],"#705734",1.35);line(lid,[p(-.98,d+.018),p(.98,d+.018)],"#dbc08a",.8);}
    for(let i=0;i<16;i++){const x=-.94+(i*43%100)/57,d=.06+(i*23%92)/100;line(lid,[p(x,d),p(Math.min(.96,x+.12),d+.013),p(Math.min(.98,x+.29),d+.006)],"#795c35",.6);}
    poly(lid,[p(-1.03,1.04),p(1.03,1.04),p(1.03,1.04,-.1),p(-1.03,1.04,-.1)],"#997441");
    poly(lid,[p(1.03,0),p(1.03,1.04),p(1.03,1.04,-.1),p(1.03,0,-.1)],"#7e6947");
    for(const x of[-.65,.65]){poly(lid,[p(x-.065,0),p(x+.065,0),p(x+.065,1.04),p(x-.065,1.04)],"#747661");line(lid,[p(x-.04,.04),p(x-.04,1)],"#b3b095",1.3);for(const d of[.07,.49,.97])rivet(lid,p(x,d),2);poly(lid,[p(x-.065,1.04),p(x+.065,1.04),p(x+.065,1.04,-.1),p(x-.065,1.04,-.1)],"#5e624f");}
    poly(lid,[p(-.075,1.052),p(.075,1.052),p(.075,1.052,-.24),p(-.075,1.052,-.24)],"#8e8c70");rivet(lid,p(0,1.058,-.04));
    svg.dataset.open=progress.toFixed(3);
  }
  setOpen(0);return{setOpen,svg};
}

const COMMON_GEAR_BOX_MARKUP = "<div class=\"cgb-box-shell\">\n  <header class=\"cgb-box-header\"><span class=\"cgb-box-seal\" aria-hidden=\"true\"></span><div class=\"cgb-box-heading\"><p>Inner Castle · Equipment</p><h1 id=\"cgbBoxTitle\">Common Gear Box</h1></div><div class=\"cgb-box-count\" aria-label=\"Unopened boxes\"><span class=\"cgb-count-icon\" aria-hidden=\"true\"></span><span><strong id=\"cgbRemaining\">5</strong><small>boxes remaining</small></span></div><span class=\"cgb-close-space\" aria-hidden=\"true\"></span></header>\n  <div class=\"cgb-box-content\">\n    <section class=\"cgb-chest-view\" aria-labelledby=\"cgbChestTitle\"><div class=\"cgb-chest-stage\"><div class=\"cgb-chest-halo\" aria-hidden=\"true\"></div><button id=\"cgbChestArt\" type=\"button\" aria-label=\"Open Common Gear Box\"></button><span class=\"cgb-stage-caption\">THE ROYAL STORES</span></div><div class=\"cgb-chest-copy\"><p class=\"cgb-eyebrow\">Equipment for your officers</p><h2 id=\"cgbChestTitle\">Break the seal.<br>Equip your realm.</h2><span class=\"cgb-ink-rule\" aria-hidden=\"true\">◆</span><p class=\"cgb-chest-description\">An oak chest, bound in iron.<br> Three pieces of Common equipment inside.</p><div class=\"cgb-contents-promise\"><span class=\"cgb-piece-seal\">3</span><span><strong>Common pieces</strong><small>Level 1 · +0.25% each</small></span></div><p id=\"cgbOpeningStatus\" class=\"cgb-opening-status\" role=\"status\" aria-live=\"polite\"></p></div></section>\n    <section class=\"cgb-reward-view\" aria-labelledby=\"cgbRewardTitle\" hidden><div class=\"cgb-reward-intro\"><div><p class=\"cgb-eyebrow\">The chest is open</p><h2 id=\"cgbRewardTitle\">Three pieces for your officers</h2></div><span class=\"cgb-stored-mark\" role=\"status\"><span aria-hidden=\"true\">✓</span> Added to your equipment</span></div><div class=\"cgb-reward-cards\"></div></section>\n  </div>\n  <footer class=\"cgb-box-footer\"><span class=\"cgb-footer-note\">One box · Three pieces</span><div class=\"cgb-footer-actions\"></div></footer>\n</div>";
let commonGearBoxSession = null;
let commonGearBoxView = null;

function commonGearBoxOwnerMatches(session) {
  return session.state === state && session.uid === getCurrentOnlineUid();
}

function getCommonGearBoxMotion() {
  const mode = getEffectiveAnimationMode();
  return mode === "off" ? "off" : window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : mode;
}

function renderCommonGearBoxReward(instance, index) {
  const d = COMMON_GEAR.getDefinition(instance.gearKey);
  if (!d) return "";
  const name = d.gearName.replace(d.characterRole + "'s ", "");
  return `<article class="cgb-reward-card" aria-label="${escapeHtml(d.gearName)}" style="--order:${index}">
    <div class="cgb-rarity-line"><span><i aria-hidden="true"></i> Common</span><span>Level ${instance.level}</span></div>
    <div class="cgb-reward-record" tabindex="0" aria-label="${escapeHtml(d.gearName)} details">
      <div class="cgb-reward-hero"><div class="cgb-reward-art"><img src="${escapeHtml(d.art)}" alt="" draggable="false" onerror="this.hidden=true"></div>
        <div><p class="cgb-officer-name">${escapeHtml(d.characterRole)}</p><h3>${escapeHtml(name)}</h3><p class="cgb-item-meta">${escapeHtml(d.buildingName)} · ${escapeHtml(d.slot)}</p></div></div>
      <div class="cgb-item-effect"><strong>+${COMMON_GEAR.getBonusPercent(instance).toFixed(2)}<span>%</span></strong><p>${escapeHtml(d.statLabel)}</p></div>
    </div></article>`;
}

function isCommonGearBoxViewActive(view) {
  return view === commonGearBoxView && view.root.isConnected && modal.open && modal.classList.contains("cgb-modal") && commonGearBoxOwnerMatches(view.session);
}

function renderCommonGearBoxState(focus = false) {
  const view = commonGearBoxView;
  if (!view || !isCommonGearBoxViewActive(view)) return;
  const session = view.session;
  const count = Math.max(0, Math.floor(Number(state.gear?.commonGearBoxes) || 0));
  const revealed = !session.busy && !!session.receipt;
  const empty = count === 0 && !session.receipt && !session.requestId;
  const canOpen = count > 0 || !!session.requestId;
  const find = selector => view.root.querySelector(selector);
  const title = revealed ? "Common Gear Found" : "Common Gear Box";
  modalTitle.textContent = title;
  find("#cgbBoxTitle").textContent = title;
  modal.dataset.motion = getCommonGearBoxMotion();
  modal.dataset.phase = session.busy ? "opening" : revealed ? "revealed" : "ready";
  find("#cgbRemaining").textContent = count;
  find(".cgb-box-count small").textContent = count === 1 ? "box remaining" : "boxes remaining";
  find(".cgb-box-count").setAttribute("aria-label", `${count} unopened ${count === 1 ? "box" : "boxes"}`);
  find(".cgb-chest-view").hidden = revealed;
  find(".cgb-reward-view").hidden = !revealed;
  find(".cgb-chest-stage").classList.toggle("cgb-is-opening", session.busy);
  find(".cgb-chest-stage").classList.toggle("cgb-is-empty", empty);
  find(".cgb-contents-promise").hidden = empty;
  find("#cgbChestArt").disabled = session.busy || !canOpen;
  find("#cgbChestTitle").innerHTML = empty ? "No unopened boxes" : "Break the seal.<br>Equip your realm.";
  find(".cgb-chest-description").innerHTML = empty ? "Your equipment is waiting<br> in the Inner Castle." : "An oak chest, bound in iron.<br> Three pieces of Common equipment inside.";
  const status = find("#cgbOpeningStatus");
  status.textContent = session.error || (session.busy ? "Opening your box…" : count === 1 ? "Your last unopened box." : "");
  status.classList.toggle("cgb-error", !!session.error);
  find(".cgb-box-content").setAttribute("aria-busy", String(session.busy));
  if (revealed && view.receipt !== session.receipt) {
    find(".cgb-reward-cards").innerHTML = session.items.map(renderCommonGearBoxReward).join("");
    view.receipt = session.receipt;
  }
  const rewardStatus = find(".cgb-stored-mark");
  rewardStatus.innerHTML = session.error ? "Opening not confirmed · Retry" : '<span aria-hidden="true">✓</span> Added to your equipment';
  rewardStatus.classList.toggle("cgb-error", !!session.error);
  find(".cgb-footer-note").textContent = revealed ? (count ? `${count} ${count === 1 ? "box" : "boxes"} still to open` : "All your boxes are opened.") : session.busy ? "One box is opening…" : empty ? "Visit your officers to manage gear." : "One box · Three pieces";
  const button = (action, label, primary = false, disabled = false) => `<button type="button" data-cgb-action="${action}" class="cgb-${primary ? "primary" : "secondary"}" ${disabled ? "disabled" : ""}>${label}</button>`;
  find(".cgb-footer-actions").innerHTML = revealed
    ? button("later", "Equip Later") + button("castle", "Go to Inner Castle") + (canOpen ? button("open", `${session.error ? "Try Again" : "Open Another Box"} <span class="cgb-button-count">${count}</span>`, true) : "")
    : button("bag", "Back to Bag") + (empty ? button("castle", "Go to Inner Castle", true) : button("open", session.busy ? "Opening…" : session.error ? "Try Again" : "Open Box", true, session.busy || !canOpen));
  if (focus) find(canOpen ? '.cgb-footer-actions [data-cgb-action="open"]' : '[data-cgb-action="castle"]')?.focus({ preventScroll: true });
}

function animateCommonGearBoxOpening(view) {
  if (!view || !isCommonGearBoxViewActive(view)) return Promise.resolve();
  return new Promise(resolve => {
    let frameId = 0;
    const start = performance.now();
    const finish = () => {
      cancelAnimationFrame(frameId);
      view.chest.setOpen(1);
      document.removeEventListener("visibilitychange", onVisibility);
      view.stopAnimation = null;
      resolve();
    };
    const onVisibility = () => { if (document.hidden) finish(); };
    const frame = now => {
      if (!isCommonGearBoxViewActive(view) || document.hidden || getCommonGearBoxMotion() !== "full") { finish(); return; }
      const progress = Math.min(1, (now - start) / 900);
      view.chest.setOpen(1 - Math.pow(1 - progress, 3));
      if (progress < 1) frameId = requestAnimationFrame(frame);
      else finish();
    };
    view.stopAnimation = finish;
    document.addEventListener("visibilitychange", onVisibility);
    frame(start);
  });
}

async function openOneCommonGearBox() {
  const session = commonGearBoxSession;
  if (!session || !commonGearBoxOwnerMatches(session) || session.busy || (!session.requestId && !(state.gear?.commonGearBoxes > 0))) return;
  const api = getOnlineApi();
  if (!api?.openCommonGearBox) {
    session.error = "Connect to the realm to open this Gear Box.";
    renderCommonGearBoxState(true);
    return;
  }
  // Keep this identity after an uncertain response and across closing/reopening.
  // A new deliberate opening gets a fresh identity only after a confirmed receipt.
  session.requestId ||= createDailyMissionRequestId("gear-box");
  session.busy = true;
  session.error = "";
  if (commonGearBoxView?.session === session) commonGearBoxView.chest.setOpen(0);
  renderCommonGearBoxState();
  try {
    const result = await api.openCommonGearBox({ requestId: session.requestId });
    if (!commonGearBoxOwnerMatches(session)) return;
    if (!result?.gear || result.receipt?.requestId !== session.requestId || result.receipt?.instanceIds?.length !== COMMON_GEAR.BOX_REVEAL_COUNT) throw new Error("The opening could not be confirmed. Try again.");
    const gear = normalizeCommonGearState(result.gear);
    const items = result.receipt.instanceIds.map(id => gear.instances[id]);
    if (items.some(item => !item || !COMMON_GEAR.getDefinition(item.gearKey))) throw new Error("The equipment could not be confirmed. Try again.");
    // Never overwrite a newer authoritative profile snapshot with an older response.
    if (Number(gear.updatedAtMs || 0) >= Number(state.gear?.updatedAtMs || 0)) state.gear = gear;
    session.receipt = result.receipt;
    session.items = items;
    session.requestId = "";
    renderCommonGearBoxState();
    await animateCommonGearBoxOpening(commonGearBoxView?.session === session ? commonGearBoxView : null);
  } catch (_error) {
    // An interrupted response may already have committed; do not claim no box was used.
    if (session.requestId) session.error = "Opening not confirmed. Try again to recover the result.";
  } finally {
    session.busy = false;
    if (commonGearBoxSession === session && commonGearBoxOwnerMatches(session)) renderCommonGearBoxState(true);
  }
}

function showCommonGearBoxScreen(receipt = null) {
  if (!state || !COMMON_GEAR) return;
  commonGearBoxView?.dispose();
  if (!commonGearBoxSession || !commonGearBoxOwnerMatches(commonGearBoxSession)) {
    commonGearBoxSession = { state, uid: getCurrentOnlineUid(), busy: false, error: "", requestId: "", receipt: null, items: [] };
  }
  const session = commonGearBoxSession;
  if (receipt && !session.busy) {
    session.receipt = receipt;
    session.items = (receipt.instanceIds || []).map(id => state.gear?.instances?.[id]).filter(Boolean);
  }
  commonGearMergeConfirmOpen = false;
  delete modal.dataset.commonGearBuildingId;
  modal.className = "common-gear-box-modal cgb-modal modal";
  modalTitle.textContent = "Common Gear Box";
  modalBody.innerHTML = COMMON_GEAR_BOX_MARKUP;
  const root = modalBody.querySelector(".cgb-box-shell");
  const chest = createCommonGearChest(root.querySelector("#cgbChestArt"));
  const view = { session, root, chest, receipt: null, stopAnimation: null, dispose };
  commonGearBoxView = view;
  const icon = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path fill="currentColor" fill-opacity=".12" d="M4 13V8l8-4 17 5v17L12 30l-8-5Z"/><path d="m4 8 17 5 8-4M4 13l17 5 8-4M21 13v17M9 10v17m8-14v16M4 21l17 5 8-5"/><path fill="currentColor" d="m11 15 5 1v6l-5-1Z"/></svg>';
  root.querySelector(".cgb-box-seal").innerHTML = icon;
  root.querySelector(".cgb-count-icon").innerHTML = icon;
  root.querySelector("#cgbChestArt").dataset.cgbAction = "open";
  root.addEventListener("click", event => {
    const button = event.target.closest("button[data-cgb-action]");
    if (!button || button.disabled) return;
    if (button.dataset.cgbAction === "open") openOneCommonGearBox();
    else if (button.dataset.cgbAction === "castle") {
      const mainCity = getMainCityReference();
      if (mainCity) openInnerCastle(mainCity.id);
      else showToast("Your main city is not available on this map.");
    } else if (button.dataset.cgbAction === "bag") showInventoryModal();
    else modal.close();
  });
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const update = () => {
    if (!isCommonGearBoxViewActive(view)) { dispose(); return; }
    modal.dataset.motion = getCommonGearBoxMotion();
    if (getCommonGearBoxMotion() !== "full") view.stopAnimation?.();
  };
  const observer = new MutationObserver(update);
  function dispose() {
    observer.disconnect();
    media.removeEventListener("change", update);
    view.stopAnimation?.();
    if (commonGearBoxView === view) commonGearBoxView = null;
  }
  if (!modal.open) modal.showModal();
  renderCommonGearBoxState(true);
  observer.observe(modal, { attributes: true, attributeFilter: ["class", "open"] });
  observer.observe(modalBody, { childList: true });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-animation-mode"] });
  media.addEventListener("change", update);
}
