/* ------- vector cones: 3D-accurate visibility, drawn as crisp polygons ------- */
/*
   Measured: this is essentially all of drawPlan. With cones off the rest of
   the plan view - grass, boxes, cameras, grid, the SVG itself - costs about
   1 ms, and the cone march costs 85. So this file is where plan-view
   responsiveness lives or dies.

   Two things keep it cheap:

     1. ONE march per azimuth, not one per quality tier. qual() already
        returns 0/1/2; marching twice and discarding the tier each time
        doubled the occlusion work for nothing.

     2. Geometry is produced in WORLD space and cached, then projected to
        screen at draw time. Panning and zooming change only the projection,
        so they no longer re-march anything, and dragging one camera leaves
        the other cameras' cones cached.
*/

// March one azimuth once, returning the visible distance intervals for BOTH
// tiers: `det` is anything visible at all, `id` is face-ID range.
function intervalsBoth(c,azm,tz,dstep){
  const L=lensOf(c), a=rad(azm), ca=Math.cos(a), sa=Math.sin(a);
  const det=[], id=[];
  let od=null, oi=null;
  for(let d=1;d<=L.r;d+=dstep){
    const q=qual(c,c.x+d*ca,c.y+d*sa,tz,c.a,c.t||0);
    if(q>=1){ if(od===null)od=d; }
    else if(od!==null){ det.push([od,d-dstep]); od=null; }
    if(q===2){ if(oi===null)oi=d; }
    else if(oi!==null){ id.push([oi,d-dstep]); oi=null; }
  }
  if(od!==null)det.push([od,L.r]);
  if(oi!==null)id.push([oi,L.r]);
  return {det,id};
}
// merge adjacent azimuths into smooth sector polygons, in world coordinates
function mergeRuns(c,cols){
  const polys=[]; const used=cols.map(col=>col.iv.map(()=>false));
  for(let i=0;i<cols.length;i++){
    for(let j=0;j<cols[i].iv.length;j++){
      if(used[i][j])continue;
      const run=[{a:cols[i].a,iv:cols[i].iv[j]}]; used[i][j]=true;
      let cur=cols[i].iv[j];
      for(let k=i+1;k<cols.length;k++){
        let bi=-1,bd=1e9;
        cols[k].iv.forEach((v,m)=>{
          if(used[k][m])return;
          const dd=Math.abs(v[0]-cur[0])+Math.abs(v[1]-cur[1]);
          if(dd<bd){bd=dd;bi=m;}
        });
        if(bi<0||bd>6)break;
        used[k][bi]=true; cur=cols[k].iv[bi];
        run.push({a:cols[k].a,iv:cur});
      }
      if(run.length<2)continue;
      const outer=run.map(r=>[c.x+r.iv[1]*Math.cos(rad(r.a)),c.y+r.iv[1]*Math.sin(rad(r.a))]);
      const inner=run.slice().reverse().map(r=>[c.x+r.iv[0]*Math.cos(rad(r.a)),c.y+r.iv[0]*Math.sin(rad(r.a))]);
      polys.push([...outer,...inner]);
    }
  }
  return polys;
}
// world-space polygons for both tiers, from a single sweep of azimuths
function conePolys(c,tz,astep,dstep){
  const L=lensOf(c), a0=c.a-L.f/2, a1=c.a+L.f/2;
  const cd=[], ci=[];
  for(let a=a0;a<=a1+1e-6;a+=astep){
    const r=intervalsBoth(c,a,tz,dstep);
    cd.push({a,iv:r.det}); ci.push({a,iv:r.id});
  }
  return {det:mergeRuns(c,cd), id:mergeRuns(c,ci)};
}

/* ---------- cache ---------- */
// Keyed on everything the march actually depends on. The geometry key is the
// same string the AO bake uses, so the two cannot disagree about whether the
// scene moved.
// Per camera, not one flat map. A flat map with a global size cap looks fine
// until a long drag fills it: the clear then evicts every OTHER camera too, so
// all six re-march on one frame and the drag hitches periodically. Evicting
// within the camera that is actually moving keeps the others' work.
//
// Each camera needs a handful of live entries at once - its current pose plus
// one per PT circuit stop when circuit overlays are on - so the per-camera cap
// is small and the eviction is oldest-first.
let _coneCache=new Map(), _coneGeo='';
const CONE_PER_CAM=8;
// Detail is NOT part of the pose key. Grabbing the pointer switches the whole
// view from fine to coarse, and if detail keyed the cache that transition
// re-marched every camera on the first drag frame - a visible hitch exactly
// when the user starts interacting. A fine result is strictly better than the
// coarse one it would replace, so a coarse request happily reuses it.
function conePoseKey(c,tz){
  return `${c.x},${c.y},${c.z},${c.a},${c.t}|${tz}|${opts.occ?1:0}${opts.night?1:0}`;
}
function conesFor(c,tz,astep,dstep,geo){
  if(geo!==_coneGeo){ _coneCache.clear(); _coneGeo=geo; }
  let per=_coneCache.get(c.id);
  if(!per){ per=new Map(); _coneCache.set(c.id,per); }
  const k=conePoseKey(c,tz);
  const fine=!coarse;
  let e=per.get(k);
  if(e && (e.fine || !fine)){          // reuse fine for coarse, never the reverse
    per.delete(k); per.set(k,e);       // refresh recency
    return e;
  }
  e=conePolys(c,tz,astep,dstep);
  e.fine=fine;
  per.set(k,e);
  while(per.size>CONE_PER_CAM)per.delete(per.keys().next().value);
  return e;
}
const coneD=pts=>'M '+pts.map(([x,y])=>`${wx(x).toFixed(1)} ${wy(y).toFixed(1)}`).join(' L ')+' Z';
