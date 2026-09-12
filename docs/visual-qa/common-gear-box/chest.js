"use strict";
// Original, code-native oak-and-iron illustration. The lid rotates about its actual back hinge.
function createIllustratedChest(host){
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox","0 0 500 390");svg.setAttribute("role","img");svg.setAttribute("aria-label","Oak equipment chest with iron bands and a hinged wooden lid");
  svg.innerHTML='<defs><radialGradient id="chestShadow"><stop stop-color="#40351f" stop-opacity=".22"/><stop offset="1" stop-color="#40351f" stop-opacity="0"/></radialGradient></defs><ellipse cx="252" cy="337" rx="215" ry="42" fill="url(#chestShadow)"/>';
  const body=document.createElementNS(ns,"g"),lid=document.createElementNS(ns,"g");lid.setAttribute("class","chest-lid");svg.append(body,lid);host.append(svg);
  const project=([x,y,z])=>[244+x*140+y*80,312+x*22-y*44-z*105];
  const point=p=>project(p).map(v=>v.toFixed(2)).join(",");
  function poly(group,points,fill,stroke="#3b3426",width=1.6){const e=document.createElementNS(ns,"polygon");e.setAttribute("points",points.map(point).join(" "));e.setAttribute("fill",fill);e.setAttribute("stroke",stroke);e.setAttribute("stroke-width",width);e.setAttribute("stroke-linejoin","round");group.append(e);return e;}
  function line(group,points,color="#55432b",width=1){const e=document.createElementNS(ns,"polyline");e.setAttribute("points",points.map(point).join(" "));e.setAttribute("fill","none");e.setAttribute("stroke",color);e.setAttribute("stroke-width",width);e.setAttribute("stroke-linecap","round");e.setAttribute("stroke-linejoin","round");group.append(e);return e;}
  function rivet(group,p,r=2.1){const[x,y]=project(p),e=document.createElementNS(ns,"circle");e.setAttribute("cx",x);e.setAttribute("cy",y);e.setAttribute("r",r);e.setAttribute("fill","#b1a280");e.setAttribute("stroke","#3d3c2e");e.setAttribute("stroke-width","1");group.append(e);}
  poly(body,[[-1,-.5,.07],[1,-.5,.07],[1,-.5,1.03],[-1,-.5,1.03]],"#aa8349");
  poly(body,[[1,-.5,.07],[1,.5,.07],[1,.5,1.03],[1,-.5,1.03]],"#786442");
  poly(body,[[-1,-.5,1.03],[1,-.5,1.03],[1,.5,1.03],[-1,.5,1.03]],"#c0a06a");
  poly(body,[[-.9,-.41,1.045],[.9,-.41,1.045],[.9,.41,1.045],[-.9,.41,1.045]],"#332d22");
  poly(body,[[-.9,-.41,1.049],[.9,-.41,1.049],[.75,-.23,1.052],[-.7,-.23,1.052]],"#65573b","none");
  for(let z=.26;z<1;z+=.23){line(body,[[-.98,-.507,z],[1,-.507,z],[1,.49,z]],"#695232",1.4);line(body,[[-.93,-.51,z+.025],[.95,-.51,z+.025]],"#d3b17a",.9);}
  for(let i=0;i<20;i++){const x=-.96+(i*37%100)/53,z=.13+(i*17%79)/100;line(body,[[x,-.513,z],[Math.min(.95,x+.1),-.513,z+.012],[Math.min(.97,x+.25),-.513,z+.004]],i%3?"#775932":"#d1ad73",.65);}
  for(const x of[-.65,.65]){poly(body,[[x-.065,-.525,.08],[x+.065,-.525,.08],[x+.065,-.525,1.04],[x-.065,-.525,1.04]],"#6b6d57");line(body,[[x-.041,-.53,.13],[x-.041,-.53,.99]],"#a8a58a",1.3);for(const z of[.16,.55,.96])rivet(body,[x,-.53,z]);}
  for(const z of[.13,.94]){poly(body,[[1.01,-.49,z-.035],[1.01,.49,z-.035],[1.01,.49,z+.035],[1.01,-.49,z+.035]],"#60614d");for(const y of[-.4,.4])rivet(body,[1.015,y,z],1.8);}
  const handle=document.createElementNS(ns,"path");const[hx,hy]=project([1.02,.03,.56]);handle.setAttribute("d",`M${hx-15} ${hy-4}q-7 16 5 17l20-10q8-5 0-13`);handle.setAttribute("fill","none");handle.setAttribute("stroke","#383c30");handle.setAttribute("stroke-width","4");body.append(handle);
  poly(body,[[-.115,-.538,.61],[.115,-.538,.61],[.115,-.538,.96],[.05,-.538,1.015],[-.05,-.538,1.015],[-.115,-.538,.96]],"#929075");
  const[kx,ky]=project([0,-.55,.76]);const key=document.createElementNS(ns,"path");key.setAttribute("d",`M${kx} ${ky-4}a4 4 0 1 0 0 8l-2 7h6l-2-7a4 4 0 0 0-2-8Z`);key.setAttribute("fill","#39372a");body.append(key);
  for(const x of[-.92,.92]){poly(body,[[x-.06,-.5,-.005],[x+.06,-.5,-.005],[x+.06,-.5,.11],[x-.06,-.5,.11]],"#5b5038");}
  function setOpen(progress){
    const angle=Math.max(0,Math.min(1,progress))*1.85;
    const p=(x,d,thickness=0)=>[x,.5-d*Math.cos(angle)+thickness*Math.sin(angle),1.11+d*Math.sin(angle)+thickness*Math.cos(angle)];
    lid.replaceChildren();
    poly(lid,[p(-1.03,0),p(1.03,0),p(1.03,1.04),p(-1.03,1.04)],progress>.15?"#9b7948":"#c19a5e");
    for(let d=.18;d<1;d+=.2){line(lid,[p(-1.02,d),p(1.02,d)],"#705734",1.35);line(lid,[p(-.98,d+.018),p(.98,d+.018)],"#dbc08a",.8);}
    for(let i=0;i<16;i++){const x=-.94+(i*43%100)/57,d=.06+(i*23%92)/100;line(lid,[p(x,d),p(Math.min(.96,x+.12),d+.013),p(Math.min(.98,x+.29),d+.006)],"#795c35",.6);}
    poly(lid,[p(-1.03,1.04),p(1.03,1.04),p(1.03,1.04,-.1),p(-1.03,1.04,-.1)],"#997441");
    poly(lid,[p(1.03,0),p(1.03,1.04),p(1.03,1.04,-.1),p(1.03,0,-.1)],"#7e6947");
    for(const x of[-.65,.65]){poly(lid,[p(x-.065,0),p(x+.065,0),p(x+.065,1.04),p(x-.065,1.04)],"#747661");line(lid,[p(x-.04,.04),p(x-.04,1)],"#b3b095",1.3);for(const d of[.07,.49,.97])rivet(lid,p(x,d),2);poly(lid,[p(x-.065,1.04),p(x+.065,1.04),p(x+.065,1.04,-.1),p(x-.065,1.04,-.1)],"#5e624f");}
    poly(lid,[p(-.075,1.052),p(.075,1.052),p(.075,1.052,-.24),p(-.075,1.052,-.24)],"#8e8c70");rivet(lid,p(0,1.058,-.04));
    svg.dataset.open=progress.toFixed(3);
  }
  setOpen(0);return{setOpen,svg};
}
