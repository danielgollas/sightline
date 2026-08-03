/* ---------------- add menu ---------------- */
/*
   One picker, parameterised by entity kind: search, filter chips, sort.
   The occluder variant is a preset grid instead, because five presets do not
   need a search box.
*/
function modal(title,build){
  const scrim=mk('div','scrim');
  const box=mk('div','picker');
  const h=mk('h3',null,title);
  box.append(h);
  build(box,()=>scrim.remove());
  scrim.append(box);
  scrim.onclick=e=>{ if(e.target===scrim)scrim.remove(); };
  const esc=e=>{ if(e.key==='Escape'){scrim.remove();removeEventListener('keydown',esc);} };
  addEventListener('keydown',esc);
  document.body.append(scrim);
  const inp=box.querySelector('input.t');
  if(inp)inp.focus();
  return scrim;
}
function emptyCatalogNote(kind){
  const e=mk('div','pempty');
  e.innerHTML=`No ${kind} in the catalog.<br>`+
    `The catalog is fetched from <span style="color:var(--bone)">./catalog/</span>, which cannot be `+
    `read when this file is opened directly from disk.<br>`+
    `Import a catalog JSON file to carry on.`;
  return e;
}
const money=v=>v?('$'+v.toLocaleString(undefined,{maximumFractionDigits:0})):'price not set';
const srcBadge=e=>e.source&&e.source!=='catalog'?` <span class="badge">${e.source}</span>`:'';

// Generic list picker. `cfg.filters` are [label, predicate, defaultOn].
function listPicker(cfg){
  modal(cfg.title,(box,close)=>{
    const bar=mk('div','pbar');
    const search=mk('input','t'); search.placeholder='Search '+cfg.kind+'…'; search.type='search';
    bar.append(search);
    const sortSel=mk('select','t'); sortSel.style.flex='0 0 130px';
    cfg.sorts.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.label;sortSel.append(o);});
    bar.append(sortSel);
    const state=cfg.filters.map(f=>f[2]);
    cfg.filters.forEach((f,i)=>{
      const c=mk('button','chip',f[0]);
      c.setAttribute('aria-pressed',state[i]?'true':'false');
      c.onclick=()=>{state[i]=!state[i];c.setAttribute('aria-pressed',state[i]?'true':'false');draw();};
      bar.append(c);
    });
    box.append(bar);

    const list=mk('div','plist'); box.append(list);
    const foot=mk('div','pfoot');
    const imp=mk('button','act','Import catalog file…');
    imp.onclick=()=>importFile(()=>{draw();list0();});
    const cancel=mk('button','act','Close'); cancel.onclick=close;
    foot.append(imp,cancel); box.append(foot);

    function draw(){
      list.textContent='';
      let rows=cfg.entries();
      const q=search.value.trim().toLowerCase();
      if(q)rows=rows.filter(e=>(`${e.brand} ${e.model} ${e.id}`).toLowerCase().includes(q));
      cfg.filters.forEach((f,i)=>{ if(state[i])rows=rows.filter(f[1]); });
      const s=cfg.sorts[+sortSel.value]; if(s&&s.cmp)rows=rows.slice().sort(s.cmp);
      if(!rows.length){ list.append(cfg.entries().length?mk('div','pempty','Nothing matches those filters.'):emptyCatalogNote(cfg.kind)); return; }
      rows.forEach(e=>{
        const it=mk('div','pitem');
        const b=mk('div','b');
        const t1=mk('div','t1'); t1.innerHTML=`${e.brand} ${e.model}${srcBadge(e)}`;
        b.append(t1, mk('div','t2',cfg.line(e)));
        it.append(b);
        const add=mk('button','act','Add'); add.style.flex='0 0 58px';
        const go=()=>{ cfg.add(e); close(); render(); list0(); };
        add.onclick=e2=>{e2.stopPropagation();go();};
        it.onclick=go;
        it.append(add);
        list.append(it);
      });
    }
    search.oninput=draw; sortSel.onchange=draw;
    draw();
  });
}
// `list` is the sidebar refresh; the picker shadows the name locally.
const list0=()=>list();

