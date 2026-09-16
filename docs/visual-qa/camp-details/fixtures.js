"use strict";
// Current Core identity and packaged artwork. All personal state is synthetic.
const CAMP_DEFINITIONS=Object.freeze({
 gold:{id:'core-v2-gold-camp-north-east-p2-m2_gold_camp',region:'core-v2-gold-camp-north-east-p2-m2',map:'Gilded Moor',name:'Gold Camp',art:'assets/worlds/core-expansion-v1/art/camp-gold-d9ba98b26c61.webp',artDescription:'Gold Camp with a canvas shelter, wagon, coin table and supply barrels',icon:'assets/icons/royal-shop-gold-r1.svg',holdSeconds:600,limit:4,unit:'gold',minimums:[20000,40000,60000,80000],hours:[.5,1,1.5,2],rate:92480},
 troops:{id:'core-v2-warband-camp-m2-m2_troops_camp',region:'core-v2-warband-camp-m2-m2',map:'Frostwolf March',name:'Warband Camp',art:'assets/worlds/core-expansion-v1/art/camp-warband-2bb9352998c8.webp',artDescription:'Warband Camp with field tents and military supplies',icon:'assets/icons/daily-login-troops-r1.svg',holdSeconds:900,limit:4,unit:'troops',minimums:[10000,20000,30000,40000],hours:[.5,1,1.5,2],rate:46240},
 items:{id:'core-v2-relic-camp-north-west-m1-m2_items_camp',region:'core-v2-relic-camp-north-west-m1-m2',map:'Ravenscar',name:'Relic Camp',art:'assets/worlds/core-expansion-v1/art/camp-brightmere-6916ecf1850c.webp',artDescription:'Relic Camp with canvas tents and gathered supplies',icon:'assets/icons/reward-daily-quests-r1.svg',holdSeconds:1800,limit:5,unit:'item'},
 deed:{id:'core-v2-deed-camp-north-east-p1-m2_deed_camp',region:'core-v2-deed-camp-north-east-p1-m2',map:'Dawncrest',name:'Deed Camp',art:'assets/worlds/core-expansion-v1/art/camp-brambleford-59426d2cd404.webp',artDescription:'Deed Camp with a field pavilion and supplies',icon:'assets/icons/skills/guildCharters.svg',holdSeconds:3600,limit:1,unit:'city'}
});
const RELIC_DROPS=Object.freeze([
 {name:'War Drums',rarity:'Common',chance:35,art:'assets/optimized/item-war-drums-384x384-40892cafa303.webp'},
 {name:'Veil of Silence',rarity:'Common',chance:25,art:'assets/optimized/item-veil-of-silence-384x384-45fcf6e08b34.webp'},
 {name:'Swift March Order',rarity:'Uncommon',chance:18,art:'assets/optimized/item-swift-march-384x384-cbdfa5099ab0.webp'},
 {name:'Royal Tax Decree',rarity:'Uncommon',chance:12,art:'assets/optimized/item-royal-tax-decree-384x384-86d99a278ab1.webp'},
 {name:'Recall Horn',rarity:'Rare',chance:8,art:'assets/optimized/item-recall-horn-384x384-66b7bde99a6d.webp'},
 {name:'Royal Peace Shield',rarity:'Legendary',chance:2,art:'assets/optimized/item-peace-shield-384x384-c74d2eb2f8ac.webp'}
]);
const CAMP_GEAR_BOX_ART='assets/icons/common-gear-chest-r1.svg';
// Fictional city awards; location buttons only open a local explanation.
const DEED_HISTORY=Object.freeze(['Briarford','Stonebridge','Elmswatch','Ravenford','Ashenfield','Fairhaven','Oakrest','Westmere','Dunholt','Kingscross'].map((name,i)=>({name,map:['Dawncrest','Kingsbridge','Thornmere','Brambleford'][i%4],at:`${String(15-i).padStart(2,'0')} Sep 2026 · 14:20 UTC`})));
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
function campFixture(key, campKey) {
 const camp=CAMP_DEFINITIONS[campKey], base=CAMP_SAMPLES[key] || CAMP_SAMPLES.owned;
 const f={...base,seconds:Math.round(base.seconds*camp.holdSeconds/600),rate:key==='long'?234567890:camp.rate};
 if(!f.rewardStatus)f.claimed=key==='complete'?camp.limit:campKey==='deed'?0:campKey==='items'?(key==='neutral'?0:2):base.claimed;
 if(key==='reserved'&&campKey==='deed')Object.assign(f,{owner:'Neutral',owned:false,neutral:true,seconds:0,troops:null,claimed:1,reserved:true,support:[]});
 if(key.startsWith('history-')&&campKey==='deed')f.historyStatus=key.slice(8);
 return f;
}
