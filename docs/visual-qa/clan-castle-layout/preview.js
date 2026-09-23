"use strict";
const game=document.getElementById("game"),loading=document.getElementById("loading");
let requested={type:"castle-position-settings",sample:"owned",level:4,layout:"proposed"};
const query=new URLSearchParams(location.search);
for(const key of ["sample","level","layout"])if(query.has(key))requested[key]=query.get(key);
function update(){game.contentWindow.postMessage(requested,location.origin);}
game.addEventListener("load",async()=>{
  try {
    let ready=false;
    for(let i=0;i<300;i++){
      if(game.contentDocument.documentElement.dataset.crownlandsBenchmarkReady==="true"){ready=true;break;}
      if(game.contentDocument.documentElement.dataset.crownlandsBenchmarkError==="true")throw Error("The sample map could not start.");
      await new Promise(r=>setTimeout(r,100));
    }
    if(!ready)throw Error("The sample map did not finish loading.");
    const script=game.contentDocument.createElement("script");
    script.src="/docs/visual-qa/clan-castle-layout/map-preview.js";
    game.contentDocument.body.appendChild(script);
  }catch(error){loading.textContent=error.message+" Reload to try again.";}
});
window.addEventListener("message",e=>{
  if(e.origin!==location.origin)return;
  if(e.source===parent&&e.data?.type==="castle-layout-review"){requested={...requested,...e.data,type:"castle-position-settings"};update();}
  if(e.source===game.contentWindow&&e.data?.type==="castle-position-ready"){loading.hidden=true;document.documentElement.dataset.castleLayoutReady="true";update();}
  if(e.source===game.contentWindow&&e.data?.type==="castle-layout-status")parent.postMessage(e.data,location.origin);
});

