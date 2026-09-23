"use strict";
const game=document.getElementById("game"),loading=document.getElementById("loading");
game.addEventListener("load",async()=>{
  try{
    for(let i=0;i<400;i++){
      if(game.contentDocument.documentElement.dataset.crownlandsBenchmarkReady==="true")break;
      if(i===399)throw Error("The sample game did not finish loading.");
      await new Promise(r=>setTimeout(r,100));
    }
    const script=game.contentDocument.createElement("script");script.src="/docs/visual-qa/public-player-profile/runtime-fixture.js";game.contentDocument.body.appendChild(script);
  }catch(error){loading.textContent=error.message;}
});
window.addEventListener("message",e=>{
  if(e.origin!==location.origin)return;
  if(e.source===parent&&e.data?.type==="public-profile-review")game.contentWindow.postMessage(e.data,location.origin);
  if(e.source===game.contentWindow&&e.data?.type==="public-profile-ready"){
    loading.hidden=true;document.documentElement.dataset.publicProfileReady="true";
    game.contentWindow.postMessage({type:"public-profile-review",sample:new URLSearchParams(location.search).get("sample")||"standard"},location.origin);
    parent.postMessage(e.data,location.origin);
  }
});
