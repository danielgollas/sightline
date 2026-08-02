/* ---------------- state ---------------- */
const MEASURED=`CAM C1 | ON | DUO | x 12.7 | y -0.2 | z 11 | a 270 | t 41.5 | N wall Duo 3V
CAM C2 | ON | DUO | x 2 | y 27.9 | z 11 | a 92 | t 37.5 | S wall Duo 3V
CAM C3 | ON | PTZ | x -0.6 | y 12.7 | z 7.5 | a 195 | t 28 | Front porch E1
CAM C4 | ON | PTZ | x 25.7 | y 1.6 | z 8 | a 31 | t 16 | Back porch E1
CAM C5 | ON | PTZ | x -0.4 | y 24.7 | z 10.5 | a 220 | t 32 | SW corner E1
CAM C6 | ON | PTZ | x 25.4 | y 24.5 | z 10.5 | a 313 | t 34 | SE corner E1
TOUR C3 | home 20 | 68,28.5,8 | 152,28.5,8
TOUR C4 | home 20 | 354,16,8 | 266,16,8
TOUR C5 | home 20 | 94,32,8 | 184,32,8
TOUR C6 | home 20 | 262,36,8 | 356,36,8
PROP -44.3,-41 | 149.7,-6.6 | 150.7,42.2 | -48.6,51.6
FENCE | ON | h 8
BOX B1 | ON | x0 0 | y0 0 | x1 25 | y1 25 | base 0/0/0/0 | top 20/20/20/20 | House
BOX B2 | ON | x0 25 | y0 -1 | x1 33 | y1 10.5 | base 12/9.5/9.5/12 | top 12.5/10/10/12.5 | Back porch roof
BOX B3 | ON | x0 -6 | y0 6.5 | x1 0 | y1 15 | base 8/8.25/8.25/8 | top 11.25/11.5/11.5/11.25 | Front porch roof
BOX B4 | ON | x0 25 | y0 10 | x1 38 | y1 24.5 | base 0/0/0/0 | top 2.5/2.5/2.5/2.5 | Deck
BOX B5 | ON | x0 -6 | y0 6.6 | x1 -5 | y1 7.6 | base 0/0/0/0 | top 8/8/8/8 | Front Porch Post
BOX B6 | ON | x0 -6 | y0 14 | x1 -5 | y1 15 | base 0/0/0/0 | top 8/8/8/8 | Front Porch Post 2
BOX B7 | ON | x0 -5.5 | y0 14 | x1 -0.1 | y1 15 | base 0/0/0/0 | top 3.25/3.25/3.25/3.25 | Porch Wall S
BOX B8 | ON | x0 -5 | y0 6.6 | x1 0 | y1 7.6 | base 0/0/0/0 | top 3/3/2.75/2.75 | Porch Wall N
BOX B9 | ON | x0 25.1 | y0 3.2 | x1 33.8 | y1 10 | base 0/0/0/0 | top 2.5/2.5/2.5/2.5 | Deck 2
BOX B10 | ON | x0 30.2 | y0 8.8 | x1 31.2 | y1 9.8 | base 0/0/0/0 | top 10.4/10.4/10.4/10.4 | Back Porch Post S
BOX B11 | ON | x0 30.1 | y0 3.2 | x1 31.1 | y1 4.2 | base 0/0/0/0 | top 10.4/10.4/10.4/10.4 | Back Porch Post N
BOX B12 | ON | x0 0.1 | y0 24.9 | x1 15.2 | y1 27.6 | base 0/0/0/0 | top 13/13/13/13 | House Bump
BOX B13 | ON | x0 20.3 | y0 -14.3 | x1 42.1 | y1 -5.2 | base 0/0/0/0 | top 10.25/10.25/10.25/10.25 | Garage
BOX B14 | ON | x0 22.7 | y0 -5.1 | x1 23.7 | y1 0.2 | base 0/0/0/0 | top 3.25/3.25/3.25/3.25 | Fence N
BOX B15 | ON | x0 1.4 | y0 27.5 | x1 2.4 | y1 48.4 | base 0/0/0/0 | top 8/8/8/8 | Fence S`;

