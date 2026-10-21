/* Served only by the disposable, authenticated gameplay pilot. */
window.SeamlessGameplayControls = class {
  constructor({scene,selected,navigate,refresh}) {
    Object.assign(this,{scene,selected,navigate,refresh});this.cleanups=[];this.generation=0;
    this.panel=document.createElement('section');this.panel.className='pilot-console';this.panel.setAttribute('aria-label','Sample game orders');
    this.panel.innerHTML='<button id="pilot-toggle" aria-expanded="true">Sample game orders</button><div id="pilot-body"><p id="pilot-status" role="status">Loading test account…</p><details id="pilot-sources"><summary>Choose source city</summary><div id="pilot-cities" class="pilot-list"></div></details><p id="pilot-source">Choose one of your cities as a source.</p><div id="pilot-kinds" class="pilot-row"></div><label class="pilot-row">Troops <input id="pilot-troops" type="number" min="1" max="1000000" step="1" value="10"></label><p id="pilot-target">Select a city on the map.</p><div class="pilot-row"><button id="pilot-preview">Preview order</button><button id="pilot-send" hidden>Send order</button></div><div class="pilot-row"><button id="pilot-nearby">Scout Nearby</button><button id="pilot-regroup">Regroup here</button></div><div id="pilot-bulk" class="pilot-list"></div><button id="pilot-bulk-send" hidden></button><details><summary>Your marches and reinforcements</summary><div id="pilot-marches" class="pilot-list"></div><div id="pilot-rallies" class="pilot-list"></div><button id="pilot-refresh">Refresh orders</button></details></div>';
    document.body.append(this.panel);this.q=id=>this.panel.querySelector('#pilot-'+id);
    this.kind='transfer';
    const on=(el,event,fn)=>{el.addEventListener(event,fn);this.cleanups.push(()=>el.removeEventListener(event,fn));};
    const click=(id,fn)=>on(this.q(id),'click',()=>{if(!this.busy)void fn();});
    const button=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.type='button';b.onclick=fn;return b;};this.button=button;
    for(const kind of ['scout','attack','transfer','reinforce','rally'])this.q('kinds').append(button(kind,()=>{if(this.busy)return;this.kind=kind;this.invalidate();this.update();}));
    on(this.q('toggle'),'click',()=>{const b=this.q('body');b.hidden=!b.hidden;this.q('toggle').setAttribute('aria-expanded',String(!b.hidden));});
    on(this.q('troops'),'input',()=>this.invalidate());
    click('preview',()=>this.preview());click('send',()=>this.send());
    click('nearby',()=>this.bulk('nearby'));click('regroup',()=>this.bulk('regroup'));click('bulk-send',()=>this.sendBulk());click('refresh',()=>this.load());
    void this.load();
  }
  async api(name,data={}) {
    const epoch=this.sessionGeneration;
    const response=await fetch('/__benchmark__/seamless/command',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({name,data})});
    const body=await response.json();if(epoch!==this.sessionGeneration)throw Error('Test session changed; reload to continue.');if(!response.ok){if(response.status===401||response.status===410){this.clear();this.panel.querySelectorAll('button,input').forEach(b=>b.disabled=true);}
      throw Error(body.error||'Command unavailable; retry the same order.');}return body;
  }
  id(){return 'pilot_'+Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('_');}
  status(message){this.q('status').textContent=message;}
  invalidate(){this.generation++;this.previewResult=null;this.order=null;this.q('send').hidden=true;}
  clear(){this.sessionGeneration=(this.sessionGeneration||0)+1;this.invalidate();this.source=null;this.options=null;this.batch=null;this.q('cities').replaceChildren();this.q('bulk').replaceChildren();this.q('marches').replaceChildren();this.q('bulk-send').hidden=true;this.status('Test session changed. Reload to continue.');}
  async run(fn){if(this.busy)return;this.busy=true;this.update();try{await fn();}catch(error){this.status(error.message);}finally{this.busy=false;this.update();}}
  async load(){return this.run(async()=>{await this.reload();});}
  async reload(){
    this.options=await this.api('options',{key:this.source?.key});const o=this.options;
    if(this.source&&!o.owned.some(c=>c.key===this.source.key)){this.source=null;this.invalidate();}
    if(!this.source)this.source=o.owned.find(c=>c.regionId===this.scene.homeSectionId)||o.owned[0];
    this.q('cities').replaceChildren(...o.owned.map(c=>this.button(`${c.name} · ${c.troops.toLocaleString()} troops`,()=>{if(this.busy)return;this.source=c;this.q('sources').open=false;this.invalidate();this.update();const object=this.scene.objects.find(o=>o.key===c.key);if(object)this.navigate(object);})));
    this.q('marches').replaceChildren(...o.marches.map(m=>{const row=document.createElement('div');row.className='pilot-row';const label=document.createElement('span');label.textContent=`${m.kind}: ${m.name}${m.returning?' · returning':''}`;row.append(label);
      if(!m.returning)row.append(this.button('Recall · 1 Horn',()=>void this.run(async()=>{await this.api('useRecallHorn',{armyId:m.id});this.status('Recall accepted.');this.refresh();await this.reload();})));return row;}),...o.stationed.map(m=>this.button(`Return: ${m.name}`,()=>void this.run(async()=>{await this.api('returnClanReinforcement',{reinforcementId:m.id});this.refresh();await this.reload();}))));
    this.q('rallies').replaceChildren(...o.rallies.map(r=>{const row=document.createElement('div');row.className='pilot-row';const label=document.createElement('span');label.textContent=`${r.name} · ${r.status}`;row.append(label);
      const add=(label,name)=>row.append(this.button(label,()=>void this.run(async()=>{const id=this.id();const data={clanId:r.clanId,rallyId:r.id,armyId:id};if(name==='joinClanRally'){if(!this.source)throw Error('Choose your source city.');const troops=Number(this.q('troops').value);if(!Number.isInteger(troops)||troops<1)throw Error('Choose a whole troop amount.');Object.assign(data,{sourceRegionId:this.source.regionId,army:{id,fromId:this.source.id,sourceRegionId:this.source.regionId,troops,requestedTroops:troops,kind:'rally_join'}});}await this.api(name,data);this.refresh();await this.reload();})));
      if(r.status==='forming'){if(!r.joined)add('Join','joinClanRally');else if(!r.leader)add('Withdraw','withdrawClanRallyContribution');if(r.leader){add('Launch','launchClanRally');add('Cancel','cancelClanRally');}}return row;}));
    this.status(`Pilot ${o.viewer} · ${o.gold.toLocaleString()} sample Gold. Select a source and a target.`);
  }
  update(){
    const target=this.selected();const key=target&&['castle','stronghold','citadel','tower','camp','npc'].includes(target.kind)&&target.selectable?target.key:null;
    if(key!==this.targetKey){this.targetKey=key;this.invalidate();}
    this.q('source').textContent=this.source?`From: ${this.source.name}`:'Choose one of your cities as a source.';
    this.q('target').textContent=key?`To: ${target.name}`:'Select a castle on the map.';
    this.q('kinds').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===this.kind)));
    this.q('troops').disabled=this.busy||this.kind==='scout';
    for(const id of ['preview','nearby','regroup'])this.q(id).disabled=this.busy||!this.source;
    this.q('preview').disabled ||= !key||key===this.source?.key;
    this.q('send').disabled=this.busy;this.q('bulk-send').disabled=this.busy;
  }
  async preview(){return this.run(async()=>{
    const target=this.selected();if(!this.source||!target||!['castle','stronghold','citadel','tower','camp','npc'].includes(target.kind))throw Error('Select a source and target castle.');
    const troops=this.kind==='scout'?1:Number(this.q('troops').value);if(!Number.isInteger(troops)||troops<1)throw Error('Choose a whole troop amount.');
    const generation=this.generation,data={fromId:this.source.id,toId:target.id,sourceRegionId:this.source.regionId,targetRegionId:target.sectionId,kind:this.kind==='rally'?'attack':this.kind,requestedTroops:troops,targetType:target.kind==='tower'?'tower':target.kind==='camp'?'camp':target.kind==='npc'?'marauder':'city',targetSpawnId:target.spawnId||''};
    const result=await this.api('previewArmyRoute',data);if(generation!==this.generation)return;
    this.previewResult=result;const id=this.id();this.order={rallyId:id,armyId:id,sourceRegionId:data.sourceRegionId,targetRegionId:data.targetRegionId,army:{...data,id,troops}};
    this.q('send').hidden=false;this.status(`Travel: ${Math.ceil(result.durationMs/1000)} seconds · ${Math.round(result.pathLength||result.segments.reduce((n,s)=>n+s.length,0)).toLocaleString()} map units. ${this.kind==='scout'?'Scout departure is chosen from the nearest eligible holding at launch; time may differ.':'Send applies normal sample-game costs and checks.'}`);
  });}
  async send(){return this.run(async()=>{if(!this.order)throw Error('Preview the order first.');await this.api(this.kind==='rally'?'createClanRally':'sendArmyOrder',this.order);this.invalidate();this.refresh();await this.reload();this.status('Order accepted. The march uses the server’s travel time.');});}
  async bulk(kind){return this.run(async()=>{
    if(!this.source)return;const anchor=this.source;const result=await this.api('options',{key:anchor.key});
    const rows=result[kind];this.batch={kind,anchor,rows,id:this.id()};this.q('bulk').replaceChildren();
    for(const c of rows){const row=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=true;checkbox.dataset.key=c.key;row.append(checkbox,document.createTextNode(`${c.name} · ${Math.round(c.distance)} units`));this.q('bulk').append(row);}
    this.q('bulk-send').hidden=!rows.length;this.q('bulk-send').textContent=`${kind==='nearby'?'Send selected scouts':'Regroup selected'} · ${result.costs[kind].toLocaleString()} Gold`;
    this.status(`${rows.length} eligible cities within ${result.radii[kind]} map units of ${anchor.name}. Distances use the wider layout, across section edges.`);
  });}
  async sendBulk(){return this.run(async()=>{
    const b=this.batch;if(!b)return;const selected=new Set([...this.q('bulk').querySelectorAll('input:checked')].map(i=>i.dataset.key));
    const addresses=b.rows.filter(c=>selected.has(c.key)).map(c=>({regionId:c.regionId,cityId:c.id}));if(!addresses.length)throw Error('Select at least one city.');
    // Freeze the id and payload across ambiguous network failures. Changing the
    // selection starts a new explicit request, never a silent duplicate charge.
    const signature=JSON.stringify(addresses);if(b.signature&&b.signature!==signature)b.id=this.id();b.signature=signature;
    await this.api(b.kind==='nearby'?'sendNearbyScouts':'sendRegroupOrders',b.kind==='nearby'?{requestId:b.id,sourceRegionId:b.anchor.regionId,sourceCityId:b.anchor.id,targets:addresses}:{requestId:b.id,targetRegionId:b.anchor.regionId,targetCityId:b.anchor.id,sources:addresses});
    this.batch=null;this.q('bulk').replaceChildren();this.q('bulk-send').hidden=true;this.refresh();await this.reload();this.status('Group order accepted.');
  });}
  dispose(){this.clear();this.cleanups.forEach(fn=>fn());this.panel.remove();}
};
