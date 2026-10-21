/* Only served by the explicitly enabled private open-world draft. */
window.SeamlessRoutePreview = class {
  constructor({scene,viewport,selected,navigate}) {
    this.scene=scene;this.selected=selected;this.navigate=navigate;this.cleanups=[];this.generation=0;
    this.canvas=document.createElement("canvas");this.canvas.className="open-route-overlay";this.canvas.hidden=true;this.canvas.setAttribute("aria-hidden","true");viewport.append(this.canvas);
    this.panel=document.createElement("section");this.panel.className="open-route-panel";this.panel.setAttribute("aria-label","Open-world route test");
    this.panel.innerHTML='<strong>Open-world route test</strong><p id="route-status" role="status">Select a location, then choose “Start route”. Nothing is sent.</p><div><button id="route-play" hidden>Animate test</button><button id="route-follow" hidden>Follow test</button><button id="route-clear" hidden>Clear</button></div>';
    document.body.append(this.panel);
    this.actions=document.createElement("div");this.actions.className="open-route-actions";
    this.actions.innerHTML='<button id="route-from">Start route</button><button id="route-to" hidden>Route here</button>';
    document.getElementById("inspector").append(this.actions);
    this.status=this.panel.querySelector("p");
    const on=(id,fn)=>{const element=document.getElementById(id);element.addEventListener("click",fn);this.cleanups.push(()=>element.removeEventListener("click",fn));};
    on("route-from",()=>{const o=this.selected();if(!o||o.kind==="troop")return;this.clear();this.source={key:o.key,name:o.name};this.status.textContent=`From ${o.name}. Select another location and choose “Route here”.`;this.update();});
    on("route-to",()=>void this.plan());on("route-clear",()=>this.clear());
    on("route-play",()=>{this.started=performance.now();this.playing=true;});
    on("route-follow",()=>{this.following=!this.following;if(this.following&&!this.playing){this.started=performance.now();this.playing=true;}this.update();});
  }
  update(){const o=this.selected();this.actions.hidden=!o||o.kind==="troop";
    document.getElementById("route-to").hidden=!this.source||o?.key===this.source.key;
    document.getElementById("route-to").disabled=!!this.pending||!!o?.layoutUnmapped;
    document.getElementById("route-from").disabled=!!o?.layoutUnmapped;
    for(const id of ["route-play","route-follow"])document.getElementById(id).hidden=!this.result;
    document.getElementById("route-clear").hidden=!this.source;
    document.getElementById("route-follow").textContent=this.following?"Stop following":"Follow test";
  }
  clear(){this.generation++;this.abort?.abort();this.pending=false;this.source=null;this.result=null;this.playing=false;this.following=false;this.position=null;
    this.status.textContent='Select a location, then choose “Start route”. Nothing is sent.';this.update();}
  cancelFollow(){if(this.following){this.following=false;this.update();}}
  async plan(){
    const target=this.selected();if(!this.source||!target||target.kind==="troop"||target.key===this.source.key)return;
    this.abort?.abort();const generation=++this.generation;this.abort=new AbortController();this.pending=true;this.result=null;this.playing=false;this.following=false;this.update();this.status.textContent="Finding a passable route…";
    try{
      const query=new URLSearchParams({realm:this.scene.realmId,from:this.source.key,to:target.key});
      const response=await fetch(`/__benchmark__/seamless/route?${query}`,{credentials:"same-origin",signal:this.abort.signal});
      if(!response.ok)throw Error(response.status===429?"Route service busy; try again shortly.":"Route unavailable; reselect the locations and retry.");
      const result=await response.json();if(generation!==this.generation)return;
      if(result.status!=="ok")throw Error(result.status==="budget-exceeded"?"This route exceeded the private test budget. Try a nearer target.":"No passable draft route found for these locations.");
      this.result=result;this.path=SeamlessModel.preparePath(result.points);this.position=result.points[0];
      this.status.textContent=`${result.from.name} → ${result.to.name} · ${Math.round(result.mapUnits).toLocaleString()} map units · ${new Set(result.segments.map(s=>s.sectionId)).size} sections. Animation takes 12 seconds; this is not a game travel time.`;
    }catch(error){if(generation===this.generation&&error.name!=="AbortError")this.status.textContent=error.message;}
    finally{if(generation===this.generation){this.pending=false;this.update();}}
  }
  tick(now){if(!this.playing||!this.result)return;const t=Math.max(0,Math.min(1,(now-this.started)/12000));this.position=SeamlessModel.along(this.path,this.path.length*t);
    if(this.following)this.navigate(this.position);if(t>=1)this.playing=false;}
  draw(camera,size){
    this.canvas.hidden=!this.result;if(!this.result){this.drawn=null;return;}
    const signature=[camera.x,camera.y,camera.zoom,size.width,size.height,this.position?.x,this.position?.y].join(":");
    if(this.drawn===signature&&this.drawnResult===this.result)return;this.drawn=signature;this.drawnResult=this.result;
    const scale=Math.min(2,window.devicePixelRatio||1),width=Math.round(size.width*scale),height=Math.round(size.height*scale);
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    const ctx=this.canvas.getContext("2d");ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,size.width,size.height);
    ctx.beginPath();for(const [i,p]of this.result.points.entries()){const v=SeamlessModel.project(camera,p,size);i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y);}
    ctx.strokeStyle="#35271c";ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle="#fff1a6";ctx.lineWidth=2.5;ctx.stroke();
    const v=SeamlessModel.project(camera,this.position||this.result.points[0],size);ctx.beginPath();ctx.arc(v.x,v.y,7,0,Math.PI*2);ctx.fillStyle="#72363a";ctx.fill();ctx.strokeStyle="#fff1a6";ctx.lineWidth=2;ctx.stroke();
  }
  snapshot(){return {pending:!!this.pending,source:this.source,route:this.result,following:!!this.following,position:this.position};}
  dispose(){this.clear();this.cleanups.forEach(fn=>fn());this.canvas.remove();this.actions.remove();this.panel.remove();}
};
