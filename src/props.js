/* ---------------- property editor ---------------- */
/*
   Renders whatever the tree has selected. Scene-wide settings live under the
   Project node, which is where the old right-hand panel's contents went.
*/
function fld(lbl,node){
  const d=mk('div','fld'); d.append(mk('label',null,lbl),node); return d;
}
function num(lbl,val,cb,step){
  const i=mk('input','t'); i.type='number'; i.step=step||0.5; i.value=val;
  i.oninput=()=>{const v=parseFloat(i.value); if(!Number.isNaN(v)){cb(v);render();}};
  return fld(lbl,i);
}
function text(lbl,val,cb){
  const i=mk('input','t'); i.value=val;
  i.oninput=()=>{cb(i.value); autosave(); renderTree();};
  return fld(lbl,i);
}
function pick(lbl,val,options,cb){
  const s=mk('select','t');
  options.forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;
    if(String(v)===String(val))o.selected=true;s.append(o);});
  s.onchange=()=>{cb(s.value);render();list();};
  return fld(lbl,s);
}
function check(lbl,val,cb){
  const l=mk('label','layer'); const i=document.createElement('input'); i.type='checkbox'; i.checked=val;
  i.onchange=()=>{cb(i.checked);render();list();};
  l.append(i,mk('span',null,lbl)); return l;
}
function btnRow(...bs){ const r=mk('div','row'); bs.forEach(b=>r.append(b)); return r; }
function btn(label,fn,cls){ const b=mk('button','act'+(cls?' '+cls:''),label); b.onclick=fn; return b; }
const head=t=>{ const e=mk('p','eyebrow',t); return e; };
const rule=()=>mk('div','divider');

// A field that shows what it inherits until you override it.
function inheritField(lbl,obj,field,options){
  const r=inherit(obj,field);
  const own=obj[field]!==undefined&&obj[field]!==null;
  const s=mk('select','t');
  const opt=(v,t)=>{const o=document.createElement('option');o.value=v;o.textContent=t;s.append(o);return o;};
  opt('','inherit ('+r.v+')');
  options.forEach(v=>opt(v,String(v)));
  s.value=own?String(obj[field]):'';
  if(!own)s.classList.add('inherited');
  s.onchange=()=>{ obj[field]=s.value===''?null:(isNaN(+s.value)?s.value:+s.value); render(); list(); };
  return fld(lbl,s);
}

function renderProps(){
  const p=$('propspane'); p.textContent='';
  const k=selKind();
  if(k==='cam')return propsCam(p,cams.find(c=>c.id===sel));
  if(k==='nvr')return propsNvr(p,nvrs.find(n=>n.id===selNvr));
  if(k==='box')return propsBox(p,boxes.find(b=>b.id===selBox));
  if(k==='prop')return propsBoundary(p);
  return propsProject(p);
}

/* ---------- project ---------- */
function propsProject(p){
  p.append(head('Project'));
  p.append(pick('target',opts.tz,[[0,'ground 0 ft'],[3,'torso 3 ft'],[5.5,'head 5.5 ft']],
    v=>opts.tz=parseFloat(v)));
  p.append(pick('draw',opts.draw,[['cones','cones (vector)'],['heat','heatmap (pixels)']],v=>opts.draw=v));
  p.append(pick('lighting',opts.night?'night':'day',[['day','daylight'],['night','night — IR only']],
    v=>{opts.night=(v==='night');clearSpecCache();splat=null;}));
  p.append(head('Recording defaults'));
  p.append(pick('fps',opts.fps,[[5,'5'],[10,'10'],[15,'15'],[20,'20'],[25,'25'],[30,'30']],v=>opts.fps=+v));
  p.append(pick('quality',opts.quality,[['low','low'],['med','medium'],['high','high']],v=>opts.quality=v));
  p.append(rule());
  p.append(head('Fence'));
  p.append(check('Perimeter fence blocks',fence.on,v=>{fence.on=v;splat=frusta=null;}));
  p.append(num('height ft',fence.h,v=>{fence.h=v;splat=frusta=null;},0.5));
  p.append(rule());
  p.append(head('Presets'));
  p.append(btnRow(btn('House (measured)',()=>{loadMeasured();select(null);toast('Measured house loaded');})));
  const pr=Object.keys(PRESETS);
  p.append(btnRow(...pr.map(k=>btn(PRESET_LABEL[k]||k,()=>applyPreset(k)))));
  p.append(rule());
  p.append(head('Project file'));
  p.append(btnRow(btn('Export…',()=>exportProject()),btn('Import…',()=>importFile(()=>{render();list();}))));
  p.append(btnRow(btn('New blank project',()=>{
    if(!confirm('Discard the current project and start again from the default house?'))return;
    localStorage.removeItem(LS_KEY); loadMeasured(); select(null); toast('New project');
  },'danger')));
  p.append(rule());
  p.append(head('Layout code'));
  const ta=mk('textarea'); ta.id='code'; ta.spellcheck=false; ta.value=encode(); p.append(ta);
  p.append(btnRow(
    btn('Copy',async()=>{ta.select();try{await navigator.clipboard.writeText(ta.value);toast('Copied');}catch(e){toast('Select and copy');}}),
    btn('Load',()=>{
      const {C,B,P}=decode(ta.value);
      if(!C.length&&!B.length&&!P){toast('Nothing recognised');return;}
      if(C.length)cams=C; if(B.length)boxes=B; if(P)prop=P;
      migrateScene(); cams.forEach(c=>{ if(!c.nvr&&nvrs[0])c.nvr=nvrs[0].id; });
      select(null); toast(`Loaded ${C.length} cameras, ${B.length} occluders`);
    })));
  const n=mk('p','note'); n.textContent='Geometry only — cameras keep their catalog specs.'; p.append(n);
}

