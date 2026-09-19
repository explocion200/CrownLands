"use strict";
const assert = require("node:assert/strict");
const { createGoogleProvider, validatePayload, cacheKey, MONTHLY_CHARACTER_LIMIT } = require("../functions/chat-translation");
const fail = (code, message) => Object.assign(new Error(message), { code });
async function main() {
  const valid = { channel: "global", messageIds: ["a".repeat(40)], targetLanguage: "es" };
  assert.equal(validatePayload(valid, fail).targetLanguage, "es");
  for (const change of [{text:"injected"},{channel:"other"},{messageIds:["../private"]},{messageIds:[]},
    {messageIds:Array(21).fill("a".repeat(40))},{messageIds:["a".repeat(40),"a".repeat(40)]},{targetLanguage:"../../x"},{clanId:"a/b"}]) {
    assert.throws(() => validatePayload({...valid,...change},fail), error => error.code === "invalid-argument");
  }
  assert.equal(MONTHLY_CHARACTER_LIMIT, 500000);
  assert.notEqual(cacheKey("clan/a","Hello","es"),cacheKey("clan/b","Hello","es"));
  assert.notEqual(cacheKey("clan/a","Hello","es"),cacheKey("clan/a","Changed","es"));
  let calls=0;
  const credential={getAccessToken:async()=>({access_token:"unit-test-only"})};
  const provider=createGoogleProvider({projectId:"test-project",credential,fetchImpl:async(url,options)=>{
    calls++;
    assert.equal(url,"https://translation.googleapis.com/v3/projects/test-project/locations/global:translateText");
    assert.equal(options.headers.authorization,"Bearer unit-test-only");
    assert.deepEqual(JSON.parse(options.body),{contents:["<hello>","Hi"],targetLanguageCode:"es",mimeType:"text/plain",model:"projects/test-project/locations/global/models/general/nmt"});
    assert(options.signal instanceof AbortSignal);
    return {ok:true,json:async()=>({translations:[{translatedText:"<hola>"},{translatedText:"Hola"}]})};
  }});
  assert.deepEqual(await provider(["<hello>","Hi"],"es"),["<hola>","Hola"]);
  assert.equal(calls,1);
  for(const response of [{ok:false,status:403},{ok:true,json:async()=>({translations:[]})},{ok:true,json:async()=>({translations:[{translatedText:""}]})}]) {
    await assert.rejects(createGoogleProvider({projectId:"test-project",credential,fetchImpl:async()=>response})(["Hi"],"es"));
  }
  await assert.rejects(createGoogleProvider({projectId:"test-project",credential,emulator:true,fetchImpl:()=>{throw Error("Must not call network");}})(["Hi"],"es"),/disabled in emulators/);
  console.log("Google chat translation provider: payload limits, cache scope, plain text, NMT endpoint, response validation and emulator isolation passed.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
