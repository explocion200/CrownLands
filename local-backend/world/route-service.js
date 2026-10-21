"use strict";
const {Worker}=require("node:worker_threads");
const path=require("node:path");
function createRouteService(geometry) {
  let worker,closed=false,sequence=0;const pending=new Map(),cache=new Map();
  const rejectAll=expected=>{if(expected&&worker!==expected)return;for(const p of pending.values()){clearTimeout(p.timer);p.resolve({status:"unavailable"});}pending.clear();worker=null;};
  function start(){const current=worker=new Worker(path.join(__dirname,"route-worker.js"),{workerData:geometry});current.on("error",()=>rejectAll(current));current.on("exit",()=>rejectAll(current));
    current.on("message",({id,result})=>{if(worker!==current)return;const p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);if(result.status==="ok"){cache.set(p.key,result);while(cache.size>128)cache.delete(cache.keys().next().value);}p.resolve(structuredClone(result));});}
  return {async route(from,to){
    if(closed)return {status:"unavailable"};const key=JSON.stringify([from,to]);if(cache.has(key))return structuredClone(cache.get(key));
    if(pending.size>=4)return {status:"busy"};if(!worker)start();const id=++sequence;
    return new Promise(resolve=>{const timer=setTimeout(()=>{void worker?.terminate();rejectAll();},4000);timer.unref();pending.set(id,{resolve,timer,key});worker.postMessage({id,from,to});});
  },stats:()=>({pending:pending.size,cached:cache.size}),async close(){closed=true;const old=worker;rejectAll();cache.clear();await old?.terminate();}};
}
module.exports={createRouteService};
