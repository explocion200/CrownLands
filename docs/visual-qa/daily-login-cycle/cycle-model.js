"use strict";
/* Approval-draft simulation. Never imported by the game or backend. */
(function(root){
  const itemIds=["war_drums_30m","veil_of_silence_30m","royal_tax_decree_30m","swift_march_order","recall_horn","shield_12h"];
  function createSchedule(seed){
    let n=seed>>>0;
    const random=()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
    const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
    const pools={};for(const resource of ["gold","troops"])pools[resource]={early:shuffle([2,3,3,4,4,5,5,6]),late:shuffle([8,10,12,13]),end:shuffle([16,20])};
    const endTypes=shuffle(["gold","gold","troops","troops"]),days=[];
    for(let week=1;week<=4;week++){
      const types=[...shuffle(["gold","gold","troops","troops"]),...shuffle(["gold","troops"]),endTypes[week-1]];
      types.forEach((resource,index)=>days.push({day:days.length+1,week,weekday:index+1,resource,hours:pools[resource][index<4?"early":index<6?"late":"end"].pop(),itemId:null,commonGearBoxes:index===6?1:0}));
    }
    const extraWeeks=shuffle([0,1,2,3]).slice(0,2),itemDays=shuffle([6,13,20,27,...extraWeeks.map(w=>w*7+5)]),items=shuffle(itemIds);
    itemDays.forEach((day,index)=>{days[day-1].itemId=items[index];});return days;
  }
  function fixture(sample="ready",seed=4821){const nextDay=sample==="weekly"?7:sample==="pending"?6:sample==="final"?28:sample==="waiting"?20:19;return{cycle:3,seed,schedule:createSchedule(seed),nextDay,earnedThrough:sample==="pending"?7:sample==="waiting"?19:nextDay,utcDay:100,attendanceDay:100,creditedDay:100,hasCity:true,goldRate:12500,troopRate:850,season:9,claimed:[],boxes:0};}
  function pending(s){return Math.max(0,s.earnedThrough-s.nextDay+1);}
  function attend(s){s.attendanceDay=s.utcDay;if(s.creditedDay!==s.utcDay&&pending(s)<2&&s.earnedThrough<28){s.earnedThrough++;s.creditedDay=s.utcDay;}}
  function advance(s,days=1){s.utcDay+=days;attend(s);}
  function claim(s){if(!s.hasCity||!pending(s))return null;const reward={...s.schedule[s.nextDay-1],cycle:s.cycle};s.claimed.push(reward);s.boxes+=reward.commonGearBoxes;s.nextDay++;if(s.nextDay>28){s.cycle++;s.seed++;s.schedule=createSchedule(s.seed);s.nextDay=1;s.earnedThrough=0;}attend(s);return reward;}
  function seasonReset(s){s.season++;s.hasCity=false;s.goldRate=0;s.troopRate=0;}
  function establishCity(s){s.hasCity=true;s.goldRate=75;s.troopRate=1200;}
  const api={itemIds,createSchedule,fixture,pending,attend,advance,claim,seasonReset,establishCity};if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.DailyLoginDraft=api;
})(typeof window!=="undefined"?window:globalThis);
