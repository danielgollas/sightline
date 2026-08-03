/* ---------------- camera POV ---------------- */
function camBasis(c,aim,tlt){
  const a=rad(aim), t=rad(tlt);
  const dir=[Math.cos(a)*Math.cos(t), Math.sin(a)*Math.cos(t), -Math.sin(t)];
  // screen-right is world-up crossed with the view direction
  let r=[ -dir[1], dir[0], 0 ];
  const rl=Math.hypot(r[0],r[1])||1; r=[r[0]/rl,r[1]/rl,0];
  const u=[ r[1]*dir[2]-r[2]*dir[1], r[2]*dir[0]-r[0]*dir[2], r[0]*dir[1]-r[1]*dir[0] ];
  return {dir,r,u:[-u[0],-u[1],-u[2]]};
}
const toCam=(c,B,p)=>{
  const v=[p[0]-c.x,p[1]-c.y,p[2]-c.z];
  return [v[0]*B.r[0]+v[1]*B.r[1]+v[2]*B.r[2],
          v[0]*B.u[0]+v[1]*B.u[1]+v[2]*B.u[2],
          v[0]*B.dir[0]+v[1]*B.dir[1]+v[2]*B.dir[2]];
};
// clip a camera-space polygon against a half-space given by a signed distance
function clipPlane(poly,fn){
  if(!poly.length)return poly;
  const out=[];
  for(let i=0;i<poly.length;i++){
    const A=poly[i], Bp=poly[(i+1)%poly.length];
    const da=fn(A), db=fn(Bp);
    if(da>=0)out.push(A);
    if((da>=0)!==(db>=0)){
      const t=da/(da-db);
      out.push([A[0]+(Bp[0]-A[0])*t, A[1]+(Bp[1]-A[1])*t, A[2]+(Bp[2]-A[2])*t]);
    }
  }
  return out;
}
// near plane plus the two sides of the horizontal field of view.
// without the side planes a point can sit in front of the lens but outside
// the FOV, and its edge stretches back across the frame.
function clipWedge(poly,halfFov){
  const h=rad(Math.min(halfFov,89.5)), ch=Math.cos(h), sh=Math.sin(h);
  let q=clipPlane(poly,p=>p[2]-0.25);
  q=clipPlane(q,p=> p[0]*ch+p[2]*sh);
  q=clipPlane(q,p=>-p[0]*ch+p[2]*sh);
  return q;
}
function povScreen(c,pt,VW,VH){
  const L=lensOf(c);
  const phi=Math.atan2(pt[0],pt[2]);
  const rr=Math.hypot(pt[0],pt[2])||1e-6;
  const h=pt[1]/rr;
  return [VW/2 + (phi/rad(L.f/2))*(VW/2),
          VH/2 - (h/Math.tan(rad(L.vf/2)))*(VH/2)];
}
function povPoly(c,B,world,VW,VH,sub){
  // straight world edges are curves in a cylindrical image, so subdivide first
  const n=sub===undefined?8:sub;
  const W=[];
  for(let i=0;i<world.length;i++){
    const A=world[i], Bp=world[(i+1)%world.length];
    for(let k=0;k<n;k++)
      W.push([A[0]+(Bp[0]-A[0])*k/n, A[1]+(Bp[1]-A[1])*k/n, A[2]+(Bp[2]-A[2])*k/n]);
  }
  const cl=clipWedge(W.map(p=>toCam(c,B,p)),lensOf(c).f/2);
  if(cl.length<3)return null;
  // vertical extent is not a plane in a cylindrical image, so clip the
  // projected polygon to the frame instead — stops off-screen corners
  // dragging a stretched shape across the view
  let pts=cl.map(p=>povScreen(c,p,VW,VH));
  const M=6;
  pts=clip2D(pts,q=>q[1]+M);
  pts=clip2D(pts,q=>VH+M-q[1]);
  pts=clip2D(pts,q=>q[0]+M);
  pts=clip2D(pts,q=>VW+M-q[0]);
  if(pts.length<3)return null;
  return {pts,d:cl.reduce((s,p)=>s+p[2],0)/cl.length};
}
function clip2D(poly,fn){
  if(!poly.length)return poly;
  const out=[];
  for(let i=0;i<poly.length;i++){
    const A=poly[i], Bp=poly[(i+1)%poly.length];
    const da=fn(A), db=fn(Bp);
    if(da>=0)out.push(A);
    if((da>=0)!==(db>=0)){
      const t=da/(da-db);
      out.push([A[0]+(Bp[0]-A[0])*t, A[1]+(Bp[1]-A[1])*t]);
    }
  }
  return out;
}
function drawPOVOverlay(c,svgEl,VW,VH){
  svgEl.textContent='';
  svgEl.setAttribute('viewBox',`0 0 ${VW} ${VH}`);
  const B=camBasis(c,c.a,c.t||0);
  cams.forEach(o=>{
    if(o===c||!o.on)return;
    const p=toCam(c,B,[o.x,o.y,o.z]);
    if(p[2]<0.3)return;
    const sp=povScreen(c,p,VW,VH);
    if(sp[0]<0||sp[0]>VW||sp[1]<0||sp[1]>VH)return;
    svgEl.append(el('circle',{cx:sp[0],cy:sp[1],r:4,fill:'none',
      stroke:colC(o),'stroke-width':1.8}));
    svgEl.append(txt({x:sp[0],y:sp[1]-7,'text-anchor':'middle',fill:colC(o),
      'font-family':'var(--mono)','font-size':9},o.id));
  });
  const housing=boxes.filter(b=>b.on&&c.x>b.x0&&c.x<b.x1&&c.y>b.y0&&c.y<b.y1&&
    c.z>=baseAt(b,c.x,c.y)-0.02&&c.z<=topAt(b,c.x,c.y)+0.02);
  svgEl.append(el('rect',{x:0,y:0,width:VW,height:16,fill:'rgba(11,15,20,.62)'}));
  svgEl.append(txt({x:8,y:12,fill:colC(c),'font-family':'var(--mono)','font-size':10,
    'font-weight':500},`${c.id} · ${c.name}`));
  svgEl.append(el('rect',{x:0,y:VH-14,width:VW,height:14,fill:'rgba(11,15,20,.62)'}));
  svgEl.append(txt({x:8,y:VH-4,fill:'#B9C0C9','font-family':'var(--mono)','font-size':8},
    `aim ${Math.round(c.a)}° · tilt ${Math.round(c.t)}° · ${lensOf(c).f}° lens`+
    (housing.length?` · in ${housing.map(b=>b.name).join(', ')}`:'')));
}

