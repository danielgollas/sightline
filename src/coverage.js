/* ---------------- coverage totals ---------------- */
/*
   One sweep function, run two ways: coarsely on the main thread for
   responsiveness, and at full resolution in a worker once interaction stops.

   The worker is assembled from the SOURCE TEXT of the functions below, via
   Function.prototype.toString. That is deliberate. Hand-copying the occlusion
   code into a worker would create a third implementation to keep in step with
   blocked() and makeCaster, and the developer guide is emphatic that this
   class of divergence fails silently. Stringifying the live functions means
   the worker cannot be running different logic - it is running these bytes.
*/

// The sweep. Pure: everything it touches is module state the worker also has.
function computeCoverage(step){
  const tz=targetZ();
  const B=propBounds();
  let ac=0,ai=0,n=0;
  const near=(x,y)=>boxes.some(b=>{
    if(!b.on||zmax(b)<3)return false;
    const dx=Math.max(b.x0-x,0,x-b.x1), dy=Math.max(b.y0-y,0,y-b.y1);
    return Math.hypot(dx,dy)<=25;});
  let nc=0,cc=0,ci=0,dut=0;
  const live=cams.filter(c=>c.on);
  const anyTour=live.some(c=>c.tour&&c.tour.length);
  for(let x=B.x0;x<=B.x1;x+=step)for(let y=B.y0;y<=B.y1;y+=step){
    if(!inProp(x,y)||inAnyBox(x,y))continue;
    n++;
    let best=0;
    for(const c of live){ const q=quality(c,x,y,tz); if(q>best)best=q; }
    if(best)ac++;
    if(best===2)ai++;
    if(!near(x,y))continue;
    nc++;
    if(best)cc++;
    if(best===2)ci++;
    if(anyTour){
      let fr=0;
      for(const c of live){ const f=swept(c,x,y,tz).frac; if(f>fr)fr=f; }
      dut+=fr;
    }
  }
  const cell=step*step;
  return {n,ac,ai,nc,cc,ci,dut,anyTour,
          area:Math.round(n*cell), areaNear:Math.round(nc*cell)};
}

/* ---------- worker assembly ---------- */
// Every function the sweep reaches. Missing one shows up immediately as a
// ReferenceError in the worker, not as a wrong number.
function workerSource(){
  const named=[computeCoverage,quality,qual,swept,stops,order,visits,blocked,
    hitsOccluder,insideOccluder,canopyOf,segHitsBox,xyRange,segHitsWarped,
    segHitsCyl,segHitsEllipsoid,localM,worldM,chain,boxById,wouldCycle,
    hitsFence,inProp,inAnyBox,propBounds,distForDensity,rangeCap,specOf];
  const arrows={bilin,topAt,baseAt,zmax,zmin,flatT,flatB,isFlat,isIdentityM,
    identifyFt,detectFt,rad,deg,clamp,norm};
  const tx='const TX={'+Object.entries(TX)
    .map(([k,v])=>`${k}:${v.toString()}`).join(',')+'};';
  const fns=named.map(f=>f.toString()).join('\n');
  const arr=Object.entries(arrows).map(([k,v])=>`const ${k}=${v.toString()};`).join('\n');
  return `
"use strict";
let boxes=[],prop=[],fence={},cams=[],opts={},sceneGen=0;
let _mCache=new Map(),_mGen=-1;
// There is no catalog in here. Every camera arrives with its spec already
// resolved and attached, so specOf() falls straight through to it - and the
// worker is therefore guaranteed to be using the same numbers the main thread
// used, not a second lookup that could resolve differently.
const CAT={byKey:()=>null};
const M_PER_FT=${M_PER_FT};
const DORI=${JSON.stringify(DORI)};
const MOVE=${MOVE};
const occOn=()=>opts.occ, tourOn=()=>opts.tour, night=()=>opts.night, targetZ=()=>opts.tz;
${arr}
${tx}
${fns}
onmessage=function(e){
  const d=e.data;
  boxes=d.boxes; prop=d.prop; fence=d.fence; cams=d.cams; opts=d.opts;
  sceneGen++;
  postMessage({id:d.id, result:computeCoverage(d.step)});
};`;
}
let covWorker=null, covSeq=0, covPending=null;
function ensureWorker(){
  if(covWorker!==null)return covWorker;
  try{
    const blob=new Blob([workerSource()],{type:'text/javascript'});
    covWorker=new Worker(URL.createObjectURL(blob));
    covWorker.onmessage=e=>{
      if(e.data.id!==covSeq)return;          // a newer request has superseded this
      covPending=null;
      paintStats(e.data.result,false);
    };
    covWorker.onerror=()=>{ covWorker=false; };   // fall back to the main thread
  }catch(err){ covWorker=false; }
  return covWorker;
}
// Strip anything the structured clone cannot carry, and anything the worker
// has no business seeing.
const sceneMsg=()=>({
  boxes:JSON.parse(JSON.stringify(boxes)),
  prop:JSON.parse(JSON.stringify(prop)),
  fence:JSON.parse(JSON.stringify(fence)),
  // Resolve each camera's catalog entry HERE and send it inline. Dropping
  // catKey stops the worker trying to look anything up.
  cams:cams.map(c=>{
    const {_spec,catKey,...rest}=c;
    const raw=(catKey&&CAT.byKey('cameras',catKey))||c.spec||{};
    const {source,key,...clean}=raw;
    return JSON.parse(JSON.stringify({...rest,spec:clean}));
  }),
  opts:JSON.parse(JSON.stringify(opts))
});

let statTimer;
function updateStats(){
  // coarse pass now, so the bar is never blank or wrong for long
  paintStats(computeCoverage(3.0),true);
  clearTimeout(statTimer);
  statTimer=setTimeout(()=>{
    const w=ensureWorker();
    if(!w){ paintStats(computeCoverage(1.5),false); return; }
    covSeq++;
    covPending=covSeq;
    w.postMessage({...sceneMsg(), step:1.5, id:covSeq});
  },160);
}
