/* ---------------- project: persistence and totals ---------------- */
/*
   One JSON document holds the scene and a snapshot of only the catalog
   entries the scene references. That snapshot is what makes a saved project
   self-describing: open it anywhere, with or without a reachable catalog, and
   every camera still resolves to the specs its coverage numbers were computed
   from.
*/
const LS_KEY='sightline.project.v1';
const LS_CAT='sightline.usercatalog.v1';

// Only what the scene actually references, not the whole catalog.
function projectSnapshot(){
  const pick=(kind,keys)=>{
    const out=[];
    keys.forEach(k=>{
      const e=CAT.byKey(kind,k);
      if(e){ const {source,key,...rest}=e; out.push(rest); }
    });
    return out;
  };
  const camKeys=[...new Set(cams.map(c=>c.catKey).filter(Boolean))];
  const nvrKeys=[...new Set(nvrs.map(n=>n.catKey).filter(Boolean))];
  const snap={nvrs:pick('nvrs',nvrKeys), cameras:pick('cameras',camKeys)};
  // Fall back to the copy embedded on each entity when the catalog has not
  // loaded yet - otherwise the first autosave would strip the specs.
  cams.forEach(c=>{ if(c.spec && !snap.cameras.some(e=>e.id===c.spec.id))snap.cameras.push(c.spec); });
  nvrs.forEach(n=>{ if(n.spec && !snap.nvrs.some(e=>e.id===n.spec.id))snap.nvrs.push(n.spec); });
  return snap;
}
function serialize(){
  return {
    schema:1,
    scene:{
      nvrs:nvrs.map(({...n})=>n),
      cameras:cams.map(({_spec,...c})=>c),
      occluders:boxes.map(({...b})=>b),
      prop, fence, opts
    },
    catalogSnapshot:projectSnapshot()
  };
}
function loadDoc(doc){
  if(!doc||!doc.scene)return false;
  const s=doc.scene;
  if(doc.catalogSnapshot)CAT.seedFromProject(doc.catalogSnapshot);
  if(Array.isArray(s.nvrs))nvrs=s.nvrs;
  if(Array.isArray(s.cameras))cams=s.cameras;
  if(Array.isArray(s.occluders))boxes=s.occluders;
  if(Array.isArray(s.prop))prop=s.prop;
  if(s.fence)fence=s.fence;
  if(s.opts)opts={...opts,...s.opts};
  migrateScene();
  return true;
}
let saveTimer;
function autosave(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    try{ localStorage.setItem(LS_KEY,JSON.stringify(serialize())); }
    catch(e){ /* private mode or quota: the app still works, it just won't persist */ }
  },600);
}
function restore(){
  try{
    const raw=localStorage.getItem(LS_KEY);
    if(!raw)return false;
    return loadDoc(JSON.parse(raw));
  }catch(e){ return false; }
}
function restoreUserCatalog(){
  try{
    const raw=localStorage.getItem(LS_CAT);
    if(raw)CAT.addImported(JSON.parse(raw));
  }catch(e){}
}
function exportProject(){
  const blob=new Blob([JSON.stringify(serialize(),null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='sightline-project.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
// One picker for both kinds of file. A document with a `scene` is a project;
// one with `nvrs` or `cameras` is a catalog to merge.
function importFile(onDone){
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='.json,application/json';
  inp.onchange=()=>{
    const f=inp.files&&inp.files[0]; if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{
      try{
        const doc=JSON.parse(rd.result);
        if(doc.scene){ loadDoc(doc); toast('Project loaded'); }
        else if(doc.nvrs||doc.cameras){
          CAT.addImported(doc);
          try{ localStorage.setItem(LS_CAT,JSON.stringify({nvrs:doc.nvrs||[],cameras:doc.cameras||[]})); }catch(e){}
          toast(`Catalog merged — ${(doc.nvrs||[]).length} NVRs, ${(doc.cameras||[]).length} cameras`);
        }
        else { toast('Not a project or catalog file'); return; }
        onDone&&onDone();
      }catch(e){ toast('Could not read that file'); }
    };
    rd.readAsText(f);
  };
  inp.click();
}

/* ---------------- recording maths ---------------- */
/*
   Continuous recording is assumed. Bitrate is estimated from pixel rate:

       bitrate = w * h * fps * bpp

   The bits-per-pixel constants below are estimates for a typical outdoor
   scene, not a manufacturer figure - a static view compresses far better
   than a windy tree line. Motion-only recording would multiply the result by
   a duty factor this app does not model.
*/
const BPP={low:0.030, med:0.060, high:0.100};
const CODEC_MUL={'H.265':1, 'H.264':1.7, 'H.264+':1.3, 'H.265+':0.8};

const nvrOf=c=>nvrs.find(n=>n.id===c.nvr)||null;
// camera override, else its recorder's, else the project default
function inherit(c,field){
  if(c[field]!==undefined&&c[field]!==null)return {v:c[field],from:'camera'};
  const n=nvrOf(c);
  if(n&&n[field]!==undefined&&n[field]!==null)return {v:n[field],from:'nvr'};
  return {v:opts[field],from:'project'};
}
function bitrateOf(c){
  const S=specOf(c);
  const fps=inherit(c,'fps').v, q=inherit(c,'quality').v;
  const codec=(S.formats&&S.formats[0])||'H.265';
  const mul=CODEC_MUL[codec]||1;
  return S.resW*S.resH*fps*(BPP[q]||BPP.med)*mul/1e6;   // Mbps
}
function totals(){
  const live=cams.filter(c=>c.on);
  const mbps=live.reduce((s,c)=>s+bitrateOf(c),0);
  const storageGB=nvrs.filter(n=>n.on).reduce((s,n)=>s+((n.storageGB??specOfNvr(n).storageGB)||0),0);
  const cost=nvrs.reduce((s,n)=>s+(n.price||0),0)+cams.reduce((s,c)=>s+(c.price||0),0);
  const days=mbps>0?(storageGB*8*1000)/mbps/86400:0;
  // channels used vs available, so an over-subscribed recorder is visible
  const chans=nvrs.filter(n=>n.on).reduce((s,n)=>s+(specOfNvr(n).channels||0),0);
  return {nvrs:nvrs.length, cams:live.length, cost, mbps, storageGB, days, chans};
}
function specOfNvr(n){
  const e=n.catKey?CAT.byKey('nvrs',n.catKey):null;
  return e||n.spec||{};
}
const priceKnown=()=>cams.some(c=>c.price)||nvrs.some(n=>n.price);