// zt = top height at [NW, NE, SE, SW] corners. Unequal values give a tilted roof.
// zb / zt = height at [NW, NE, SE, SW]. Tilt both together for a real sloped slab.
const DEF_BOXES=()=>[
 {id:'B1',name:'House',          x0:0, y0:0, x1:25,y1:25,zb:[0,0,0,0],       zt:[20,20,20,20],on:true},
 {id:'B2',name:'Back porch roof',x0:25,y0:-1,x1:33,y1:8, zb:[10.2,7.7,7.7,10.2],zt:[10.7,8.2,8.2,10.7],on:true},
 {id:'B3',name:'Front porch roof',x0:-6,y0:8,x1:0,y1:14, zb:[8,10,10,8],      zt:[8.5,10.5,10.5,8.5],on:true},
 {id:'B4',name:'Deck',           x0:25,y0:9, x1:38,y1:26,zb:[0,0,0,0],        zt:[1.2,1.2,1.2,1.2],on:true}
];
const bilin=(arr,b,x,y)=>{
  const u=clamp((x-b.x0)/(b.x1-b.x0),0,1), v=clamp((y-b.y0)/(b.y1-b.y0),0,1);
  return arr[0]*(1-u)*(1-v)+arr[1]*u*(1-v)+arr[2]*u*v+arr[3]*(1-u)*v;
};
const topAt =(b,x,y)=>bilin(b.zt,b,x,y);
const baseAt=(b,x,y)=>bilin(b.zb,b,x,y);
const zmax=b=>Math.max(...b.zt), zmin=b=>Math.min(...b.zb);
const flatT=b=>Math.max(...b.zt)-Math.min(...b.zt)<1e-6;
const flatB=b=>Math.max(...b.zb)-Math.min(...b.zb)<1e-6;
const isFlat=b=>flatT(b)&&flatB(b);
const sloped=b=>!isFlat(b);
const DEF_CAMS=()=>[
 {id:'C1',lens:'duo',x:12.5,y:-1,z:11,a:270,t:15,name:'N wall Duo 3V',note:'Mid-wall flush',on:true},
 {id:'C2',lens:'duo',x:12.5,y:26,z:11,a:90 ,t:15,name:'S wall Duo 3V',note:'Mid-wall flush',on:true},
 {id:'C3',lens:'ptz',x:-6.5,y:11,z:8.5,a:126,t:15,name:'Front porch E1',note:'Fascia outer face',on:true},
 {id:'C4',lens:'ptz',x:33.5,y:3.5,z:8,a:312,t:15,name:'Back porch E1',note:'Fascia outer face',on:true},
 {id:'C5',lens:'ptz',x:-1.5,y:-1.5,z:10.5,a:135,t:15,name:'NW corner E1',note:'Corner bracket',on:true},
 {id:'C6',lens:'ptz',x:26.5,y:26.5,z:10.5,a:309,t:15,name:'SE corner E1',note:'Corner bracket',on:true}
];
const DEF_PROP=()=>[[-18,-19],[46,-19],[46,51],[-18,51]];
let prop=DEF_PROP(), selProp=false;
let fence={on:true,h:8};
// exact segment-vs-vertical-panel test along every boundary edge
function hitsFence(ox,oy,oz,dx,dy,dz){
  if(!fence.on||fence.h<=0)return false;
  for(let i=0;i<prop.length;i++){
    const [ax,ay]=prop[i], [bx,by]=prop[(i+1)%prop.length];
    const ex=bx-ax, ey=by-ay;
    const den=dx*ey-dy*ex;
    if(Math.abs(den)<1e-9)continue;
    const qx=ax-ox, qy=ay-oy;
    const t=(qx*ey-qy*ex)/den, u=(qx*dy-qy*dx)/den;
    if(t<=1e-4||t>=1-1e-4||u<0||u>1)continue;
    const z=oz+dz*t;
    if(z>=0&&z<=fence.h)return true;
  }
  return false;
}
// distance along a ray until it meets the fence (for frustum clipping)
function fenceDist(ox,oy,oz,dx,dy,dz,max){
  if(!fence.on||fence.h<=0)return max;
  let best=max;
  for(let i=0;i<prop.length;i++){
    const [ax,ay]=prop[i], [bx,by]=prop[(i+1)%prop.length];
    const ex=bx-ax, ey=by-ay;
    const den=dx*ey-dy*ex;
    if(Math.abs(den)<1e-9)continue;
    const qx=ax-ox, qy=ay-oy;
    const t=(qx*ey-qy*ex)/den, u=(qx*dy-qy*dx)/den;
    if(t<=0.01||u<0||u>1)continue;
    const z=oz+dz*t;
    if(z>=0&&z<=fence.h&&t<best)best=t;
  }
  return best;
}
let GLON=true;
let cams=DEF_CAMS(), boxes=DEF_BOXES(), sel=null, selBox=null, mode='2d', splat=null, frusta=null, povMax=null;
let nvrs=[], selNvr=null;

