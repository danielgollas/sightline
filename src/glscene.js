/* ---------------- WebGL scene ---------------- */
let glCtx=null, glCells=new Map(), meshCache=null, meshKey='';
function sceneKey(){
  // Anything that moves a vertex has to appear here or the bake goes stale.
  // yaw, parent, shape and the cylinder radii are as load-bearing as x0/y0.
  return JSON.stringify([boxes.map(b=>[b.on,b.x0,b.y0,b.x1,b.y1,b.zb,b.zt,b.name,
                                       b.yaw||0,b.parent||'',b.shape||'box',
                                       b.r||0,b.canopyR||0,b.canopyH||0]),
                         prop,fence]);
}
function env(){
  return {boxes,prop,fence,MAT,matOf,XY,TC,BC,baseAt,topAt,inProp,zmin,zmax,
          flatT,flatB,
          // the transform pipeline, so the bake places vertices where the
          // occlusion maths says the solids actually are
          worldM,xformPt:TX.xformPt,xformDir:TX.xformDir};
}
function ensureMesh(){
  const k=sceneKey();
  if(meshCache&&k===meshKey)return meshCache;
  const t0=performance.now();
  meshCache=MESH.build(env()); meshKey=k;
  meshCache.ms=Math.round(performance.now()-t0);
  return meshCache;
}
const SUNV=new Float32Array(SUN);
const SKYT=[0.29,0.49,0.71], SKYB=[0.61,0.77,0.89];

// A WebGL context is bound to one canvas element for life, and browsers cap
// how many can exist at once. Caching by camera id while rebuilding the
// canvases meant every redraw leaked a context and handed back a stale one.
function glReady(canvas){
  if(!canvas.__ctx){
    const c=GL.makeCtx(canvas);
    if(!c)return null;
    c.uploaded=''; canvas.__ctx=c;
  }
  return canvas.__ctx;
}
function sizeCanvas(cv){
  const r=cv.getBoundingClientRect();
  const dpr=Math.min(devicePixelRatio||1,2);
  const w=Math.max(1,Math.round(r.width*dpr)), h=Math.max(1,Math.round(r.height*dpr));
  if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}
  return [w,h];
}
// orbit parameters shared with the old SVG view
function orbitEye(){
  const A=rad(az), E=rad(elv);
  const dist=95/Math.max(zoom,0.2);
  const cx=12.5+panX*0, cy=12.5+panY*0;
  return {eye:[cx+dist*Math.cos(E)*Math.sin(A), cy+dist*Math.cos(E)*Math.cos(A), dist*Math.sin(E)],
          at:[cx,cy,6]};
}
let glFailed=false;
function render3DGL(){
  if(glFailed||typeof GL==='undefined')return false;
  try{ return render3DGL_();}catch(err){
    glFailed=true; console.warn('WebGL unavailable, falling back to SVG:',err.message);
    $('gl3d').style.display='none'; return false;
  }
}
function render3DGL_(){
  const cv=$('gl3d');
  const [w,h]=sizeCanvas(cv);
  const c=glReady(cv); if(!c)return false;
  const m=ensureMesh();
  if(c.uploaded!==meshKey){GL.upload(c,m);c.uploaded=meshKey;}
  const {eye,at}=orbitEye();
  const proj=GL.M4.perspective(38,w/h,0.5,600);
  const view=GL.M4.lookAtLH(eye,at,[0,0,1]);
  GL.drawScene(c,GL.M4.mul(proj,view),SUNV,SKYT,SKYB,[0,0,w,h]);
  return true;
}
function renderPOVGL(cam,cv){
  if(glFailed||typeof GL==='undefined')return false;
  try{ return renderPOVGL_(cam,cv);}catch(err){ glFailed=true; return false; }
}
function renderPOVGL_(cam,cv){
  const [w,h]=sizeCanvas(cv);
  const c=glReady(cv); if(!c)return false;
  const m=ensureMesh();
  if(c.uploaded!==meshKey){GL.upload(c,m);c.uploaded=meshKey;}
  const L=lensOf(cam);
  const eye=[cam.x,cam.y,cam.z];
  const t=rad(cam.t||0), a=rad(cam.a);
  const at=[eye[0]+Math.cos(a)*Math.cos(t)*10,
            eye[1]+Math.sin(a)*Math.cos(t)*10,
            eye[2]-Math.sin(t)*10];
  const view=GL.M4.lookAtLH(eye,at,[0,0,1]);
  // One pass, one projection for every lens. Horizontal fills the width,
  // vertical fills the height, so the frame is the sensor shape and the FOV is
  // exactly what the coverage model uses. A perspective divide could not do
  // this anyway - it cannot reach 180 degrees, let alone past it.
  GL.drawScene(c,view,SUNV,SKYT,SKYB,[0,0,w,h],
    {view,halfH:rad(L.f/2),halfV:rad(L.vf/2),far:400});
  return true;
}

