"use strict";
// Synthetic, in-memory review data. No gameplay or persistence modules are loaded.
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const number = value => Number(value).toLocaleString("en-US");
const compact = value => new Intl.NumberFormat("en-US", {notation:"compact",maximumFractionDigits:1}).format(value);
const hours = minutes => number(minutes / 60);
const copy = value => JSON.parse(JSON.stringify(value));
const config = CrownlandsClanHeraldryConfig;
const renderer = CrownlandsClanHeraldryRenderer.create({config,assets:CrownlandsClanHeraldryAssets,legacyRenderer:CrownlandsClanHeraldryLegacyV1});
const defaultShield = {...config.DEFAULT_V2,division:"solid",primary:"#4e5637",secondary:"#d8bd78",charge:"lion",chargeColor:"#eee1bd",borderColor:"#d8bd78"};
const iconPaths = {shield:"assets/icons/skills/shieldwallDiscipline.svg",march:"assets/icons/skills/marchOrders.svg",gold:"assets/icons/royal-shop-gold-r1.svg",troops:"assets/icons/daily-login-troops-r1.svg",quest:"assets/icons/reward-daily-quests-r1.svg",charter:"assets/icons/skills/guildCharters.svg",crown:"assets/flag-symbols/selected/svg/crown.svg"};
const icon = (key, cls="") => `<img class="${cls}" src="${iconPaths[key] || iconPaths.shield}" alt="">`;
const names = ["Alden of Greywatch","Mira Ashford","Edric Stone","Elowen Reed","Oswin Vale","Rowan Hawke","Isolde Fen","Cedric North","Maeve Thorn","Gareth Wells","Alys Wren","Brennan Holt","Tamsin Oak","Lucan Ford","Petra Marsh","Hugh Alder","Sabine Crow","Ronan Dale","Willa Grey","Alaric West","Nessa Brook","Conrad Flint","Enid Green","Bram Pike","Aveline Shaw","Dorian Hill","Lysa Ward","Fenn Rook","Hilda Stone","Orrin Fox"];
const milestoneData = [[25,"gold",30],[75,"troops",30],[150,"gold",60],[250,"troops",60],[400,"gold",90],[600,"troops",120],[850,"gold",150],[1150,"troops",180],[1500,"gold",240],[2000,"troops",360]];
const clanDirectory = [
 {id:"oak",name:"Oakwatch Company",tag:"OAK",mode:"approval",count:14,power:28400000,description:"Keep the northern roads. Rallies, shared effort, and a place for every loyal ruler.",shield:{...defaultShield,charge:"oak-tree"}},
 {id:"iron",name:"Ironford Wardens",tag:"IRON",mode:"open",count:27,power:71400000,description:"An open house for active rulers. Stand together at the river crossing.",shield:{...defaultShield,primary:"#7a2638",charge:"fortress-keep"}},
 {id:"red",name:"House Redwyvern",tag:"RED",mode:"approval",count:30,power:112000000,description:"The old house of the eastern hills. Our household is currently full.",shield:config.DEFAULT_V1}
];
let state, screen="overview", rewardTab="gifts", heraldryTab="field", selectedMember="", selectedRally="watch", shieldDraft=null, migrationFields=[], publicClan=null, searchTerm="", pendingConfirm=null, orderMode="create", orderRally="", notice="";
const isLeader = () => state.role === "Leader";
const isManager = () => ["Leader","Officer"].includes(state.role);
const readyRewards = () => milestoneData.filter(([n])=>n<=state.captures&&!state.claimed.includes(n)&&!state.late).length + (state.giftMinutes>0?1:0);
const giftLabel = () => state.giftMinutes ? `${hours(state.giftMinutes)}h ready` : state.giftCooldown ? `Ready in ${state.giftCooldown}` : "Send now";
const memberPower = () => state.roster.reduce((n,m)=>n+m.power,0);
const demoFlag = (seed=0) => {
 const symbols=["lion","eagle","stag","wolf","tower","oak-tree"], dyes=["#4e5637","#703e3d","#24445f","#8a5835"];
 return `<span class="ruler-standard" role="img" aria-label="Example kingdom banner" style="--dye:${dyes[seed%dyes.length]}"><img src="assets/flag-symbols/selected/svg/${symbols[seed%symbols.length]}.svg" alt=""></span>`;
};
function makeExample(key) {
 state={key,name:"Greybanner Covenant",tag:"GREY",description:"We keep the western roads, stand beside our allies, and answer the banner together. Every ruler has a place in the hall.",shield:copy(defaultShield),role:"Leader",member:true,mode:"approval",hero:76,gold:1600000,captures:1240,claimed:[25,75,150,250,400,600],late:false,giftMinutes:210,giftCooldown:"",giftsSent:12,giftsReceived:19,giftsClaimed:360,recent:[{name:"Mira Ashford",age:"8m ago"},{name:"Edric Stone",age:"24m ago"},{name:"Elowen Reed",age:"1h ago"},{name:"Oswin Vale",age:"2h ago"}],treasury:{balance:6400000,totalDonated:12800000,totalSpent:6400000,cap:960000,donated:240000,rate:80000,locked:true,available:true},pendingApplication:"",joinCooldown:"",renameCooldown:"",horns:2,roster:[],applications:[],rallies:[],error:"",loading:false};
 const count=key==="quiet"?1:key==="large"?30:24;
 state.role=key==="officer"?"Officer":key==="member"?"Member":"Leader";
 state.roster=names.slice(0,count).map((name,i)=>({id:i===0?"self":`m${i}`,name,role:i===0?state.role:i===1&&state.role!=="Leader"?"Leader":i<3?"Officer":"Member",power:6400000-i*180000,login:i<4?"Last active just now":i<10?`Last active ${i*4}m ago`:`Last active ${i-9}h ago`,seed:i}));
 state.roster.sort((a,b)=>({Leader:0,Officer:1,Member:2}[a.role]-{Leader:0,Officer:1,Member:2}[b.role])||b.power-a.power);
 state.applications=key==="quiet"?[]:[{id:"a1",name:"Aveline Shaw",power:2800000,seed:3},{id:"a2",name:"Dorian Hill",power:1940000,seed:4},{id:"a3",name:"Lysa Ward",power:890000,seed:5}];
 state.rallies=key==="quiet"?[]:[
  {id:"watch",target:"Northwatch Stronghold",region:"Northern March",assembly:"Greywatch",creator:"self",leader:names[0],status:"forming",participants:[{id:"self",name:names[0],troops:44000,status:"assembled"},{id:"m2",name:names[2],troops:28000,status:"inbound",eta:"4m 12s"}]},
  {id:"crown",target:"Crown Citadel",region:"Crownlands",assembly:"Ashford",creator:"m1",leader:names[1],status:"forming",participants:[{id:"m1",name:names[1],troops:62000,status:"assembled"},{id:"m3",name:names[3],troops:38000,status:"assembled"}]},
  {id:"stone",target:"Stoneford Stronghold",region:"Western Vale",assembly:"Greywatch",creator:"self",leader:names[0],status:"launched",participants:[{id:"self",name:names[0],troops:32000,status:"assembled"},{id:"m1",name:names[1],troops:23000,status:"assembled"}]}
 ];
 if(key==="member") { for(const r of state.rallies.filter(r=>r.creator==="self")){r.creator="m1";r.leader=names[1];if(!r.participants.some(p=>p.id==="m1"))r.participants.push({id:"m1",name:names[1],troops:18000,status:"assembled"});} }
 if(key==="quiet"){state.name="Oakwatch Company";state.tag="OAK";state.description="No description yet.";state.captures=0;state.claimed=[];state.giftMinutes=0;state.recent=[];state.giftsSent=state.giftsReceived=state.giftsClaimed=0;state.treasury={...state.treasury,balance:0,totalDonated:0,totalSpent:0,donated:0,locked:false};}
 if(key==="cooldown"){state.giftMinutes=0;state.giftCooldown="4h 12m";}
 if(key==="large"){state.name="Wardens of the Old March";state.tag="MARCH";state.description="From the farms of the western valley to the watchtowers beyond the northern river, our covenant welcomes rulers who defend their neighbours, share in the work of conquest, and keep their word. Rally beneath our banner when the roads grow dangerous; no sworn ally stands alone.";state.captures=2000;}
 if(key==="legacy")state.shield=copy(config.DEFAULT_V1);
 if(key==="late"){state.late=true;state.claimed=[];}
 if(key==="poor")state.gold=20000;
 if(key==="rename-cooldown")state.renameCooldown="6d 4h";
 if(key==="treasury-unavailable")state.treasury.available=false;
 if(key==="applications-error")state.applicationsError=true;
 if(["recruit","join-cooldown","locked"].includes(key)){state.member=false;state.role="Member";if(key==="join-cooldown")state.joinCooldown="18h 24m";if(key==="locked")state.hero=7;}
 if(key==="loading")state.loading=true;
 if(key==="error")state.error="The clan ledger could not be loaded. Please try again.";
 if(key==="ready")state.rallies[0].participants.forEach(p=>p.status="assembled");
 if(key==="returning")state.rallies[0].status="recalling";
 selectedMember="";selectedRally=state.rallies[0]?.id||"";shieldDraft=null;migrationFields=[];publicClan=null;searchTerm="";notice="";
}
