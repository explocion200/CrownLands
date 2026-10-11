"use strict";
// Disposable loopback fixture. Uses the production rules and UI, never Firebase.
const crypto=require("node:crypto");
const fs=require("node:fs"),path=require("node:path");
const {createServer:staticServer}=require("./estate-building-ui-preview");
const E=require("../functions/estate-economy"),S=require("../functions/estate-services"),M=require("../functions/guild-missions"),F=require("../functions/guild-facilities"),C=require("../guild-config");
function fixture(){
  let now=Date.now(),gold=2500000;
  const state=E.initial(now),champions={},privateResults={},reports={},quotes=new Map(),receipts=new Map();
  Object.keys(state.levels).forEach(k=>state.levels[k]=75);E.KEYS.forEach(k=>state.stock[k]=10000);
  const realm={resetGeneration:"qa-season",worldId:"qa-realm",realmShardId:"qa-shard",mainCityPath:"qa/main",endsAtMs:now+20*86400000,goldRate:285,troopRate:100};
  Object.keys(C.types).forEach((type,i)=>{const face=C.portraits.find(p=>p.type===type),id="qa-champion-"+i;champions[id]={id,name:face.name,type,portraitId:face.id,base:[...C.types[type].base],trait:Object.keys(C.traits)[i%6],quality:0,level:i===0?15:3,xp:0,questId:"",recoveryUntilMs:0,guildVersion:2,protectedCeiling:20,history:[],matchingSuccesses:0,ambitions:[]};});
  state.activeChampionIds=Object.keys(champions);
  state.recruitOffers={day:S.utcDay(now),offers:S.offers(state,now,285)};
  M.migrate(state,champions);state.guild.rooms.training=1;
  state.guild.reputation=10;state.guild.clientReputation["Miller's Caravan"]=10;
  const snapshot=()=>{E.settle(state,now);F.settle(state,now);M.settle(state,champions,privateResults,now,realm).forEach(r=>reports[r.reportId]=r);return {gold,estate:E.snapshot(state,now),champions,guildCatalogue:M.catalogue(state),guildOverview:F.overview(state,285),guildContext:{...realm,materialRates:Object.fromEntries(E.KEYS.map(k=>[k,E.quoteRate(state,k)]))},serverNowMs:now,upgradeOverview:E.upgradeOverview(state,gold,285)};};
  function quote(input){snapshot();let value;switch(input.action){
    case "guildMission":value=M.quote(state,input,champions,now,realm);break;
    case "guildRoom":value=F.roomQuote(state,input.room,285);break;
    case "guildParty":value=F.partyQuote(state,input,champions);break;
    case "guildMentor":value=F.mentoringQuote(state,input,champions,now);break;
    case "guildClaim":value=M.claimQuote(state,input.rewardId,realm,true,now);break;
    case "roster":value=input;break;
    case "recruit":value={...state.recruitOffers.offers.find(o=>o.id===input.offerId),action:"recruit",offerId:input.offerId,gold:57};break;
    default:throw Error("Unsupported preview action.");
  }const result={id:crypto.randomUUID(),value,input};quotes.set(result.id,result);return {...snapshot(),quote:result};}
  function commit(input){if(receipts.has(input.requestId))return {...snapshot(),replayed:true};const q=quotes.get(input.quoteId);if(!q)throw Error("Review a fresh quote.");const v=q.value;if(v.gold>gold)throw Error("Not enough Gold.");switch(v.action){
    case "guildMission":M.launch(state,v,input.requestId,champions,now);privateResults[input.requestId]=M.resolve(v,()=>0);break;
    case "guildRoom":F.startRoom(state,v,input.requestId,now);gold-=v.gold;break;
    case "guildParty":F.saveParty(state,v,input.requestId);break;
    case "guildMentor":F.assignMentor(state,v);break;
    case "guildClaim":gold+=v.received.gold;M.claim(state,v);break;
    case "roster":state.activeChampionIds=v.active?[...state.activeChampionIds,v.championId]:state.activeChampionIds.filter(id=>id!==v.championId);break;
    case "recruit":{const id=input.requestId;champions[id]={...v,id,xp:0,questId:"",recoveryUntilMs:0};state.activeChampionIds.push(id);state.recruitOffers.offers.find(o=>o.id===v.offerId).claimed=true;gold-=v.gold;break;}
  }state.revision++;receipts.set(input.requestId,true);return snapshot();}
  return {snapshot,quote,commit,advance(ms){now+=ms;return snapshot();},bench:()=>({champions:Object.values(champions),nextCursor:""}),reports(input){return input.reportId?{report:reports[input.reportId]}:{reports:Object.values(reports).reverse(),nextCursor:""};}};
}
function createServer({built=false}={}){let data=fixture();const server=staticServer({built}),base=server.listeners("request")[0];server.removeAllListeners("request");server.on("request",async(req,res)=>{
  const url=new URL(req.url,"http://127.0.0.1");
  if(["/docs/visual-qa/guild-master/production.html","/docs/visual-qa/guild-master/production.js"].includes(url.pathname)){
    if(url.pathname.endsWith(".html")&&url.searchParams.get("gameStyles")==="1"){
      // Review the real game's stylesheet cascade without connecting to Firebase.
      const root=path.resolve(__dirname,".."),directory=built?path.join(root,"dist"):root;
      const game=fs.readFileSync(path.join(directory,"index.html"),"utf8");
      const links=(game.match(/<link\b[^>]*>/g)||[])
        .filter(tag=>/rel="stylesheet"/.test(tag)||/data-optional-ui-style="(?:guild|estate-economy)"/.test(tag))
        .filter(tag=>!/(?:href=")https?:/.test(tag)).map(tag=>tag.replace('rel="crownlands-optional-stylesheet"','rel="stylesheet"')).join("\n");
      const html=fs.readFileSync(path.join(root,"docs/visual-qa/guild-master/production.html"),"utf8")
        .replace(/<link rel="stylesheet"[^>]*>/g,"").replace("</head>",links+"</head>").replace("<body>",game.match(/<body\b[^>]*>/)?.[0]||"<body>");
      res.writeHead(200,{"Content-Type":"text/html","Cache-Control":"no-store"}).end(html);return;
    }
    res.writeHead(200,{"Content-Type":url.pathname.endsWith(".html")?"text/html":"application/javascript","Cache-Control":"no-store"});fs.createReadStream(path.resolve(__dirname,"..","."+url.pathname)).pipe(res);return;
  }
  if(!url.pathname.startsWith("/guild-qa/")){base(req,res);return;}
  try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=chunks.length?JSON.parse(Buffer.concat(chunks)):{};let result;switch(url.pathname){
    case "/guild-qa/state":result=data.snapshot();break;case "/guild-qa/quote":result=data.quote(input);break;case "/guild-qa/commit":result=data.commit(input);break;
    case "/guild-qa/champions":result=data.bench();break;case "/guild-qa/reports":result=data.reports(input);break;
    case "/guild-qa/advance":result=data.advance(input.ms);break;case "/guild-qa/reset":data=fixture();result=data.snapshot();break;
    default:throw Error("Unknown fixture route.");
  }res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"}).end(JSON.stringify(result));}
  catch(error){res.writeHead(200,{"Content-Type":"application/json"}).end(JSON.stringify({fixtureError:error.message}));}
 });return server;}
if(require.main===module)createServer().listen(Number(process.env.PORT)||8892,"127.0.0.1",()=>console.log("Guild production UI preview: http://127.0.0.1:"+(process.env.PORT||8892)+"/docs/visual-qa/guild-master/production.html"));
module.exports={createServer,fixture};