/* ---------- NVR ---------- */
function propsNvr(p,n){
  if(!n)return propsProject(p);
  const S=specOfNvr(n);
  const kids=cams.filter(c=>c.nvr===n.id);
  p.append(head('Recorder'));
  p.append(text('name',n.name,v=>n.name=v));
  const s=mk('div','spec');
  s.innerHTML=`<b>${S.brand||''} ${S.model||''}</b><br>`+
    `${S.channels||'?'} channels · ${kids.length} used<br>`+
    (S.storageGB?`${(S.storageGB/1000).toFixed(1)} TB fitted`:'storage not specified')+
    (S.maxStorageGB?` · up to ${(S.maxStorageGB/1000).toFixed(0)} TB`:'')+'<br>'+
    (S.maxStreamsMbps?`${S.maxStreamsMbps} Mbps incoming<br>`:'')+
    (S.checked?`specs checked ${S.checked}`:'');
  p.append(s);
  if(S.channels&&kids.length>S.channels){
    const w=mk('p','note'); w.innerHTML=`<b style="color:var(--warn)">${kids.length} cameras on ${S.channels} channels.</b>`;
    p.append(w);
  }
  (S.links||[]).forEach(l=>{
    const a=document.createElement('a'); a.className='link'; a.href=l.url; a.target='_blank';
    a.rel='noopener noreferrer'; a.textContent=l.label+' ↗';
    const d=mk('div'); d.style.marginTop='5px'; d.append(a); p.append(d);
  });
  if(S.notes){ const nn=mk('p','note',S.notes); p.append(nn); }
  p.append(rule());
  p.append(num('storage GB',n.storageGB??S.storageGB??0,v=>n.storageGB=v,100));
  p.append(num('price',n.price||0,v=>n.price=v,10));
  p.append(head('Overrides for its cameras'));
  p.append(inheritField('fps',n,'fps',[5,10,15,20,25,30]));
  p.append(inheritField('quality',n,'quality',['low','med','high']));
  p.append(rule());
  p.append(btnRow(btn('Delete recorder',()=>{
    nvrs=nvrs.filter(v=>v!==n);
    cams.forEach(c=>{ if(c.nvr===n.id)c.nvr=null; });
    select(null);
  },'danger')));
}

