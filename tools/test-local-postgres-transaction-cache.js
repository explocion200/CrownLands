"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const {Store}=require("../local-backend/store");
const timing=require("../functions/operation-timing");
(async()=>{
 const db=new Store({schema:"migration_store_"+crypto.randomBytes(6).toString("hex")});
 try{
  await db.initialize();const a=db.doc("accounts/a"),b=db.doc("accounts/b"),missing=db.doc("accounts/missing");
  await a.set({balance:10,nested:{value:1}});await b.set({balance:20});
  const metrics=await timing.run(async()=>{await db.runTransaction(async tx=>{
   const [first,second]=await Promise.all([tx.get(a),tx.get(a)]);
   assert.equal(timing.snapshot().dbReadQueries,1,"Concurrent document reads were not coalesced");
   first.data().nested.value=99;assert.equal(second.data().nested.value,1);
   await tx.get(missing);assert.equal((await tx.get(missing)).exists,false);
   const count=timing.snapshot().dbReadQueries;
   const snaps=await tx.getAll(a,b,a,missing);assert.deepEqual(snaps.map(s=>s.id),["a","b","a","missing"]);
   assert.equal(timing.snapshot().dbReadQueries,count+1);
   assert.equal((await tx.get(b)).data().balance,20);
   assert.equal(timing.snapshot().dbReadQueries,count+1,"getAll must seed direct reads");
   // Queries retain predicate/phantom protection and execute on every call.
   await tx.get(db.collection("accounts"));await tx.get(db.collection("accounts"));
   assert.equal(timing.snapshot().dbReadQueries,count+3);
   tx.update(a,{balance:11});assert.throws(()=>tx.get(a),/precede writes/);
   assert.throws(()=>tx.getAll(a),/precede writes/);assert.deepEqual(await tx.getAll(),[]);
  });return timing.snapshot();});
  assert(metrics.dbDocumentCacheHits>=5);
  await timing.run(()=>db.runTransaction(async tx=>{
   const [batch,direct]=await Promise.all([tx.getAll(a,b,a),tx.get(b)]);
   assert.equal(timing.snapshot().dbReadQueries,1,"A batch and concurrent direct read must share one query");
   assert.deepEqual(batch.map(s=>s.id),["a","b","a"]);assert.equal(direct.data().balance,20);
   const refs=[a,...Array.from({length:998},(_,i)=>db.doc("batch_missing/"+i)),a];
   const large=await tx.getAll(...refs);
   assert.equal(timing.snapshot().dbReadQueries,2,"Uncached batch references must use one statement");
   assert.equal(large.length,1000);assert.equal(large[0].data().balance,11);assert.equal(large.at(-1).data().balance,11);
   assert(large.slice(1,-1).every(s=>!s.exists));assert.equal(tx.documents.size,128);
   const count=timing.snapshot().dbReadQueries;
   await assert.rejects(tx.getAll(...refs,a),/Too many/);
   await assert.rejects(tx.getAll(a,null),/Foreign/);
   await assert.rejects(tx.getAll(db.collection("accounts")),/Foreign/);
   assert.equal(timing.snapshot().dbReadQueries,count,"Invalid batches must not issue partial reads");
  }));
  // A retry gets a new snapshot; no promise from the failed attempt survives.
  let attempts=0;const seen=[];
  await db.runTransaction(async tx=>{attempts++;const first=await tx.get(a);seen.push(first.data().balance);
   if(attempts===1)await a.update({balance:30});
   assert.equal((await tx.get(a)).data().balance,first.data().balance);
   tx.update(a,{balance:first.data().balance+1});
  });
  assert.equal(attempts,2);assert.deepEqual(seen,[11,30]);assert.equal((await a.get()).data().balance,31);
  // Never reuse document values in a READ COMMITTED blind-batch transaction.
  await db._runTransaction(async tx=>{const first=await tx.get(a);await a.update({balance:40});assert.equal(first.data().balance,31);assert.equal((await tx.get(a)).data().balance,40);},undefined,"READ COMMITTED");
  await db._runTransaction(async tx=>{assert.equal((await tx.getAll(a))[0].data().balance,40);await a.update({balance:41});assert.equal((await tx.getAll(a))[0].data().balance,41);assert.equal(tx.documents.size,0);},undefined,"READ COMMITTED");
  await a.update({balance:40});
  await db.runTransaction(async tx=>{
   for(let i=0;i<1005;i++)await tx.get(db.doc("missing/"+i));
   assert(tx.documents.size<=128);assert.equal((await tx.get(a)).data().balance,40);
   const foreign=new Store({schema:db.schema,pool:db.pool});await assert.rejects(async()=>tx.get(foreign.doc(a.path)),/Foreign/);
  });
  console.log("Transaction cache: same-snapshot coalescing, independent values, missing docs, mixed batches, uncached queries, write guards, retry freshness, READ COMMITTED exclusion and 128-entry bound passed.");
 }finally{await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`);await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
