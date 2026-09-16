"use strict";
// Fictional review data only. No game, network, account or storage modules.
const palette=["#684238","#596346","#4c6070","#79653f","#685975","#756047"];
const charges=["lion","oak-tree","wolf","stag","eagle","fortress-keep"];
const rulerNames=["Alden Greywatch","Mira Ashford","Edric Stone","Elowen Reed","Oswin Vale","Rowan Hawke","Ricmar","Isolde Fen","Cedric North","Maeve Thorn","Gareth Wells","Alys Wren"];
const houseNames=["Ironford Wardens","Oakwatch Company","House Redwyvern","Greywatch Covenant","The River Guard","Order of the Stag","Ashen Banner","Highland Oath","House Wren","The Stone Circle"];
const tags=["IRON","OAK","RED","GREY","RIV","STAG","ASH","HIGH","WREN","STONE"];
const mapNames=["Frostwolf March","Ashen Flats","Stoneveil Steppe","Emberwood","Crownlands Heart"];
function createRankFixtures(sample){
 const players=Array.from({length:100},(_,i)=>({rank:i+1,id:`ruler-${i}`,name:i<12?rulerNames[i]:`${rulerNames[i%12].split(" ")[0]} ${["Westmere","Oakfield","Dunford","Hillwatch","Reedhall","Flintbank","Woodmere","Greyhaven"][Math.floor(i/12)]||"Northwell"}`,tag:i%9===7?"":tags[i%tags.length],clan:houseNames[i%houseNames.length],region:mapNames[i%mapNames.length],cities:Math.max(3,76-Math.floor(i*.68)),power:Math.max(72000,48264000-i*2740000+Math.max(0,i-10)*2560000),age:i%3?`${2+i%9}m ago`:"Just now",color:palette[i%palette.length],charge:charges[i%charges.length],current:i===6&&sample!=="unranked"}));
 const clans=Array.from({length:100},(_,i)=>({rank:i+1,id:`clan-${i}`,name:i<10?houseNames[i]:`${["Northern","Eastern","Western","Southern","Old","Royal","River","Stone","Oak","High"][Math.floor(i/10)]} ${["Wardens","Fellowship","Oathkeepers","Guard","Company","Covenant","House","Order","Banner","Watch"][i%10]}`,tag:tags[i%tags.length],members:30-i%17,power:592480000-i*4770000,color:palette[(i+1)%palette.length],charge:charges[i%charges.length],current:i===3&&sample!=="unranked"}));
 if(sample==="long"){
  players[0].name="TheNorthernWarden";players[0].clan="Wardens of the Far North";players[0].region="The Northern Marches of Greywatch";players[0].cities=12048;players[0].power=987654321012;
  clans[0].name="Wardens of the Far North";clans[0].power=9876543210123;
 }
 return {players,clans};
}
