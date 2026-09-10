"use strict";
// Markup captured from the local benchmark only. No game runtime or Firebase is loaded.
let panels, page=0, cityId, toastTimer;
const settings={panel:new URLSearchParams(location.search).get("panel")||"list",layout:new URLSearchParams(location.search).get("layout")||"draft"};
function toast(message) {
  clearTimeout(toastTimer);let node=document.querySelector(".draft-toast");
  if(!node){node=document.createElement("div");node.className="draft-toast";node.setAttribute("role","status");document.getElementById("modal").append(node);}
  node.textContent=message;node.hidden=false;toastTimer=setTimeout(()=>{node.hidden=true;},2500);
}
function render() {
  if(!panels)return;
  document.documentElement.dataset.layout=settings.layout;
  const info=panels.infos.find(c=>c.id===cityId)||panels.infos[0];cityId=info.id;
  document.body.innerHTML=panels.icons+(settings.panel==="list"?panels.lists[page]:info.html);
  const modal=document.getElementById("modal");modal.removeAttribute("open");
  if(settings.layout==="draft"&&settings.panel==="list"){
    modal.querySelectorAll(".cll-identity>div").forEach(copy=>{
      const name=copy.querySelector(".cll-name");
      const meta=document.createElement("span");meta.className="compact-city-meta";
      [...copy.children].filter(node=>node!==name).forEach(node=>meta.append(node));
      name.append(meta);name.removeAttribute("aria-label");
    });
  }
  modal.showModal();
  modal.addEventListener("cancel",event=>{event.preventDefault();toast("Draft preview · choose a panel above to switch views.");});
}
document.addEventListener("submit",event=>event.preventDefault());
document.addEventListener("click",event=>{
 const button=event.target.closest("button,a");if(!button)return;event.preventDefault();
 if(button.matches('[role="tab"]')){
  document.querySelectorAll('[role="tab"]').forEach(tab=>{const selected=tab===button;tab.setAttribute("aria-selected",String(selected));tab.tabIndex=selected?0:-1;document.getElementById(tab.getAttribute("aria-controls")).hidden=!selected;});return;
 }
 if(button.dataset.cdAmount!==undefined){
  const index=Number(button.dataset.cdAmount);document.querySelector(".cd-actions").outerHTML=panels.amounts[cityId][index];document.querySelector(`[data-cd-amount="${index}"]`).focus({preventScroll:true});return;
 }
 if(button.dataset.cityListPage){page=Math.max(0,Math.min(panels.lists.length-1,page+(button.dataset.cityListPage==="next"?1:-1)));render();return;}
 if(button.dataset.cityListInfo){
  if(!panels.infos.some(city=>city.id===button.dataset.cityListInfo)){toast("This off-map city has no detail sample in the draft. Choose a city from page 1.");return;}
  cityId=button.dataset.cityListInfo;settings.panel="info";render();parent.postMessage({type:"compact-city-panel",panel:"info"},location.origin);return;
 }
 if(button.id==="closeModalBtn"){toast("Draft preview · use City List / City Info above to switch.");return;}
 if(button.matches(".city-list-upgrade,.cd-upgrade")){toast("Layout preview only · no Gold spent.");return;}
 if(button.id==="enterInnerCastleBtn"){toast("Draft only · opens your Main City’s Inner Castle in the game.");return;}
 if(button.dataset.cityListSort){toast("Sort control retained · sample order stays fixed in this layout draft.");return;}
 toast("Control retained · this draft does not change game data.");
});
document.addEventListener("keydown",event=>{
 if(!event.target.matches('[role="tab"]')||!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
 event.preventDefault();const tabs=[...document.querySelectorAll('[role="tab"]')];const target=event.key==="Home"?tabs[0]:event.key==="End"?tabs.at(-1):tabs.find(t=>t!==event.target);target.click();target.focus();
});
window.addEventListener("message",event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=="compact-city-preview")return;const changed=settings.panel!==event.data.panel||settings.layout!==event.data.layout;Object.assign(settings,{panel:event.data.panel,layout:event.data.layout});if(changed)render();});
fetch("docs/visual-qa/compact-city-layout/panels.json").then(response=>{if(!response.ok)throw Error("Could not load the sample panels.");return response.json();}).then(async data=>{
 panels=data;
 document.head.insertAdjacentHTML("beforeend",data.styles.join(""));
 const css=document.createElement("link");css.rel="stylesheet";css.href="docs/visual-qa/compact-city-layout/compact.css";document.head.append(css);
 await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>new Promise(resolve=>{if(link.sheet)resolve();else{link.onload=resolve;link.onerror=resolve;}})));
 render();document.documentElement.dataset.ready="true";
}).catch(error=>{document.body.textContent=error.message;});
