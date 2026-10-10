"use strict";
// Local review model only. These proposed rules are not imported by production.
// Recruitment rolls are held in sessionStorage solely to demonstrate stable
// offers. Production recruitment must roll and persist them on the server.
window.GuildReviewModel = (() => {
  const types = {
    guard:{name:"Guard",base:[12,6,6,8,10],growth:[3,1,1,2,2],skill:"Hold the line",hazard:"ambush",trait:"Roadwise"},
    scout:{name:"Scout",base:[6,12,8,6,10],growth:[1,3,2,1,2],skill:"Find safe passage",hazard:"wilderness",trait:"Pathfinder"},
    scholar:{name:"Scholar",base:[6,8,12,10,6],growth:[1,2,3,2,1],skill:"Read the signs",hazard:"investigation",trait:"Meticulous"},
    artisan:{name:"Artisan",base:[10,8,12,6,6],growth:[2,2,3,1,1],skill:"Field repairs",hazard:"engineering",trait:"Tinkerer"},
    envoy:{name:"Envoy",base:[6,8,10,12,6],growth:[1,2,2,3,1],skill:"Find common ground",hazard:"negotiation",trait:"Diplomatic"},
    quartermaster:{name:"Quartermaster",base:[8,6,10,6,12],growth:[2,1,2,1,3],skill:"Ready provisions",hazard:"supplies",trait:"Prepared"},
    medic:{name:"Medic",base:[6,8,12,6,10],growth:[1,2,3,1,2],skill:"A steady hand",hazard:"treatment",trait:"Prepared"},
  };
  const stats=["Strength","Agility","Knowledge","Leadership","Endurance"];
  const missions=[
    {id:"escort",name:"The Merchant's Road",client:"Miller's Caravan",kind:"Gold",primary:0,secondary:4,hazard:"ambush",hours:2,copy:"Escort a supply wagon through the western woods. Guards keep the caravan safe when the road narrows."},
    {id:"muster",name:"The Village Muster",client:"Reeve of Alderwick",kind:"Troops",primary:3,secondary:4,hazard:"negotiation",hours:2,copy:"Visit the villages and bring willing recruits home. A capable Envoy can earn the reeve's trust."},
    {id:"equipment",name:"The Lost Quartermaster",client:"Royal Stores",kind:"Officer Gear",primary:2,secondary:1,hazard:"engineering",hours:8,copy:"Search for the missing supply chest. Artisans recognize what can be recovered and carried safely."},
    {id:"quarry",name:"Survey the White Quarry",client:"Stonecutters' Company",kind:"Stone",primary:2,secondary:4,hazard:"engineering",hours:2,copy:"Survey a weathered face above the quarry and mark a safe route for the stonecutters."},
    {id:"timber",name:"The Western Timber Road",client:"Woodland Foresters",kind:"Timber",primary:1,secondary:4,hazard:"wilderness",hours:2,copy:"Find a dependable route through the old woods. Scouts help the foresters bring timber home."},
    {id:"workshop",name:"The Missing Workshop Wagon",client:"Artisans' Company",kind:"Iron",primary:4,secondary:2,hazard:"supplies",hours:2,copy:"Recover tools and iron from a stalled wagon before the woodland track becomes impassable."},
    {id:"waymark",name:"The Forgotten Waymark",client:"Guild Cartographers",kind:"Discovery",primary:1,secondary:2,hazard:"wilderness",hours:1,copy:"Follow the marks on an old milestone. A forgotten path may connect places absent from the Guild's maps."},
    {id:"ledger",name:"The Sealed Ledger",client:"Alderwick Archivist",kind:"Story chapter",primary:2,secondary:3,hazard:"investigation",hours:2,copy:"Trace a name through abandoned records. Scholars may uncover why the northern watchtower was deserted."},
  ].map(mission=>({...mission,requiredMembers:2,statTarget:24}));
  const facilities=[
    {id:"contracts",name:"Contract board",benefit:l=>l?`${l} additional client contract${l===1?"":"s"}`:"Base contracts available"},
    {id:"planning",name:"Planning table",benefit:l=>`${3+l} saved party slots`},
    {id:"infirmary",name:"Infirmary",benefit:l=>`${7*l}% shorter recovery`},
    {id:"training",name:"Training area",benefit:l=>l?`${5*l}% mentored XP`:"Mentoring not yet unlocked"},
    {id:"archive",name:"Archive",benefit:l=>l?`${l} discovery chapter${l===1?"":"s"} available`:"Reports and histories available"},
  ];
  const roomCosts={guild:[1,10,25,50,75],goldHours:[.25,.5,1,2,4],materialHours:[0,.5,1,2,4],minutes:[10,60,240,720,1440]};
  function rollStats(type) {
    return types[type].base.map(center=>{
      const bytes=new Uint32Array(1);do{crypto.getRandomValues(bytes);}while(bytes[0]>=4294967295);
      return center+bytes[0]%5-2;
    });
  }
  function person(id,name,type,level=1,rarity="Common") {
    return {id,name,type,level,rarity,base:rollStats(type),recoveryUntilMs:0,history:[]};
  }
  function initial() {
    const members=[person("mara","Mara Stone","guard",3),person("rowan","Rowan Ashford","scout",3),person("oswin","Oswin Reed","scholar",5,"Uncommon"),person("elin","Elin Marsh","artisan",2),person("ada","Ada Vale","envoy",4),person("bram","Bram Cask","quartermaster",3),person("ione","Ione Holt","medic",4)];
    members[6].recoveryUntilMs=Date.now()+17*60000;
    return {version:1,members,offers:[person("offer-maren","Maren Holt","guard"),person("offer-elin","Elin Ward","guard"),person("offer-finn","Finn Alder","scout")],party:["mara","rowan"],leader:"mara",route:"direct",approach:"balanced",supply:false,gold:2400,saved:[],rooms:{contracts:0,planning:0,infirmary:0,training:0,archive:0},roomJob:null};
  }
  function values(c){return c.base.map((v,i)=>v+(c.level-1)*types[c.type].growth[i]);}
  function forecast(s,mission){
    const party=s.members.filter(c=>s.party.includes(c.id));if(!party.length)return null;
    const leader=party.find(c=>c.id===s.leader)||party[0];
    // Calibrate against the contract's fixed required party, never the selected
    // headcount. The two-member reference preserves earlier two-member odds.
    const contributions=party.map(c=>({id:c.id,name:c.name,points:.6*values(c)[mission.primary]+.3*values(c)[mission.secondary]}));
    const leaderBonus=.1*mission.requiredMembers*values(leader)[3];
    const readiness=contributions.reduce((total,c)=>total+c.points,0)+leaderBonus;
    const adjustment=Math.max(-15,Math.min(35,20*(1-readiness/mission.statTarget)));
    const matching=party.filter(c=>types[c.type].hazard===mission.hazard).length;
    const signature=Math.min(12,matching*4),traits=Math.min(6,matching*2);
    const route={direct:[1,0,1],patrolled:[1.25,-6,.9],remote:[.8,8,1.15]}[s.route];
    const approach={cautious:[1.2,-6,.9],balanced:[1,0,1],bold:[.9,6,1.1]}[s.approach];
    const risk=Math.round(Math.max(5,Math.min(75,20+adjustment-signature-traits+route[1]+approach[1]-(s.supply?6:0)))*10)/10;
    const partial=Math.round(risk*.7*10)/10, failure=Math.round((risk-partial)*10)/10;
    return {risk,success:Math.round((100-risk)*10)/10,partial,failure,readiness,target:mission.statTarget,contributions,leaderBonus,leaderId:leader.id,adjustment,signature,traits,routeRisk:route[1],approachRisk:approach[1],hours:mission.hours*route[0]*approach[0],xp:mission.hours*20,food:Math.ceil(mission.hours*.01*120)+(s.supply?6:0),rewardFactor:route[2]*approach[2],recovery:Math.max(10,mission.hours*15*(1-s.rooms.infirmary*.07))};
  }
  return {types,stats,missions,facilities,roomCosts,initial,values,forecast};
})();
