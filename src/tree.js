/* ---------------- scene tree ---------------- */
/*
   NVRs own cameras (a wiring relationship: channels, storage, cost).
   Occluders nest spatially - a child inherits its parent's transform.
   Both sections collapse; the collapsed set is remembered per node id.
*/
let collapsed=new Set();
let selProject=false;
const isOpen=id=>!collapsed.has(id);
function toggleNode(id){ collapsed.has(id)?collapsed.delete(id):collapsed.add(id); renderTree(); }

// One selection across four kinds of entity, so the property editor only ever
// has one thing to render.
function select(kind,id){
  sel=null; selBox=null; selProp=false; selNvr=null; selProject=false;
  if(kind==='cam')sel=id;
  else if(kind==='box')selBox=id;
  else if(kind==='nvr')selNvr=id;
  else if(kind==='prop')selProp=true;
  else if(kind==='project')selProject=true;
  render(); list();
}
const selKind=()=> sel?'cam' : selBox?'box' : selNvr?'nvr' : selProp?'prop' : selProject?'project' : null;

const mk=(tag,cls,txt)=>{const e=document.createElement(tag); if(cls)e.className=cls;
  if(txt!==undefined)e.textContent=txt; return e;};

function row({label,meta,selected,dot,on,onSelect,onEye,indent,twisty,onTwisty}){
  const r=mk('div','trow'+(selected?' sel':'')+(on===false?' off':''));
  if(dot)r.style.setProperty('--dot',dot);
  r.style.paddingLeft=(6+(indent||0)*13)+'px';
  const tw=mk('span','tw',twisty===undefined?'':(twisty?'▾':'▸'));
  if(twisty!==undefined){ tw.style.cursor='pointer';
    tw.onclick=e=>{e.stopPropagation(); onTwisty&&onTwisty();}; }
  r.append(tw);
  if(dot){ const d=mk('span','dot'); d.style.background=dot; r.append(d); }
  r.append(mk('span','nm',label));
  if(meta)r.append(mk('span','mt',meta));
  if(onEye){
    const b=mk('button','eye',on?'●':'○');
    b.onclick=e=>{e.stopPropagation(); onEye();};
    r.append(b);
  }
  r.onclick=onSelect;
  return r;
}
function section(title,count,onAdd,openKey,body){
  const wrap=mk('div','tsec');
  const h=mk('div','thead');
  h.append(mk('span','tw',isOpen(openKey)?'▾':'▸'), mk('span',null,title), mk('span','cnt','· '+count));
  h.onclick=()=>toggleNode(openKey);
  if(onAdd){
    const b=mk('button','tadd','+');
    b.title='Add';
    b.onclick=e=>{e.stopPropagation(); onAdd();};
    h.append(b);
  }
  wrap.append(h);
  if(isOpen(openKey))body(wrap);
  return wrap;
}

function renderTree(){
  const pane=$('treepane'); pane.textContent='';

  // project root
  pane.append(row({label:'Project', meta:opts.night?'night':'day',
    selected:selProject, indent:0, onSelect:()=>select('project')}));

  // ---- NVRs, each with its cameras ----
  pane.append(section('NVRs',nvrs.length,()=>pickNvr(),'sec-nvr',wrap=>{
    if(!nvrs.length){
      const e=mk('div','note','No recorder yet. Add one to hang cameras off it.');
      e.style.padding='2px 12px 6px'; wrap.append(e);
    }
    nvrs.forEach(n=>{
      const kids=cams.filter(c=>c.nvr===n.id);
      const S=specOfNvr(n);
      const over=S.channels&&kids.length>S.channels;
      const r=row({label:n.name,
        meta:`${kids.length}/${S.channels||'?'}`,
        selected:selNvr===n.id, on:n.on!==false, indent:1,
        twisty:isOpen(n.id), onTwisty:()=>toggleNode(n.id),
        onSelect:()=>select('nvr',n.id),
        onEye:()=>{n.on=n.on===false;render();list();}});
      if(over)r.querySelector('.mt').style.color='var(--warn)';
      const add=mk('button','tadd','+');
      add.title='Add a camera to this recorder';
      add.onclick=e=>{e.stopPropagation(); pickCamera(n);};
      r.append(add);
      wrap.append(r);
      if(isOpen(n.id))kids.forEach(c=>wrap.append(camRow(c,2)));
    });
    // cameras with no recorder still have to be reachable
    const orphans=cams.filter(c=>!c.nvr||!nvrs.some(n=>n.id===c.nvr));
    if(orphans.length){
      const h=mk('div','note','Not connected to a recorder');
      h.style.padding='4px 12px 2px'; wrap.append(h);
      orphans.forEach(c=>wrap.append(camRow(c,2)));
    }
  }));

  // ---- occluders, nested ----
  pane.append(section('Occluders',boxes.length,()=>pickOccluder(),'sec-occ',wrap=>{
    const walk=(pid,depth)=>{
      childrenOf(pid).forEach(b=>{
        const kids=childrenOf(b.id);
        wrap.append(boxRow(b,depth,kids.length));
        if(kids.length&&isOpen(b.id))walk(b.id,depth+1);
      });
    };
    walk(null,1);
    // drop target for un-parenting
    const root=mk('div','trow');
    root.style.paddingLeft='19px';
    root.append(mk('span','tw',''),mk('span','nm','— drop here to un-parent —'));
    root.querySelector('.nm').style.cssText='color:#5A6678;font-family:var(--mono);font-size:9.5px';
    dropTarget(root,null);
    wrap.append(root);
  }));

  // ---- property boundary ----
  pane.append(row({label:'Property boundary',
    meta:Math.round(polyArea()).toLocaleString()+' sq ft',
    selected:selProp, indent:0, onSelect:()=>select('prop')}));
}

function camRow(c,depth){
  const S=specOf(c);
  const r=row({label:`${c.id} · ${c.name}`, meta:S.model,
    selected:sel===c.id, on:c.on, dot:colC(c), indent:depth,
    onSelect:()=>select('cam',c.id),
    onEye:()=>{c.on=!c.on;render();list();}});
  return r;
}
function boxRow(b,depth,kidCount){
  const tall=(zmax(b)-zmin(b)).toFixed(1);
  const r=row({label:b.name, meta:tall+' ft'+(b.yaw?` ${Math.round(b.yaw)}°`:''),
    selected:selBox===b.id, on:b.on, indent:depth,
    twisty:kidCount?isOpen(b.id):undefined,
    onTwisty:()=>toggleNode(b.id),
    onSelect:()=>select('box',b.id),
    onEye:()=>{b.on=!b.on;splat=null;render();list();}});
  r.draggable=true;
  r.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',b.id);e.dataTransfer.effectAllowed='move';});
  dropTarget(r,b.id);
  return r;
}
// Reparenting by drag. setParent refuses cycles, and the refusal is reported
// rather than silently ignored.
function dropTarget(el,parentId){
  el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drop');});
  el.addEventListener('dragleave',()=>el.classList.remove('drop'));
  el.addEventListener('drop',e=>{
    e.preventDefault(); e.stopPropagation(); el.classList.remove('drop');
    const id=e.dataTransfer.getData('text/plain');
    const b=boxes.find(v=>v.id===id);
    if(!b||b.id===parentId)return;
    if(!setParent(b,parentId)){ toast('That would nest an occluder inside itself'); return; }
    splat=null; render(); list();
  });
}
