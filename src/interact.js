/* ---------------- interaction: plan ---------------- */
let drag=null;
function toW(e){const r=$('stage').getBoundingClientRect();
  return {x:sx(e.clientX-r.left), y:sy(e.clientY-r.top)};}
svg.addEventListener('wheel',e=>{
  e.preventDefault();
  const r=$('stage').getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  const wpx=sx(mx), wpy=sy(my);
  zoom2=clamp(zoom2*(e.deltaY>0?0.9:1.111),0.25,8);
  const s2=baseScale()*zoom2;
  ctrX=wpx+(W/2-mx)/s2; ctrY=wpy+(H/2-my)/s2;
  render();
},{passive:false});

svg.addEventListener('pointerdown',e=>{
  const pv=e.target.closest('[data-vert],[data-mid]');
  if(pv&&selProp){
    if(pv.dataset.vert!==undefined){
      const i=+pv.dataset.vert;
      if((e.shiftKey||e.altKey)&&prop.length>3){prop.splice(i,1);render();list();return;}
      drag={type:'vert',i};
    } else {
      const i=+pv.dataset.mid;
      const [x,y]=prop[i],[nx,ny]=prop[(i+1)%prop.length];
      prop.splice(i+1,0,[Math.round((x+nx)/2*10)/10,Math.round((y+ny)/2*10)/10]);
      drag={type:'vert',i:i+1};
    }
    coarse=true; svg.setPointerCapture(e.pointerId); render(); list(); return;
  }
  const t=e.target.closest('[data-cam],[data-box]');
  if(!t){
    sel=null;selBox=null;selProp=false;
    drag={type:'pan',x:e.clientX,y:e.clientY,cx:ctrX,cy:ctrY};
    coarse=true; svg.setPointerCapture(e.pointerId); render(); list(); return;}
  if(t.dataset.cam){
    const c=cams.find(v=>v.id===t.dataset.cam); if(!c||!c.on)return;
    drag={type:t.dataset.mode,c}; sel=c.id; selBox=null;
  } else {
    const b=boxes.find(v=>v.id===t.dataset.box); if(!b)return;
    selBox=b.id; sel=null;
    if(t.dataset.corner)drag={type:'corner',b,k:t.dataset.corner};
    else if(t.dataset.grab==='move'){const p0=toW(e);drag={type:'boxmove',b,px:p0.x,py:p0.y,
      o:{x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1}};}
  }
  coarse=true; svg.setPointerCapture(e.pointerId); render(); list();
});
svg.addEventListener('pointermove',e=>{
  if(!drag)return;
  if(drag.type==='pan'){
    const s2=baseScale()*zoom2;
    ctrX=drag.cx-(e.clientX-drag.x)/s2;
    ctrY=drag.cy-(e.clientY-drag.y)/s2;
    render(); return;
  }
  const p=toW(e);
  if(drag.type==='aim')drag.c.a=Math.round(norm(deg(Math.atan2(p.y-drag.c.y,p.x-drag.c.x))));
  else if(drag.type==='move'){drag.c.x=Math.round(p.x*10)/10;drag.c.y=Math.round(p.y*10)/10;}
  else if(drag.type==='boxmove'){
    const b=drag.b, ddx=Math.round((p.x-drag.px)*10)/10, ddy=Math.round((p.y-drag.py)*10)/10;
    b.x0=drag.o.x0+ddx; b.x1=drag.o.x1+ddx; b.y0=drag.o.y0+ddy; b.y1=drag.o.y1+ddy;
  }
  else if(drag.type==='vert'){
    prop[drag.i]=[Math.round(p.x*10)/10,Math.round(p.y*10)/10];
  }
  else if(drag.type==='corner'){
    const b=drag.b, k=drag.k;
    if(k[0]==='n')b.y0=Math.min(Math.round(p.y*10)/10,b.y1-1); else b.y1=Math.max(Math.round(p.y*10)/10,b.y0+1);
    if(k[1]==='w')b.x0=Math.min(Math.round(p.x*10)/10,b.x1-1); else b.x1=Math.max(Math.round(p.x*10)/10,b.x0+1);
  }
  render();
});
['pointerup','pointercancel'].forEach(v=>svg.addEventListener(v,()=>{
  if(drag){drag=null;coarse=false;render();list();}}));

