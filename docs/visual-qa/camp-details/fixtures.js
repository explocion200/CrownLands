"use strict";
// Current Core identity and packaged artwork. All personal state is synthetic.
const GOLD_CAMP=Object.freeze({id:'core-v2-gold-camp-north-east-p2-m2_gold_camp',region:'core-v2-gold-camp-north-east-p2-m2',map:'Gilded Moor',name:'Gold Camp',art:'assets/worlds/core-expansion-v1/art/camp-gold-d9ba98b26c61.webp',holdSeconds:600,minimums:[20000,40000,60000,80000],hours:[.5,1,1.5,2]});
const CAMP_SAMPLES=Object.freeze({
 owned:{owner:'Aldric of Greenrook',owned:true,seconds:402,troops:57000,source:'Live holder stats',claimed:1,rate:92480,support:[{name:'Lady Elowen',troops:8500,action:'Send Home',origin:'Briarford'}]},
 neutral:{owner:'Neutral',neutral:true,seconds:0,troops:null,claimed:0,rate:92480},
 enemy:{owner:'Lord Rowan',seconds:284,troops:null,claimed:1,rate:92480},
 scouted:{owner:'Lord Rowan',seconds:284,troops:68400,source:'Scout report snapshot',expiry:'12m 18s',claimed:1,rate:92480},
 ally:{owner:'Lady Elowen',ally:true,seconds:316,troops:null,claimed:1,rate:92480,support:[{name:'Your troops',troops:6200,action:'Recall',origin:'Greenrook'}]},
 complete:{owner:'Aldric of Greenrook',owned:true,seconds:402,troops:57000,source:'Live holder stats',claimed:4,rate:92480},
 payout:{owner:'Aldric of Greenrook',owned:true,seconds:0,troops:57000,source:'Live holder stats',claimed:1,rate:92480,payout:true},
 loading:{owner:'Aldric of Greenrook',owned:true,seconds:402,troops:57000,source:'Live holder stats',rewardStatus:'loading'},
 error:{owner:'Aldric of Greenrook',owned:true,seconds:402,troops:57000,source:'Live holder stats',rewardStatus:'error'},
 long:{owner:'Aldric of the Greenrook Northern Marches',owned:true,seconds:402,troops:124567890,source:'Live holder stats',claimed:2,rate:234567890,support:[{name:'Elowen of the Far Northern Watch',troops:8500000,action:'Send Home',origin:'Briarford on the Northern Road'}]}
});
