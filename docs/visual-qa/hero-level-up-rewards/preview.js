"use strict";
// Fictional receipt values, local presentation only. Never calculates or grants rewards.
(() => {
  const $=id=>document.getElementById(id), dialog=$("levelUpRewardModal");
  const receipts={
    standard:[{fromLevel:24,toLevel:25,skillPoints:1,gold:125480,troops:32620,cityName:"Stoneward"}],
    multiple:[{fromLevel:47,toLevel:50,skillPoints:3,gold:1248500,troops:182760,cityName:"Greyhaven"}],
    large:[{fromLevel:149,toLevel:150,skillPoints:1,gold:23497686072,troops:4285960,cityName:"The Watch of Saint Bartholomew"}],
    early:[{fromLevel:1,toLevel:2,skillPoints:1,gold:1000,troops:800,cityName:""}],
    queued:[{fromLevel:24,toLevel:25,skillPoints:1,gold:125480,troops:32620,cityName:"Stoneward"},{fromLevel:25,toLevel:26,skillPoints:1,gold:144920,troops:36180,cityName:"Ravenwatch"}]
  };
  let sample="standard",position=0;
  const format=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString();
  const notify=message=>parent.postMessage({type:"hero-reward-status",message},location.origin);
  function render(){
    const reward=receipts[sample][position],count=reward.toLevel-reward.fromLevel;
    $("levelUpRewardTitle").textContent=count>1?`${format(count)} levels gained`:`Level ${format(reward.toLevel)} reached`;
    $("levelUpRewardSubtitle").textContent=count>1?"Every step strengthens your kingdom.":"A new chapter in your journey.";
    $("heroLevel").textContent=format(reward.toLevel);
    $("fromLevel").textContent=format(reward.fromLevel);$("toLevel").textContent=format(reward.toLevel);
    $("levelsGained").textContent=`${format(count)} ${count===1?"level":"levels"} gained`;
    $("skillLabel").textContent=reward.skillPoints===1?"Skill point":"Skill points";
    for(const id of ["skillPoints","gold","troops"]){const text=`+${format(reward[id])}`;$(id).textContent=text;$(id).classList.toggle("long-amount",text.length>12);}
    $("cityName").textContent=reward.cityName||"Your main city";
    $("localNotice").hidden=true;$("collectLevelUpRewardsBtn").disabled=false;
    if(!dialog.open)dialog.showModal();
    document.querySelector(".reward-ledger").scrollTop=0;
    notify(sample==="queued"?`Receipt ${position+1} of ${receipts[sample].length} · separate troop destinations` : "Ready to review · fictional receipt");
  }
  function reset(value){sample=Object.hasOwn(receipts,value)?value:"standard";position=0;render();}
  $("collectLevelUpRewardsBtn").addEventListener("click",()=>{
    if(!dialog.open)return;
    $("collectLevelUpRewardsBtn").disabled=true;
    dialog.close();position++;
    if(position<receipts[sample].length){render();return;}
    $("localNotice").hidden=false;$("reopen").focus();notify("Example dismissed · no game rewards changed");
  });
  dialog.addEventListener("cancel",event=>event.preventDefault());
  $("reopen").addEventListener("click",()=>reset(sample));
  window.addEventListener("message",event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=="hero-reward-review")return;reset(event.data.sample);});
  if(parent===window)reset(new URLSearchParams(location.search).get("sample"));
  else parent.postMessage({type:"hero-reward-ready"},location.origin);
})();
