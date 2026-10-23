#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {Store}=require("../local-backend/store"),{createHistoryRun,historyBatch,prepareHistoryIndexes}=require("../local-backend/history-retention");
async function main(args=process.argv.slice(2)) {
  const options={schema:"migration_game_live",apply:false,batches:20,seconds:20};
  const fields={"--schema":"schema","--confirm-schema":"confirm","--checkpoint":"checkpoint","--resume":"resume","--max-batches":"batches","--seconds":"seconds"};
  for(let i=0;i<args.length;i++) {
    if(args[i]==="--apply")options.apply=true;
    else if(args[i]==="--prepare-indexes")options.prepare=true;
    else if(fields[args[i]] && args[i+1] && !args[i+1].startsWith("--"))options[fields[args[i]]]=args[++i];
    else throw Error("Use --schema, --checkpoint/--resume, --max-batches, --seconds; --apply or --prepare-indexes also requires --confirm-schema.");
  }
  options.batches=Number(options.batches);options.seconds=Number(options.seconds);
  if(!/^migration_game_[a-z0-9_]{1,30}$/.test(options.schema)||!Number.isInteger(options.batches)||options.batches<1||options.batches>10000
    ||!Number.isInteger(options.seconds)||options.seconds<1||options.seconds>60||options.resume&&options.checkpoint)throw Error("Invalid maintenance options.");
  if(options.prepare&&(options.apply||options.resume||options.checkpoint))throw Error("Index preparation is separate from dry-run/apply checkpoints.");
  if((options.apply||options.prepare)&&options.confirm!==options.schema)throw Error("Apply or index preparation requires --confirm-schema matching --schema. Live index preparation and deletion each require their applicable owner approval.");
  const checkpoint=path.resolve(options.resume||options.checkpoint||`release-artifacts/history-retention/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.json`);
  const store=new Store({schema:options.schema}),controller=new AbortController();
  const stop=()=>controller.abort();
  // Index setup keeps normal process cancellation; it is separate from the
  // short cleanup transactions that must finish/roll back before exit.
  if(!options.prepare){process.once("SIGINT",stop);process.once("SIGTERM",stop);}
  try {
    if(options.prepare){await prepareHistoryIndexes(store.pool,options.schema);console.log(JSON.stringify({indexesReady:true,schema:options.schema,deleted:0}));return;}
    let state=options.resume?JSON.parse(fs.readFileSync(checkpoint,"utf8")):await createHistoryRun(store,{apply:options.apply});
    if(!options.resume){fs.mkdirSync(path.dirname(checkpoint),{recursive:true});fs.writeFileSync(checkpoint,JSON.stringify(state,null,2)+"\n",{flag:"wx",mode:0o600});}
    const start=Date.now();
    for(let batch=0;batch<options.batches&&Date.now()-start<options.seconds*1000&&state.phase!=="done";batch++) {
      state=await historyBatch(store,state,{apply:options.apply,signal:controller.signal});
      const temporary=checkpoint+".tmp-"+process.pid;
      fs.writeFileSync(temporary,JSON.stringify(state,null,2)+"\n",{flag:"wx",mode:0o600});fs.renameSync(temporary,checkpoint);
      console.log(JSON.stringify({mode:options.apply?"apply":"dry-run",phase:state.phase,progress:state.progress}));
    }
    console.log(JSON.stringify({complete:state.phase==="done",checkpoint,cutoff:state.cutoff,progress:state.progress,
      note:"Estimates cover stored debug payloads, not immediately reclaimable file space. No primary game documents are modified. Resume incomplete scans; a fresh pass catches later eligibility."}));
    return state;
  } finally {process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);await store.close();}
}
if(require.main===module)main().catch(error=>{console.error(error.code==="history-maintenance-stopped"?error.message:"History maintenance stopped. Check arguments, permissions, pressure, indexes and the checkpoint. A checkpoint-write failure may follow a committed batch; resume safely and verify with a fresh dry run. No automatic retry was attempted.");process.exitCode=1;});
module.exports={main};