/* ---------------- interaction: 3D ---------------- */
// Screen pixels per world foot of height, at this occluder's position, under
// whichever projection is live. Probing the projection keeps the GL and SVG
// fallback paths honest without either needing to know about the other.
function pxPerFootAt(b){
  const wm=worldM(b);
  const c=TX.xformPt(wm,[(b.x0+b.x1)/2,(b.y0+b.y1)/2,(zmin(b)+zmax(b))/2]);
  const a=proj(c[0],c[1],c[2]), z=proj(c[0],c[1],c[2]+1);
  const px=Math.abs(z.y-a.y);
  return px>0.05?px:1;             // degenerate head-on view: fall back to 1:1
}
let orbit=null, faceDrag=null;
v3.addEventListener('pointerdown',e=>{
  const t=e.target.closest('[data-box]');
  if(t){
    const b=boxes.find(v=>v.id===t.dataset.box);
    if(b){
      const was=selBox===b.id;
      selBox=b.id; sel=null;
      if(t.dataset.surf)
        faceDrag={b,surf:t.dataset.surf,idx:t.dataset.edge.split(',').map(Number),
          y0:e.clientY,v0:b[t.dataset.surf].slice()};
      else if(was&&t.dataset.face)
        faceDrag={b,axis:t.dataset.face,y0:e.clientY,
          v0:t.dataset.face==='top'?b.zt.slice():
             t.dataset.face==='base'?b.zb.slice():b[t.dataset.face]};
      v3.setPointerCapture(e.pointerId); render(); list(); return; }
  }
  const wantPan=e.shiftKey||e.button===1||e.button===2;
  orbit={mode:wantPan?'pan':'orbit',x:e.clientX,y:e.clientY,az,elv,px:panX,py:panY};
  v3.style.cursor=wantPan?'grabbing':'move';
  v3.setPointerCapture(e.pointerId);
});
v3.addEventListener('contextmenu',e=>e.preventDefault());
v3.addEventListener('pointermove',e=>{
  if(faceDrag){
    // Pixels to feet, measured from the projection actually in use rather than
    // assumed. Under the perspective GL view the scale depends on how far the
    // handle is from the eye, so a fixed orthographic factor made a roof edge
    // track slower or faster than the pointer depending on the orbit.
    const d=-(e.clientY-faceDrag.y0)/pxPerFootAt(faceDrag.b);
    const b=faceDrag.b, ax=faceDrag.axis;
    if(faceDrag.surf){
      const arr=faceDrag.v0.slice();
      faceDrag.idx.forEach(i=>arr[i]=Math.round((faceDrag.v0[i]+d)*4)/4);
      if(faceDrag.surf==='zt')b.zt=arr.map((v,i)=>Math.max(v,b.zb[i]+.15));
      else b.zb=arr.map((v,i)=>Math.min(v,b.zt[i]-.15));
      render(); return;
    }
    if(ax==='top'||ax==='base'){
      const key=ax==='top'?'zt':'zb';
      const src=(faceDrag.v0&&faceDrag.v0.length)?faceDrag.v0:b[key];
      const arr=src.map(v=>Math.round((v+d)*4)/4);
      if(key==='zt')b.zt=arr.map((v,i)=>Math.max(v,b.zb[i]+.15));
      else b.zb=arr.map((v,i)=>Math.min(v,b.zt[i]-.15));
      render(); return;
    }
    let v=Math.round((faceDrag.v0+d)*2)/2;
    if(ax==='x1')b.x1=Math.max(v,b.x0+1);
    else if(ax==='x0')b.x0=Math.min(v,b.x1-1);
    else if(ax==='y1')b.y1=Math.max(v,b.y0+1);
    else if(ax==='y0')b.y0=Math.min(v,b.y1-1);
    render(); return;
  }
  if(!orbit)return;
  if(orbit.mode==='pan'){
    panX=orbit.px+(e.clientX-orbit.x);
    panY=orbit.py+(e.clientY-orbit.y);
  } else {
    az=orbit.az+(e.clientX-orbit.x)*0.35;
    elv=clamp(orbit.elv+(e.clientY-orbit.y)*0.28,6,86);
  }
  if(GLON)render3DGL();
  draw3d();
});
['pointerup','pointercancel'].forEach(v=>v3.addEventListener(v,()=>{
  if(faceDrag){faceDrag=null;list();}
  orbit=null; v3.style.cursor=''; render();}));
v3.addEventListener('wheel',e=>{e.preventDefault();
  const r=$('stage').getBoundingClientRect();
  const mx=e.clientX-r.left-W/2-panX, my=e.clientY-r.top-H/2-panY;
  const z0=zoom; zoom=clamp(zoom*(e.deltaY>0?0.93:1.075),0.25,6);
  const k=zoom/z0;
  panX-=mx*(k-1); panY-=my*(k-1);
  if(GLON)render3DGL();
  draw3d();},{passive:false});

function setMode(m){
  mode=m;
  $('m2d').setAttribute('aria-pressed',m==='2d');
  $('m3d').setAttribute('aria-pressed',m==='3d');
  $('mpov').setAttribute('aria-pressed',m==='pov');
  $('msplit').setAttribute('aria-pressed',m==='split');
  $('povgrid').style.display=(m==='pov'||m==='split')?'grid':'none';
  $('stage').classList.toggle('split',m==='split');
}
$('msplit').onclick=()=>{setMode('split');
  $('hint').textContent='Plan and camera views together · click a panel to maximise it';
  render();};
$('mpov').onclick=()=>{setMode('pov');
  $('hint').textContent='Drag a view to pan and tilt · the magnifier fills the stage · frustums are hidden here';
  render();};
$('m2d').onclick=()=>{setMode('2d');
  $('hint').textContent='Scroll to zoom · drag background to pan · drag box corners to resize, ✛ to move it';render();};
$('m3d').onclick=()=>{setMode('3d');
  $('hint').textContent='Drag to orbit · shift-drag or right-drag to pan · scroll to zoom · white handles = top, grey = base';render();};