/* ---------- camera ---------- */
function propsCam(p,c){
  if(!c)return propsProject(p);
  const S=specOf(c);
  p.append(head('Camera'));
  p.append(text('name',c.name,v=>c.name=v));
  const idf=identifyFt(S), det=detectFt(S);
  const s=mk('div','spec');
  s.innerHTML=`<b>${S.brand} ${S.model}</b><br>`+
    `${S.resW}×${S.resH} · ${S.fovH}° × ${S.fovV.toFixed(1)}°`+
    (S.fovVAssumed?' <span class="badge">V assumed</span>':'')+'<br>'+
    `face-ID to <b>${idf.toFixed(0)} ft</b> · detection to <b>${det.toFixed(0)} ft</b><br>`+
    (opts.night
      ? `night: limited by ${S.irFt?`IR ${S.irFt} ft`:''}${S.floodlightFt?` / light ${S.floodlightFt} ft`:''}${!S.irFt&&!S.floodlightFt?'nothing — no coverage':''}`
      : `IR ${S.irFt||'—'} ft · ${S.poe?'PoE':''}${S.wifi?' Wi-Fi':''}`)+
    `<br>${bitrateOf(c).toFixed(1)} Mbps at current settings`;
  p.append(s);
  const nt=mk('p','note');
  nt.innerHTML='Ranges are DORI: identify 250 px/m, recognise 125 px/m.';
  p.append(nt);
  p.append(rule());
  p.append(pick('recorder',c.nvr||'',
    [['','— none —'],...nvrs.map(n=>[n.id,n.name])],v=>c.nvr=v||null));
  p.append(num('height ft',c.z,v=>c.z=v));
  p.append(num('down-tilt°',c.t,v=>c.t=v,1));
  p.append(num('aim °',c.a,v=>c.a=norm(v),1));
  p.append(num('x',c.x,v=>c.x=v));
  p.append(num('y',c.y,v=>c.y=v));
  p.append(num('price',c.price||0,v=>c.price=v,10));
  p.append(head('Recording'));
  p.append(inheritField('fps',c,'fps',[5,10,15,20,25,30]));
  p.append(inheritField('quality',c,'quality',['low','med','high']));

  // PT circuit stays with the camera, as it always has
  if(S.ptz){
    p.append(rule());
    p.append(head(`PT circuit · ${stops(c).length} stops · ${cycle(c)}s`));
    p.append(num('home s',c.hd||20,v=>c.hd=Math.max(1,v),1));
    (c.tour||[]).forEach((kf,i)=>{
      const row2=mk('div','fld');
      row2.append(mk('label',null,'stop '+(i+1)));
      const mkn=(val,cb)=>{const n2=mk('input','t');n2.type='number';n2.step=1;n2.value=val;n2.style.flex='1 1 0';
        n2.oninput=()=>{const v=parseFloat(n2.value); if(!Number.isNaN(v)){cb(v);render();}};return n2;};
      const del=mk('button','eye','×'); del.title='remove stop';
      del.onclick=()=>{c.tour.splice(i,1);render();list();};
      row2.append(mkn(kf.a,v=>kf.a=norm(v)),mkn(kf.t,v=>kf.t=clamp(v,-30,60)),mkn(kf.d,v=>kf.d=Math.max(1,v)),del);
      row2.title='aim° / tilt° / dwell s';
      p.append(row2);
    });
    p.append(btnRow(
      btn('+ Stop here',()=>{
        c.tour=c.tour||[];
        if(c.tour.length>=3){toast('3 extra stops is the cap');return;}
        const last=c.tour.length?c.tour[c.tour.length-1].a:c.a;
        c.tour.push({a:norm(last+60),t:c.t||15,d:8}); render(); list();
      }),
      btn('Clear',()=>{c.tour=[];render();list();})));
  }
  const lo=lowVis(c);
  if(lo){ const w=mk('p','note'); w.innerHTML=`<b style="color:var(--warn)">${lo}</b>`; p.append(w); }
  p.append(rule());
  p.append(btnRow(btn('Delete camera',()=>{cams=cams.filter(v=>v!==c);select(null);},'danger')));
}