function drawPOV_svg_unused(c,svgEl,VW,VH){
  svgEl.textContent='';
  svgEl.setAttribute('viewBox',`0 0 ${VW} ${VH}`);
  const B=camBasis(c,c.a,c.t||0);
  const items=[];
  // sky
  const dfs=el('defs');
  const sg=el('linearGradient',{id:'sky'+c.id,x1:0,y1:0,x2:0,y2:1});
  sg.append(el('stop',{offset:'0%','stop-color':MAT.sky0}),
            el('stop',{offset:'100%','stop-color':MAT.sky1}));
  const gp2=el('pattern',{id:'gr'+c.id,width:14,height:14,patternUnits:'userSpaceOnUse'});
  gp2.append(el('rect',{width:14,height:14,fill:MAT.grass}));
  gp2.append(el('path',{d:'M2 12 l2 -5 M7 13 l1.5 -6 M11 11 l2 -4',
    stroke:MAT.grassLit,'stroke-width':1,'stroke-linecap':'round','stroke-opacity':.75}));
  dfs.append(sg,gp2); svgEl.append(dfs);
  svgEl.append(el('rect',{x:0,y:0,width:VW,height:VH,fill:`url(#sky${c.id})`}));
  // ground: the property polygon, edges subdivided so the curvature shows
  const g=[];
  for(let i=0;i<prop.length;i++){
    const [x0,y0]=prop[i],[x1,y1]=prop[(i+1)%prop.length];
    for(let k=0;k<12;k++)g.push([x0+(x1-x0)*k/12, y0+(y1-y0)*k/12, 0]);
  }
  const gp=povPoly(c,B,g,VW,VH,1);
  if(gp)items.push({d:1e6,e:el('polygon',{points:gp.pts.map(q=>`${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' '),
    fill:`url(#gr${c.id})`,stroke:MAT.grassDark,'stroke-width':1})});
  // shadows on the grass
  const hous=boxes.filter(b=>b.on&&c.x>b.x0&&c.x<b.x1&&c.y>b.y0&&c.y<b.y1&&
    c.z>=baseAt(b,c.x,c.y)-0.02&&c.z<=topAt(b,c.x,c.y)+0.02);
  [...boxes.filter(b=>b.on&&!hous.includes(b)).map(shadowOf),...fenceShadows()].forEach(poly=>{
    const P=povPoly(c,B,poly.map(([x,y])=>[x,y,0.02]),VW,VH);
    if(P)items.push({d:P.d-0.01,e:el('polygon',{
      points:P.pts.map(q=>`${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' '),
      fill:MAT.shadow,'fill-opacity':.42,stroke:'none'})});
  });
  // perimeter fence
  if(fence.on&&fence.h>0){
    for(let i=0;i<prop.length;i++){
      const [ax,ay]=prop[i], [bx,by]=prop[(i+1)%prop.length];
      const seg=[];
      for(let k=0;k<=10;k++)seg.push([ax+(bx-ax)*k/10, ay+(by-ay)*k/10, 0]);
      for(let k=10;k>=0;k--)seg.push([ax+(bx-ax)*k/10, ay+(by-ay)*k/10, fence.h]);
      const P=povPoly(c,B,seg,VW,VH,1);
      const nrm=normalOf([[ax,ay,0],[bx,by,0],[bx,by,fence.h]]);
      if(P)items.push({d:P.d,e:el('polygon',{
        points:P.pts.map(q=>`${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' '),
        fill:shade(nrm,MAT.wood),stroke:MAT.woodDark,'stroke-width':.7})});
    }
  }
  // structures — skip whatever the camera is mounted inside
  const housing=boxes.filter(b=>b.on&&c.x>b.x0&&c.x<b.x1&&c.y>b.y0&&c.y<b.y1&&
    c.z>=baseAt(b,c.x,c.y)-0.02&&c.z<=topAt(b,c.x,c.y)+0.02);
  boxes.forEach(b=>{
    if(!b.on||housing.includes(b))return;
    FACES.forEach(f=>{
      const W3=f.pts(b);
      if(!facesCamera(c,b,W3))return;          // never draw the back of a wall
      const P=povPoly(c,B,W3,VW,VH);
      if(!P)return;
      items.push({d:P.d,e:el('polygon',{points:P.pts.map(q=>`${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' '),
        fill:shade(outNormal(b,W3),matOf(b)),stroke:'rgba(0,0,0,.28)','stroke-width':.6})});
    });
  });
  // other cameras
  cams.forEach(o=>{
    if(o===c||!o.on)return;
    const p=toCam(c,B,[o.x,o.y,o.z]);
    if(p[2]<0.3)return;
    const sp=povScreen(c,p,VW,VH);
    if(sp[0]<-20||sp[0]>VW+20)return;
    items.push({d:-1,e:el('circle',{cx:sp[0],cy:sp[1],r:3.5,fill:'none',
      stroke:colC(o),'stroke-width':1.6})});
    items.push({d:-1,e:txt({x:sp[0],y:sp[1]-6,'text-anchor':'middle',fill:colC(o),
      'font-family':'var(--mono)','font-size':8},o.id)});
  });
  items.sort((a,b2)=>b2.d-a.d).forEach(i=>svgEl.append(i.e));
  // horizon
  const hp=[];
  for(let k=0;k<=24;k++){
    const phi=-lensOf(c).f/2+lensOf(c).f*k/24;
    const p=toCam(c,B,[c.x+60*Math.cos(rad(c.a+phi)), c.y+60*Math.sin(rad(c.a+phi)), c.z]);
    if(p[2]<0.3)continue;
    hp.push(povScreen(c,p,VW,VH));
  }
  if(hp.length>1)svgEl.append(el('polyline',{points:hp.map(q=>`${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' '),
    fill:'none',stroke:'#4A5462','stroke-width':.8,'stroke-dasharray':'4 4'}));
  svgEl.append(txt({x:8,y:14,fill:colC(c),'font-family':'var(--mono)','font-size':10,
    'font-weight':500},`${c.id} · ${c.name}`));
  svgEl.append(txt({x:8,y:VH-7,fill:'#8A9099','font-family':'var(--mono)','font-size':8},
    `aim ${Math.round(c.a)}° · tilt ${Math.round(c.t)}° · ${lensOf(c).f}° lens`+
    (housing.length?` · mounted in ${housing.map(b=>b.name).join(', ')}`:'')));
}
// width:height that renders the modelled FOV with square pixels
// the frame is the sensor's shape; the FOV is mapped to fill it
function lensAspect(c){ return lensOf(c).sensor; }
// A camera with a very wide lens gets a double-width cell. This asks the spec
// rather than the legacy `lens` tag, so a Duo added from the catalog is framed
// correctly too.
const isWide=c=>specOf(c).fovH>=150;

/* ---------------- pan and tilt limits ---------------- */
/*
   A real head cannot point anywhere. Tilt is bounded by the mount; pan is
   bounded only if the catalog says so (a PTZ that sweeps 355 degrees is
   effectively free, and a fixed camera is re-aimed by moving the bracket,
   which the plan view already allows).

   Per-camera overrides beat the catalog, which beats these defaults.
*/
const TILT_MIN=-25, TILT_MAX=60;
// A head that sweeps very nearly all the way round is not meaningfully
// limited, and pretending otherwise would put an arbitrary seam somewhere in
// the middle of a full circle.
const PAN_FREE=350;
function camLimits(c){
  const S=specOf(c);
  const pick=(a,b,d)=>a!==undefined&&a!==null?a:(b!==undefined&&b!==null?b:d);
  let aMin=pick(c.panMin,null,null), aMax=pick(c.panMax,null,null);
  if(aMin===null){
    // Derive from the head's travel. panRange is relative to however the
    // bracket was mounted, so it needs a reference bearing: panHome, recorded
    // when the camera was placed. Without one the mount orientation is
    // unknown and the only honest answer is unrestricted.
    const range=pick(c.panRange,S.panRange,null);
    if(range!==null && range<PAN_FREE && c.panHome!==undefined && c.panHome!==null){
      aMin=norm(c.panHome-range/2);
      aMax=norm(c.panHome+range/2);
    }
  }
  return {
    tMin:pick(c.tiltMin,S.tiltMin,TILT_MIN),
    tMax:pick(c.tiltMax,S.tiltMax,TILT_MAX),
    aMin, aMax,
    panRange:pick(c.panRange,S.panRange,null)
  };
}
// Signed offset from `from` to `to`, in -180..180.
const arc=(from,to)=>((to-from+540)%360)-180;
// Clamp a bearing into [aMin,aMax] the short way round.
function clampPan(a,aMin,aMax){
  const span=((aMax-aMin)+360)%360 || 360;
  const off=((a-aMin)+360)%360;
  if(off<=span)return norm(a);
  // outside: snap to whichever end is nearer
  return Math.abs(arc(a,aMax))<Math.abs(arc(a,aMin))?norm(aMax):norm(aMin);
}
// Aim the camera, respecting its limits. The PT circuit travels with it, the
// same way the D-pad has always moved it. Returns which limits were hit.
function aimTo(c,a,t){
  const L=camLimits(c);
  const t2=clamp(Math.round(t*10)/10,L.tMin,L.tMax);
  const a2=(L.aMin!==null&&L.aMax!==null)?clampPan(a,L.aMin,L.aMax):norm(a);
  const da=arc(c.a,a2), dt=t2-(c.t||0);
  c.a=a2; c.t=t2;
  if(c.tour){
    c.tour.forEach(k=>{
      k.a=norm(k.a+da);
      k.t=clamp(k.t+dt,L.tMin,L.tMax);
    });
  }
  return {pan:Math.abs(arc(a,a2))>0.05, tilt:Math.abs(t2-t)>0.05};
}

const STEP=2;
let holdTimer=null;
function nudge(c,da,dt){
  aimTo(c, c.a+(da||0), (c.t||0)+(dt||0));
  render(); list();
}

/* ---------------- drag the viewport to pan and tilt ---------------- */
/*
   Dragging is the default interaction on a camera view - no arming, no mode.

   The gearing inverts the actual projection rather than assuming the frame is
   linear in both axes. It is not: the camera image is linear in BEARING but
   tangent in ELEVATION, which is what makes a 189 degree lens representable at
   all. Treating the vertical as linear made the scene slide away from the
   pointer, more so further from the centre of frame, which is what made the
   first version of this feel wrong.

   Converting both the press and the current pointer position into angles and
   rotating by the difference keeps whatever you grabbed under the cursor, on
   both axes, anywhere in frame.
*/
// Screen position within a cell -> angle offsets from the camera's axis.
// phi is bearing (linear across the width), eps is elevation, positive up.
function frameAngles(c,fx,fy){
  const S=specOf(c);
  const phi=(fx-0.5)*S.fovH;
  const eps=deg(Math.atan((0.5-fy)*2*Math.tan(rad(S.fovV/2))));
  return {phi,eps};
}
// Redraw one cell rather than the whole app. A full render would re-march the
// coverage cones and repaint the plan on every pointer-move; the plan and the
// figures catch up when the drag ends.
function redrawCell(c,cell){
  const cvs=cell.querySelector('canvas'), sv=cell.querySelector('svg');
  const wide=isWide(c);
  if(renderPOVGL(c,cvs)){ cvs.style.display=''; drawPOVOverlay(c,sv,wide?1280:640,400); }
  else { cvs.style.display='none'; drawPOV_svg_unused(c,sv,wide?1280:640,400); }
}
let _limitToast=0;
function dragAim(cell,c){
  let d=null;
  cell.addEventListener('pointerdown',e=>{
    if(e.target.closest('.dpad')||e.target.closest('.zoombtn'))return;
    const r=cell.getBoundingClientRect();
    if(!r.width||!r.height)return;
    const A=frameAngles(c,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);
    d={r,phi0:A.phi,eps0:A.eps,a0:c.a,t0:c.t||0,moved:false};
    // Capture keeps the drag alive if the pointer leaves the cell. It can
    // throw when there is no active pointer with this id, and a failed
    // capture must not abort the drag.
    try{ cell.setPointerCapture(e.pointerId); }catch(_){}
    cell.classList.add('dragging');
    e.preventDefault();
  });
  cell.addEventListener('pointermove',e=>{
    if(!d)return;
    const A=frameAngles(c,(e.clientX-d.r.left)/d.r.width,(e.clientY-d.r.top)/d.r.height);
    if(Math.abs(A.phi-d.phi0)+Math.abs(A.eps-d.eps0)>0.3)d.moved=true;
    // Rotate by the difference so the grabbed direction stays under the
    // cursor. Down-tilt is positive, elevation is positive up, hence the sign.
    const hit=aimTo(c, d.a0-(A.phi-d.phi0), d.t0+(A.eps-d.eps0));
    redrawCell(c,cell);
    if((hit.pan||hit.tilt) && performance.now()-_limitToast>1200){
      _limitToast=performance.now();
      toast(hit.tilt?`${c.id} is at its tilt limit`:`${c.id} is at its pan limit`);
    }
  });
  ['pointerup','pointercancel'].forEach(v=>cell.addEventListener(v,()=>{
    if(!d)return;
    const moved=d.moved; d=null;
    cell.classList.remove('dragging');
    if(moved){ render(); list(); }      // now catch the plan and the figures up
  }));
}
// Tile / fullscreen toggle. This took over the click-to-maximise that used to
// live on the whole cell, because the cell itself is now a drag surface and a
// stray click at the end of a drag should not rearrange the grid.
const ZOOM_IN='<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">'+
  '<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>'+
  '<path d="M10.4 10.4 L14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'+
  '<path d="M7 4.8 v4.4 M4.8 7 h4.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const ZOOM_OUT='<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">'+
  '<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>'+
  '<path d="M10.4 10.4 L14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'+
  '<path d="M4.8 7 h4.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
function makeZoom(c){
  const b=document.createElement('button');
  b.className='zoombtn';
  const maxed=povMax===c.id;
  b.innerHTML=maxed?ZOOM_OUT:ZOOM_IN;
  b.title=maxed?'Back to the tiled view':'Fill the stage with this camera';
  b.setAttribute('aria-label',b.title);
  b.onclick=e=>{
    e.stopPropagation();
    povMax=povMax===c.id?null:c.id;
    renderPOV();
  };
  b.addEventListener('pointerdown',e=>e.stopPropagation());
  return b;
}
// A quiet hint that the view is draggable. Not a control - the whole cell is.
const PAN_ICON='<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">'+
  '<path d="M8 1.6 L8 14.4 M1.6 8 L14.4 8" stroke="currentColor" stroke-width="1.4"/>'+
  '<path d="M8 1.2 l2 2.2 h-4 z M8 14.8 l2 -2.2 h-4 z M1.2 8 l2.2 2 v-4 z M14.8 8 l-2.2 2 v-4 z" fill="currentColor"/></svg>';
function makePanHint(){
  const d=document.createElement('div');
  d.className='panhint'; d.innerHTML=PAN_ICON;
  d.title='Drag the view to pan and tilt';
  return d;
}
function makeDpad(c){
  const d=document.createElement('div'); d.className='dpad';
  d.onclick=e=>e.stopPropagation();
  const mk=(cls,label,title,fn)=>{
    const b=document.createElement('button');
    b.className=cls; b.textContent=label; b.title=title;
    b.onclick=e=>e.stopPropagation();
    b.addEventListener('pointerdown',e=>{
      e.stopPropagation(); e.preventDefault();
      fn();
      clearInterval(holdTimer);
      let delay=setTimeout(()=>{holdTimer=setInterval(fn,110);},320);
      const stop=()=>{clearTimeout(delay);clearInterval(holdTimer);holdTimer=null;
        removeEventListener('pointerup',stop);removeEventListener('pointercancel',stop);};
      addEventListener('pointerup',stop); addEventListener('pointercancel',stop);
    });
    return b;
  };
  const home={a:c.a,t:c.t};
  d.append(
    mk('u','▲','tilt up',   ()=>nudge(c,0,-STEP)),
    mk('l','◀','pan left',  ()=>nudge(c,-STEP,0)),
    mk('c','·','level the tilt', ()=>nudge(c,0,-c.t)),
    mk('r','▶','pan right', ()=>nudge(c,STEP,0)),
    mk('d','▼','tilt down', ()=>nudge(c,0,STEP)));
  return d;
}
let povRO=null;
function watchCells(){
  if(!povRO&&typeof ResizeObserver!=='undefined')
    povRO=new ResizeObserver(entries=>{
      entries.forEach(en=>{
        const cam=cams.find(c=>c.id===en.target.dataset.cam);
        const cv=en.target.querySelector('canvas');
        if(cam&&cv&&cv.style.display!=='none')renderPOVGL(cam,cv);
      });
    });
  return povRO;
}
function renderPOV(){
  const wrap=$('povgrid');
  const live=cams.filter(c=>c.on);
  const maxed=povMax&&live.find(c=>c.id===povMax);
  const list=maxed?[maxed]:live;
  const sig=list.map(c=>c.id+':'+(c.lens||'ptz')).join(',')+'|'+mode+'|'+(maxed?'max':'');
  if(wrap.dataset.sig===sig){
    // same cells: just redraw them, keeping the GL contexts alive
    list.forEach(c=>{
      const cell=wrap.querySelector(`.povcell[data-cam="${c.id}"]`);
      if(!cell)return;
      const cvs=cell.querySelector('canvas'), sv=cell.querySelector('svg');
      const wide=isWide(c);
      if(renderPOVGL(c,cvs)){ cvs.style.display=''; drawPOVOverlay(c,sv,wide?1280:640,400); }
      else { cvs.style.display='none'; drawPOV_svg_unused(c,sv,wide?1280:640,400); }
    });
    return;
  }
  wrap.dataset.sig=sig;
  wrap.textContent='';
  wrap.classList.toggle('one',!!maxed||mode==='split');
  wrap.classList.toggle('max',!!maxed);
  wrap.style.gridTemplateColumns=(maxed||mode==='split')?'1fr':(live.length<=2?'1fr':'1fr 1fr');
  list.forEach(c=>{
    const wide=isWide(c);
    const cell=document.createElement('div');
    cell.className='povcell'+(wide?' wide':'');
    const ar=lensAspect(c);
    cell.style.aspectRatio=String(ar);
    cell.style.setProperty('--ar',String(ar));
    const cvs=document.createElement('canvas');
    cell.append(cvs);
    const sv=document.createElementNS(NS,'svg');
    sv.setAttribute('preserveAspectRatio','none');
    cell.append(sv);
    cell.title='Drag to pan and tilt';
    cell.append(makeDpad(c));
    cell.append(makeZoom(c));
    cell.append(makePanHint());
    cell.dataset.cam=c.id;
    dragAim(cell,c);
    wrap.append(cell);
    const ro=watchCells(); if(ro)ro.observe(cell);
    requestAnimationFrame(()=>{
      if(renderPOVGL(c,cvs)){
        drawPOVOverlay(c,sv,wide?1280:640,400);
      } else {
        cvs.style.display='none';
        drawPOV_svg_unused(c,sv,wide?1280:640,400);   // SVG fallback
      }
    });
  });
}