/* ---------------- scene options ---------------- */
// These used to be checkboxes in the right panel. The panel is gone; the
// options are scene state, saved with the project, and reached through
// accessors so no render path has to know where they live.
let opts={
  tz:3,            // target height, feet
  draw:'cones',    // 'cones' | 'heat'
  occ:true, id:true, tour:false, frus:true, splat:false, grid:true,
  night:false,     // limits camera range to IR / floodlight distance
  fps:15, quality:'med'   // project-level recording defaults
};
const occOn=()=>opts.occ, tourOn=()=>opts.tour, idOn=()=>opts.id,
      gridOn=()=>opts.grid, frusOn=()=>opts.frus, splatOn=()=>opts.splat,
      targetZ=()=>opts.tz, drawMode=()=>opts.draw, night=()=>opts.night;

// Bumped once per render. Transform matrices cache against it, so they can be
// stale for at most a frame and never need manual invalidation on edit.
let sceneGen=0;

/* ---------------- occluder shapes ---------------- */
// Presets seed a shape; they are not separate entity types. 'cyl' and 'tree'
// carry a radius, everything else is the box that has always been here.
const OCC_PRESETS={
  building:{name:'Building', shape:'box', w:20,d:16, base:0, top:18},
  roof    :{name:'Sloped roof', shape:'box', w:12,d:8, base:8, top:11, slope:2.5},
  post    :{name:'Column / post', shape:'cyl', w:1, d:1, base:0, top:9, r:0.5},
  fence   :{name:'Fence run', shape:'box', w:20,d:0.5, base:0, top:6},
  tree    :{name:'Tree', shape:'tree', w:2,d:2, base:0, top:10, r:0.7, canopyR:7, canopyH:8}
};
function makeOccluder(kind,at){
  const P=OCC_PRESETS[kind]||OCC_PRESETS.building;
  let n=1; while(boxes.some(b=>b.id==='B'+n))n++;
  const x0=at?at.x:-14, y0=at?at.y:-10;
  const b={id:'B'+n, name:P.name, shape:P.shape,
    x0, y0, x1:x0+P.w, y1:y0+P.d,
    zb:[P.base,P.base,P.base,P.base],
    zt:[P.top,P.top,P.top,P.top],
    yaw:0, parent:null, on:true};
  if(P.slope){ b.zb=[P.base,P.base+P.slope,P.base+P.slope,P.base];
               b.zt=[P.top,P.top+P.slope,P.top+P.slope,P.top]; }
  if(P.r){ b.r=P.r; }
  if(P.canopyR){ b.canopyR=P.canopyR; b.canopyH=P.canopyH; }
  return b;
}
// children first is what the tree renders; the flat list stays authoritative
const childrenOf=id=>boxes.filter(b=>(b.parent||null)===id);
function setParent(b,pid){
  if(pid && (pid===b.id || wouldCycle(b,pid)))return false;
  b.parent=pid||null;
  return true;
}
function polyArea(){
  let a=0;
  for(let i=0,j=prop.length-1;i<prop.length;j=i++)
    a+=(prop[j][0]+prop[i][0])*(prop[j][1]-prop[i][1]);
  return Math.abs(a/2);
}
function inProp(x,y){
  let n=false;
  for(let i=0,j=prop.length-1;i<prop.length;j=i++){
    const [xi,yi]=prop[i],[xj,yj]=prop[j];
    if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) n=!n;
  }
  return n;
}
function inAnyBox(x,y){
  return boxes.some(b=>b.on&&zmax(b)>4&&x>b.x0&&x<b.x1&&y>b.y0&&y<b.y1);
}
function propBounds(){
  const xs=prop.map(p=>p[0]), ys=prop.map(p=>p[1]);
  return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};
}
function loadMeasured(){
  const {C,B,P}=decodeRaw(MEASURED);
  if(C.length)cams=C;
  if(B.length)boxes=B;
  prop=P?P:DEF_PROP();
  migrateScene();
  // One recorder, holding every camera. Without it the tree has cameras with
  // no parent and the status bar has no storage to report against.
  nvrs=[{id:'N1',name:'Main recorder',catKey:'reolink-rln8-410',on:true,
    spec:{id:'reolink-rln8-410',brand:'Reolink',model:'RLN8-410',channels:8,
      storageGB:2000,maxStorageGB:12000,poePorts:8,compat:['reolink'],checked:'2026-08-02'}}];
  cams.forEach(c=>{ if(!c.nvr)c.nvr='N1'; });
  CAT.seedFromProject(projectSnapshot());
}
const colC=c=>PAL[cams.indexOf(c)%PAL.length];

