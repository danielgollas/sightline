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
function camLimits(c){
  const S=specOf(c);
  const pick=(a,b,d)=>a!==undefined&&a!==null?a:(b!==undefined&&b!==null?b:d);
  return {
    tMin:pick(c.tiltMin,S.tiltMin,TILT_MIN),
    tMax:pick(c.tiltMax,S.tiltMax,TILT_MAX),
    aMin:pick(c.panMin,S.panMin,null),
    aMax:pick(c.panMax,S.panMax,null)
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

/* ---------------- the hand: drag to pan and tilt ---------------- */
// Redraw one cell rather than the whole app. A full render() re-marches cones
// and repaints the plan, which is far too much for a pointer-move; the plan
// and the coverage figures catch up once the drag ends.
function redrawCell(c,cell){
  const cvs=cell.querySelector('canvas'), sv=cell.querySelector('svg');
  const wide=isWide(c);
  if(renderPOVGL(c,cvs)){ cvs.style.display=''; drawPOVOverlay(c,sv,wide?1280:640,400); }
  else { cvs.style.display='none'; drawPOV_svg_unused(c,sv,wide?1280:640,400); }
}
let _limitToast=0;
function handDrag(cell,c){
  let d=null;
  cell.addEventListener('pointerdown',e=>{
    if(!cell.classList.contains('grab'))return;
    if(e.target.closest('.dpad')||e.target.closest('.handbtn'))return;
    d={x:e.clientX,y:e.clientY,a:c.a,t:c.t||0,
       w:cell.clientWidth||1,h:cell.clientHeight||1,moved:false};
    // Capture keeps the drag alive if the pointer leaves the cell. It can
    // throw when there is no active pointer with this id, and a failed
    // capture must not abort the drag.
    try{ cell.setPointerCapture(e.pointerId); }catch(_){}
    cell.classList.add('grabbing');
    e.preventDefault(); e.stopPropagation();
  });
  cell.addEventListener('pointermove',e=>{
    if(!d)return;
    const S=specOf(c);
    const dx=e.clientX-d.x, dy=e.clientY-d.y;
    if(Math.abs(dx)+Math.abs(dy)>3)d.moved=true;
    // Grab semantics: the scene follows the hand, so dragging right turns the
    // camera left. Dragging the full width of the frame sweeps one full
    // horizontal field of view, which makes the gearing feel 1:1.
    const hit=aimTo(c, d.a - dx/d.w*S.fovH, d.t - dy/d.h*S.fovV);
    redrawCell(c,cell);
    if((hit.pan||hit.tilt) && performance.now()-_limitToast>1200){
      _limitToast=performance.now();
      toast(hit.tilt?`${c.id} is at its tilt limit`:`${c.id} is at its pan limit`);
    }
  });
  ['pointerup','pointercancel'].forEach(v=>cell.addEventListener(v,e=>{
    if(!d)return;
    const moved=d.moved; d=null;
    cell.classList.remove('grabbing');
    if(moved){ render(); list(); }      // now catch the plan and the figures up
  }));
}
function makeHand(c){
  const b=document.createElement('button');
  b.className='handbtn'; b.textContent='\u270B';
  b.title='Hand: drag the view to pan and tilt this camera';
  b.setAttribute('aria-pressed','false');
  b.onclick=e=>{
    e.stopPropagation();
    const cell=b.closest('.povcell');
    const on=b.getAttribute('aria-pressed')==='true';
    b.setAttribute('aria-pressed',String(!on));
    cell.classList.toggle('grab',!on);
  };
  // Pressing the hand and dragging straight off it works too, without having
  // to click it first - that is what "click and drag" means to most people.
  b.addEventListener('pointerdown',e=>{
    const cell=b.closest('.povcell');
    if(!cell.classList.contains('grab')){
      cell.classList.add('grab');
      b.setAttribute('aria-pressed','true');
    }
    e.stopPropagation();
  });
  return b;
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
  wrap.style.gridTemplateColumns=(maxed||mode==='split')?'1fr':(live.length<=2?'1fr':'1fr 1fr');
  list.forEach(c=>{
    const wide=isWide(c);
    const cell=document.createElement('div');
    cell.className='povcell'+(wide?' wide':'');
    cell.style.aspectRatio=String(lensAspect(c));
    const cvs=document.createElement('canvas');
    cell.append(cvs);
    const sv=document.createElementNS(NS,'svg');
    sv.setAttribute('preserveAspectRatio','none');
    cell.append(sv);
    cell.onclick=e=>{
      if(cell.classList.contains('grab'))return;   // the hand owns the drag
      povMax=povMax===c.id?null:c.id;renderPOV();
    };
    cell.title=povMax?'click to show all cameras':'click to maximise';
    cell.append(makeDpad(c));
    cell.append(makeHand(c));
    cell.dataset.cam=c.id;
    handDrag(cell,c);
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