/* ---------- occluder ---------- */
function propsBox(p,b){
  if(!b)return propsProject(p);
  p.append(head('Occluder'));
  p.append(text('name',b.name,v=>b.name=v));
  p.append(pick('parent',b.parent||'',
    [['','— none (world) —'],...boxes.filter(o=>o!==b&&!wouldCycle(o,b.id)).map(o=>[o.id,o.name])],
    v=>{ if(!setParent(b,v||null))toast('That would nest an occluder inside itself'); splat=null; }));
  p.append(num('yaw °',b.yaw||0,v=>{b.yaw=v;splat=null;},5));
  p.append(rule());
  p.append(num('x0',b.x0,v=>{b.x0=Math.min(v,b.x1-0.25);splat=null;}));
  p.append(num('y0',b.y0,v=>{b.y0=Math.min(v,b.y1-0.25);splat=null;}));
  p.append(num('x1',b.x1,v=>{b.x1=Math.max(v,b.x0+0.25);splat=null;}));
  p.append(num('y1',b.y1,v=>{b.y1=Math.max(v,b.y0+0.25);splat=null;}));
  if(b.shape==='cyl'||b.shape==='tree'){
    p.append(num('radius ft',b.r||0.5,v=>{b.r=Math.max(0.1,v);splat=null;},0.25));
    if(b.shape==='tree'){
      p.append(num('canopy r',b.canopyR||6,v=>{b.canopyR=Math.max(0.5,v);splat=null;},0.5));
      p.append(num('canopy h',b.canopyH||8,v=>{b.canopyH=Math.max(0.5,v);splat=null;},0.5));
    }
  }
  p.append(rule());
  p.append(head('Heights'));
  const eLbl={N:'N',E:'E',S:'S',W:'W'};
  [['zt','top'],['zb','base']].forEach(([key,word])=>{
    EDGES.forEach(edg=>{
      const cur=(b[key][edg.c[0]]+b[key][edg.c[1]])/2;
      p.append(num(word+' '+eLbl[edg.k],Math.round(cur*100)/100,v=>{
        edg.c.forEach(i=>b[key][i]=v);
        if(key==='zt')b.zt=b.zt.map((z,i)=>Math.max(z,b.zb[i]+.15));
        else b.zb=b.zb.map((z,i)=>Math.min(z,b.zt[i]-.15));
        splat=null;
      },0.25));
    });
  });
  p.append(btnRow(
    btn('Level',()=>{const m=Math.max(...b.zt),n=Math.min(...b.zb);b.zt=[m,m,m,m];b.zb=[n,n,n,n];splat=null;render();list();}),
    btn('Slab base',()=>{const th=Math.max(0.25,b.zt[0]-b.zb[0]);
      b.zb=b.zt.map(v=>Math.round((v-th)*100)/100);splat=null;render();list();})));
  const kids=childrenOf(b.id);
  if(kids.length){
    const n2=mk('p','note',`${kids.length} child occluder${kids.length>1?'s':''} move with this one.`);
    p.append(n2);
  }
  p.append(rule());
  p.append(btnRow(btn('Delete',()=>{
    childrenOf(b.id).forEach(k=>k.parent=b.parent||null);   // don't orphan the subtree
    boxes=boxes.filter(v=>v!==b); splat=null; select(null);
  },'danger')));
}

/* ---------- property boundary ---------- */
function propsBoundary(p){
  p.append(head('Property boundary'));
  const s=mk('div','spec');
  s.innerHTML=`${prop.length} vertices · <b>${Math.round(polyArea()).toLocaleString()} sq ft</b><br>`+
    `drag a vertex · + adds one · shift-click removes`;
  p.append(s);
  p.append(rule());
  const i=mk('input','t'); i.type='number'; i.step=100; i.value=Math.round(polyArea());
  p.append(fld('lot sq ft',i));
  p.append(btnRow(btn('Scale to that area',()=>{
    const target=parseFloat(i.value), cur=polyArea();
    if(!(target>0)||!(cur>0))return;
    const k=Math.sqrt(target/cur);
    const cx0=prop.reduce((a,v)=>a+v[0],0)/prop.length;
    const cy0=prop.reduce((a,v)=>a+v[1],0)/prop.length;
    prop=prop.map(([x,y])=>[Math.round((cx0+(x-cx0)*k)*10)/10,Math.round((cy0+(y-cy0)*k)*10)/10]);
    render();list();toast('Scaled to '+Math.round(polyArea()).toLocaleString()+' sq ft');
  })));
  p.append(btnRow(
    btn('Measured lot',()=>{const {P}=decodeRaw(MEASURED); if(P){prop=P;splat=null;render();list();}}),
    btn('Square',()=>{prop=DEF_PROP();splat=null;render();list();})));
  p.append(btnRow(btn('Fit to structures',()=>{
    const on=boxes.filter(b=>b.on);
    if(!on.length)return;
    const m=8;
    const x0=Math.min(...on.map(b=>b.x0))-m, x1=Math.max(...on.map(b=>b.x1))+m;
    const y0=Math.min(...on.map(b=>b.y0))-m, y1=Math.max(...on.map(b=>b.y1))+m;
    prop=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([a,c])=>[Math.round(a*10)/10,Math.round(c*10)/10]);
    render();list();
  })));
}