/* ---------------- legacy migration ---------------- */
// Scenes written before the catalog existed carry lens:'ptz'|'duo'. Each maps
// to a real catalog entry, and a copy of that entry is embedded on the camera
// so the scene still resolves with no catalog present at all.
const LEGACY_KEY={ptz:'reolink-e1-outdoor-se', duo:'reolink-duo-3v-poe'};
const LEGACY_SPEC={
  'reolink-e1-outdoor-se':{id:'reolink-e1-outdoor-se',brand:'Reolink',model:'E1 Outdoor SE',
    resolution:{w:3840,h:2160},fovH:88,fovV:41.5,ptz:true,irFt:98,poe:false,wifi:true,
    formats:['H.265','H.264'],compat:['reolink'],checked:'2026-08-02'},
  'reolink-duo-3v-poe':{id:'reolink-duo-3v-poe',brand:'Reolink',model:'Duo 3V PoE',
    resolution:{w:7680,h:2160},fovH:189,fovV:55,ptz:false,irFt:100,poe:true,wifi:false,
    formats:['H.265','H.264'],compat:['reolink'],checked:'2026-08-02'}
};
function migrateCam(c){
  if(!c.catKey){
    c.catKey=LEGACY_KEY[c.lens||'ptz']||LEGACY_KEY.ptz;
    c.spec=LEGACY_SPEC[c.catKey];
  }
  if(c.yaw===undefined)c.yaw=0;
  delete c._spec;
  return c;
}
function migrateBox(b){
  if(b.shape===undefined)b.shape='box';
  if(b.yaw===undefined)b.yaw=0;
  if(b.parent===undefined)b.parent=null;
  return b;
}
const migrateScene=()=>{ cams.forEach(migrateCam); boxes.forEach(migrateBox); };

