"use strict";
// Loopback-only, disposable estate data for visual review. No Firebase calls.
const fs = require("node:fs"), http = require("node:http"), path = require("node:path");
const E = require("../functions/estate-economy"), S = require("../functions/estate-services");
const root = path.resolve(__dirname,"..");
function fixture(profile = "ready", key = "sawmill") {
  const now = Date.now(), state = E.initial(now);
  for (const name of Object.keys(state.levels)) state.levels[name] = profile === "maximum" ? 100 : 24;
  state.levels["great-hall"] = profile === "maximum" ? 100 : 25;
  for (const material of E.KEYS) state.stock[material] = Math.floor(E.capacity(state,material) * .7);
  if (profile === "missing") state.stock.stone = state.stock.timber = state.stock.ore = state.stock.planks = 1;
  if (profile === "unbuilt") state.levels[key] = 0;
  if (profile === "blocked") state.levels["great-hall"] = 24;
  if (profile === "working") {
    const producer = E.C.producers.find(p=>p.building===key);
    if (producer && Object.keys(producer.inputs).length) {
      const q = E.productionQuote(state,key,40);
      E.startProduction(state,q,"preview-production",now - q.durationMs * .3);
    }
    const job = E.constructionQuote(state,key,1,285).jobs[0];
    state.jobs = [{...job,id:"preview-project",building:key,status:"running",startedAtMs:now-job.durationMs*.3,completesAtMs:now+job.durationMs*.7}];
  }
  const names = ["Rowan Ashford","Elin Marsh","Gareth Vale"], champions = {};
  names.forEach((name,i)=>{
    const id="preview-champion-"+i;
    champions[id]={id,name,quality:i===2?0:1,level:12+i*3,xp:12+i*4,questId:"",recoveryUntilMs:i===2?now+1800000:0};
  });
  state.activeChampionIds=Object.keys(champions);
  state.recruitOffers={day:S.utcDay(now),offers:S.offers(state,now,285).map((offer,i)=>({...offer,name:names[i]}))};
  state.parcels=[{id:"preview-parcel",rewards:{stone:120,timber:80},createdAtMs:now}];
  const snapshot=()=>({estate:E.snapshot(state,Date.now()),champions,serverNowMs:Date.now(),gold:2500000,upgradeOverview:E.upgradeOverview(state,2500000,285)});
  const quote = input => {
    let value;
    if(input.action==="fund")value=E.constructionQuote(state,input.building,1,285);
    else if(input.action==="produce")value=E.productionQuote(state,input.building,input.quantity);
    else if(input.action==="commission")value=S.commissionQuote(state,input.building,input.family);
    else if(input.action==="supply")value=S.supplyQuote(state,input.resource,input.hours,Date.now());
    else if(input.action==="quest")value=S.questQuote(state,input,champions,Date.now());
    else if(input.action==="recruit") {const o=state.recruitOffers.offers.find(o=>o.id===input.offerId);value={action:input.action,...o};}
    else if(input.action==="claimParcel")value={action:input.action,received:state.parcels.find(p=>p.id===input.parcelId)?.rewards};
    else value={...input};
    return {...snapshot(),quote:{id:"preview-quote",value,input}};
  };
  return {snapshot,quote};
}
function createServer({built = false} = {}) {
  let data=fixture();
  const server=http.createServer(async (req,res)=>{
    try {
      const url=new URL(req.url,"http://127.0.0.1");
      if(url.pathname==="/building-ui-fixture") {data=fixture(url.searchParams.get("profile")||"ready",url.searchParams.get("building")||"sawmill");res.setHeader("Content-Type","application/json");res.end(JSON.stringify(data.snapshot()));return;}
      if(url.pathname==="/building-ui-quote") {const chunks=[];for await(const chunk of req)chunks.push(chunk);res.setHeader("Content-Type","application/json");res.end(JSON.stringify(data.quote(JSON.parse(Buffer.concat(chunks)))));return;}
      const requested=url.pathname==="/"?"/docs/visual-qa/estate-building-ui/index.html":decodeURIComponent(url.pathname);
      const directory=built&&!requested.startsWith("/docs/visual-qa/estate-building-ui/")?path.join(root,"dist"):root;
      const f=path.resolve(directory,"."+requested);
      if(!f.startsWith(directory+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404).end();return;}
      const types={".html":"text/html",".js":"application/javascript",".css":"text/css",".webp":"image/webp",".woff2":"font/woff2",".json":"application/json"};
      res.writeHead(200,{"Content-Type":types[path.extname(f)]||"application/octet-stream","Cache-Control":"no-store"});fs.createReadStream(f).pipe(res);
    }catch(error){res.writeHead(400,{"Content-Type":"application/json"}).end(JSON.stringify({error:error.message}));}
  });
  return server;
}
if(require.main===module){const server=createServer();server.listen(Number(process.argv[2])||8890,"127.0.0.1",()=>console.log("Building UI preview at http://127.0.0.1:"+server.address().port));}
module.exports={fixture,createServer};