function pickNvr(){
  listPicker({
    title:'Add a recorder', kind:'NVRs',
    entries:()=>CAT.all('nvrs'),
    filters:[['PoE built in',e=>(e.poePorts||0)>0,false],
             ['16+ channels',e=>(e.channels||0)>=16,false]],
    sorts:[{label:'Sort: name',cmp:(a,b)=>(a.brand+a.model).localeCompare(b.brand+b.model)},
           {label:'Sort: channels',cmp:(a,b)=>(b.channels||0)-(a.channels||0)},
           {label:'Sort: storage',cmp:(a,b)=>(b.storageGB||0)-(a.storageGB||0)}],
    line:e=>[`${e.channels||'?'} ch`,
             e.storageGB?`${(e.storageGB/1000).toFixed(1)} TB fitted`:null,
             e.maxStreamsMbps?`${e.maxStreamsMbps} Mbps in`:null,
             e.compat?e.compat.join('/'):null].filter(Boolean).join(' · '),
    add:e=>{
      let n=1; while(nvrs.some(v=>v.id==='N'+n))n++;
      nvrs.push({id:'N'+n,name:`${e.brand} ${e.model}`,catKey:e.key||e.id,on:true,
        spec:(({source,key,...r})=>r)(e)});
      select('nvr','N'+n);
      toast(`${e.model} added`);
    }
  });
}
function pickCamera(nvr){
  const tags=new Set();
  nvrs.forEach(n=>(specOfNvr(n).compat||[]).forEach(t=>tags.add(t)));
  const fits=e=>!e.compat||!tags.size||e.compat.some(t=>tags.has(t));
  listPicker({
    title:nvr?`Add a camera to ${nvr.name}`:'Add a camera', kind:'cameras',
    entries:()=>CAT.all('cameras'),
    filters:[['Compatible only',fits,true],
             ['PoE',e=>e.poe,false],
             ['Wi-Fi',e=>e.wifi,false],
             ['PTZ',e=>e.ptz,false],
             ['4K+',e=>((e.resolution&&e.resolution.w)||0)>=3840,false]],
    sorts:[{label:'Sort: name',cmp:(a,b)=>(a.brand+a.model).localeCompare(b.brand+b.model)},
           {label:'Sort: resolution',cmp:(a,b)=>((b.resolution||{}).w||0)-((a.resolution||{}).w||0)},
           {label:'Sort: identify range',cmp:(a,b)=>rangeOfEntry(b)-rangeOfEntry(a)},
           {label:'Sort: field of view',cmp:(a,b)=>(b.fovH||0)-(a.fovH||0)}],
    line:e=>{
      const r=e.resolution?`${e.resolution.w}×${e.resolution.h}`:'resolution?';
      const id=rangeOfEntry(e);
      return [r, `${e.fovH||'?'}° H`,
        id?`face-ID to ${Math.round(id)} ft`:null,
        e.irFt?`IR ${e.irFt} ft`:null,
        e.poe?'PoE':null, e.wifi?'Wi-Fi':null,
        fits(e)?null:'<span class="incompat">not compatible</span>'].filter(Boolean).join(' · ');
    },
    add:e=>{
      let n=1; while(cams.some(v=>v.id==='C'+n))n++;
      const c={id:'C'+n,name:`${e.model}`,catKey:e.key||e.id,
        spec:(({source,key,...r})=>r)(e),
        nvr:nvr?nvr.id:(nvrs[0]&&nvrs[0].id)||null,
        // The bearing the bracket faces. A head's pan travel is measured from
        // here, so it has to be recorded at placement rather than inferred
        // later from wherever the camera happens to be aimed.
        panHome:0,
        x:-14,y:16,z:10.5,a:0,t:15,note:'',on:true};
      cams.push(c);
      select('cam',c.id);
      toast(`${e.model} added — drag it into place in the plan`);
    }
  });
}
// identify distance for a catalog entry, used for sorting and the summary line
function rangeOfEntry(e){
  if(!e.resolution||!e.fovH)return 0;
  return distForDensity({resW:e.resolution.w,fovH:e.fovH},DORI.identify);
}
function pickOccluder(){
  modal('Add an occluder',(box,close)=>{
    const g=mk('div','pgrid');
    Object.entries(OCC_PRESETS).forEach(([k,P])=>{
      const c=mk('div','pcard');
      c.append(mk('div','t1',P.name));
      c.append(mk('div','t2',P.shape==='tree'?'trunk + canopy':P.shape==='cyl'?'cylinder':`${P.w}×${P.d} ft`));
      c.onclick=()=>{
        const b=makeOccluder(k,{x:ctrX-5,y:ctrY-5});
        boxes.push(b); splat=null; close(); select('box',b.id);
        toast(P.name+' added');
      };
      g.append(c);
    });
    box.append(g);
    const foot=mk('div','pfoot');
    const cancel=mk('button','act','Close'); cancel.onclick=close;
    foot.append(cancel); box.append(foot);
  });
}
