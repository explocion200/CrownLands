"use strict";
const { createPlatform, HttpsError } = require("./platform");
const { createGoogleProvider } = require("../functions/chat-translation");
const { JWT } = require("google-auth-library");
const { isPolicy, GAME } = require("./deployment-policy");
let configured;
const NAMES = ['LINKED_ACCOUNT_IP_HMAC_KEY','STRIPE_CROWNS_TEST_SECRET_KEY','STRIPE_CROWNS_LIVE_SECRET_KEY'];
function configure({ store, config, deployment }) {
  if(configured || store.schema!==GAME || !isPolicy(deployment,GAME) || !deployment.isActive())throw Error('Permanent game activation required');
  const secrets=config.secrets || {};
  if(Object.keys(secrets).some(k=>!NAMES.includes(k)) || Object.values(secrets).some(v=>typeof v!=='string'||v.length<16||v.length>4096))throw Error('Invalid runtime credentials');
  const base=createPlatform({store,secrets:secrets.LINKED_ACCOUNT_IP_HMAC_KEY?{LINKED_ACCOUNT_IP_HMAC_KEY:secrets.LINKED_ACCOUNT_IP_HMAC_KEY}:{}});
  let translation;
  if(config.translation) {
    const sa=config.translation;
    if(sa.type!=='service_account'||sa.project_id!=='crown-land-b15e0'||sa.client_email!=='crownlands-local-translation@crown-land-b15e0.iam.gserviceaccount.com'
      ||sa.token_uri!=='https://oauth2.googleapis.com/token'||typeof sa.private_key!=='string')throw Error('Translation-only identity required');
    const jwt=new JWT({email:sa.client_email,key:sa.private_key,keyId:sa.private_key_id,scopes:['https://www.googleapis.com/auth/cloud-translation']});
    const transport=jwt.transporter;
    jwt.transporter={request:options=>{if(String(options.url)!=='https://oauth2.googleapis.com/token'||options.method!=='POST'||!deployment.isActive())throw Error('Translation paused');
      return transport.request({...options,timeout:8000,retry:false,maxRedirects:0,signal:AbortSignal.timeout(8000)});}};
    const google=createGoogleProvider({projectId:sa.project_id,credential:{getAccessToken:async()=>{await deployment.assertActive();const r=await jwt.getAccessToken();await deployment.assertActive();return {access_token:r.token};}},
      fetchImpl:async(url,options)=>{await deployment.assertActive();if(!/^https:\/\/translation\.googleapis\.com\/v3\/projects\/crown-land-b15e0\/locations\/global:(detectLanguage|translateText)$/.test(url))throw Error('Unexpected translation destination');return fetch(url,{...options,redirect:'error'});}});
    // The normal game service retains its imported shared monthly usage ledger.
    translation=async(...args)=>{await deployment.assertActive();const result=await google(...args);await deployment.assertActive();return result;};
  }
  configured=Object.freeze({...base,backend:'postgres-local',chatTranslationProvider:translation,
    defineSecret:name=>({value:()=>{if(!deployment.isActive()||!Object.hasOwn(secrets,name))throw new HttpsError('unavailable','This service is not configured.');return secrets[name];}})});
  return configured;
}
function load(){if(!configured)throw Error('Permanent runtime must be configured explicitly');return configured;}
module.exports={configure,load};
