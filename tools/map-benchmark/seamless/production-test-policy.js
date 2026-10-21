"use strict";
// Model the protected activation SQL only inside a disposable test pool. Real
// role/epoch enforcement is covered separately by test-local-postgres-permanent.
const assert = require("node:assert/strict");
function productionTestPolicy(store) {
  assert.match(store.schema,/^migration_game_worldtest_[a-f0-9]{12}$/);
  const epoch="f".repeat(32), control={version:1,phase:"active",epoch};
  const assertion="SELECT crownlands_control.assert_active($1)", wrapped=Symbol("activation fixture");
  const connect=store.pool.connect.bind(store.pool);
  function decorate(client){
    if(!client[wrapped]){const query=client.query.bind(client);client[wrapped]=true;
      client.query=(sql,values,...rest)=>sql===assertion
        ? (assert.equal(values[0],epoch),Promise.resolve({rowCount:1,rows:[]})) : query(sql,values,...rest);
    }
    return client;
  }
  store.pool.connect=function(callback){
    return typeof callback==="function"?connect((error,client,release)=>callback(error,client&&decorate(client),release)):connect().then(decorate);
  };
  return require("../../../local-backend/deployment-policy").createPolicy({store:{schema:store.schema,pool:{query:async(sql,values)=>{assert.equal(sql,assertion);assert.equal(values[0],epoch);return {rowCount:1};}}},epoch,read:()=>control});
}
module.exports={productionTestPolicy};
