/* ---------------- transforms and shape intersection ---------------- */
/*
   The single source of truth for "does this segment hit this occluder".
   blocked() and MESH.makeCaster both call hitsOccluder(); only their loop
   policy differs (the caster skips the layer-toggle lookups because it runs
   in the AO bake's hot loop).

   The developer guide used to warn that those two mirrored each other by hand
   and had to be changed in lockstep. They no longer mirror: the primitives
   live here once. Keep it that way - a second copy of a shape test is the
   failure mode that hides for months.

   Transforms are rigid: yaw about z, plus translation. The pipeline is a
   general 4x4 so pitch and roll are a UI change later rather than an
   architecture change, but only yaw is ever constructed today.
*/

const TX = (() => {

const ident = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

// column-major, same convention as GL.M4
function mul(a,b){
  const o=new Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++){
    o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  }
  return o;
}
function rotZ(deg){
  const a=deg*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
  return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1];
}
const trans=(x,y,z)=>[1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];

// Rigid inverse: transpose the rotation, negate the rotated translation.
// Cheaper and better conditioned than a general inverse, and valid because
// nothing here ever scales or shears.
function invRigid(m){
  const o=[m[0],m[4],m[8],0, m[1],m[5],m[9],0, m[2],m[6],m[10],0, 0,0,0,1];
  const x=m[12],y=m[13],z=m[14];
  o[12]=-(o[0]*x+o[4]*y+o[8]*z);
  o[13]=-(o[1]*x+o[5]*y+o[9]*z);
  o[14]=-(o[2]*x+o[6]*y+o[10]*z);
  return o;
}
const xformPt=(m,p)=>[
  m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],
  m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],
  m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
// direction: translation-free, so segment parameters survive the transform
const xformDir=(m,p)=>[
  m[0]*p[0]+m[4]*p[1]+m[8]*p[2],
  m[1]*p[0]+m[5]*p[1]+m[9]*p[2],
  m[2]*p[0]+m[6]*p[1]+m[10]*p[2]];

return {ident,mul,rotZ,trans,invRigid,xformPt,xformDir};
})();

/* ---------- parent chains ---------- */

// A box's own frame: yaw about its footprint centre, so rotating never
// teleports it. With yaw 0 and no parent this is the identity, which is why
// every pre-transform scene still reads as world coordinates.
function localM(b){
  if(!b.yaw && !b.parent) return TX.ident();
  const cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2;
  return TX.mul(TX.trans(cx,cy,0), TX.mul(TX.rotZ(b.yaw||0), TX.trans(-cx,-cy,0)));
}
const boxById=id=>boxes.find(b=>b.id===id);

// Walks to the root, stopping if the chain ever revisits a node. A cycle
// should be impossible - setParent rejects them - but a corrupt imported
// project must not hang the render loop.
function chain(b){
  const out=[]; const seen=new Set();
  let cur=b;
  while(cur && !seen.has(cur.id)){ seen.add(cur.id); out.push(cur); cur=cur.parent?boxById(cur.parent):null; }
  return out;
}
let _mCache=new Map(), _mGen=-1;
function worldM(b){
  if(_mGen!==sceneGen){ _mCache=new Map(); _mGen=sceneGen; }
  const hit=_mCache.get(b.id);
  if(hit)return hit;
  let m=TX.ident();
  // root-most first, so the child's own frame is applied last
  chain(b).reverse().forEach(n=>{ m=TX.mul(m, localM(n)); });
  _mCache.set(b.id,m);
  return m;
}
const isIdentityM=b=>!b.yaw && !b.parent;

// True when assigning `parentId` to `b` would create a cycle.
function wouldCycle(b,parentId){
  let cur=parentId?boxById(parentId):null;
  const seen=new Set();
  while(cur){
    if(cur.id===b.id)return true;
    if(seen.has(cur.id))return true;
    seen.add(cur.id);
    cur=cur.parent?boxById(cur.parent):null;
  }
  return false;
}

/* ---------- primitives, all in the occluder's local frame ---------- */

// slab test: does segment o->o+d hit the axis-aligned box?
function segHitsBox(ox,oy,oz,dx,dy,dz,b){
  let t0=0,t1=1;
  const ax=[[ox,dx,b.x0,b.x1],[oy,dy,b.y0,b.y1],[oz,dz,b.z0,b.z1]];
  for(const[o,d,lo,hi]of ax){
    if(Math.abs(d)<1e-9){ if(o<lo||o>hi)return false; continue; }
    let a=(lo-o)/d, z=(hi-o)/d;
    if(a>z){const s=a;a=z;z=s;}
    if(a>t0)t0=a; if(z<t1)t1=z;
    if(t0>t1)return false;
  }
  return t1>1e-4 && t0<1-1e-4;
}
// where does the segment enter/exit the box footprint in xy?
function xyRange(ox,oy,dx,dy,b){
  let t0=0,t1=1;
  for(const[o,d,lo,hi]of [[ox,dx,b.x0,b.x1],[oy,dy,b.y0,b.y1]]){
    if(Math.abs(d)<1e-9){ if(o<lo||o>hi)return null; continue; }
    let a=(lo-o)/d, z=(hi-o)/d; if(a>z){const s=a;a=z;z=s;}
    if(a>t0)t0=a; if(z<t1)t1=z;
    if(t0>t1)return null;
  }
  return [t0,t1];
}
// sampled test against a bilinear top/base, for warped slabs
function segHitsWarped(ox,oy,oz,dx,dy,dz,b){
  const r=xyRange(ox,oy,dx,dy,b); if(!r)return false;
  const N=22;
  for(let i=0;i<=N;i++){
    const t=r[0]+(r[1]-r[0])*i/N;
    if(t<=1e-4||t>=1-1e-4)continue;
    const px=ox+dx*t, py=oy+dy*t, pz=oz+dz*t;
    if(pz>=baseAt(b,px,py) && pz<=topAt(b,px,py))return true;
  }
  return false;
}
// finite cylinder, axis along z from b.z0 to b.z1, radius b.r, centred on
// the footprint centre in local xy
function segHitsCyl(ox,oy,oz,dx,dy,dz,b){
  const cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2;
  const px=ox-cx, py=oy-cy;
  const a=dx*dx+dy*dy;
  const r=b.r;
  let t0=0,t1=1;
  if(a<1e-12){
    // parallel to the axis: inside the disc or nothing
    if(px*px+py*py>r*r)return false;
  } else {
    const bq=2*(px*dx+py*dy), cq=px*px+py*py-r*r;
    const disc=bq*bq-4*a*cq;
    if(disc<0)return false;
    const sq=Math.sqrt(disc);
    let lo=(-bq-sq)/(2*a), hi=(-bq+sq)/(2*a);
    if(lo>hi){const s=lo;lo=hi;hi=s;}
    if(lo>t0)t0=lo; if(hi<t1)t1=hi;
    if(t0>t1)return false;
  }
  // clip against the end caps
  if(Math.abs(dz)<1e-9){
    if(oz<b.z0||oz>b.z1)return false;
  } else {
    let lo=(b.z0-oz)/dz, hi=(b.z1-oz)/dz;
    if(lo>hi){const s=lo;lo=hi;hi=s;}
    if(lo>t0)t0=lo; if(hi<t1)t1=hi;
    if(t0>t1)return false;
  }
  return t1>1e-4 && t0<1-1e-4;
}
// axis-aligned ellipsoid: scale the ray into unit-sphere space and solve
function segHitsEllipsoid(ox,oy,oz,dx,dy,dz,e){
  const px=(ox-e.cx)/e.rx, py=(oy-e.cy)/e.ry, pz=(oz-e.cz)/e.rz;
  const qx=dx/e.rx, qy=dy/e.ry, qz=dz/e.rz;
  const a=qx*qx+qy*qy+qz*qz;
  if(a<1e-12)return px*px+py*py+pz*pz<=1;
  const b=2*(px*qx+py*qy+pz*qz), c=px*px+py*py+pz*pz-1;
  const disc=b*b-4*a*c;
  if(disc<0)return false;
  const sq=Math.sqrt(disc);
  const t0=(-b-sq)/(2*a), t1=(-b+sq)/(2*a);
  return t1>1e-4 && t0<1-1e-4;
}

/* ---------- the shared entry point ---------- */

// Canopy of a tree preset: an ellipsoid sitting on top of the trunk.
function canopyOf(b){
  if(b.shape!=='tree')return null;
  const cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2;
  const top=Math.max(...b.zt);
  const rad=b.canopyR||Math.max(b.r*3,3);
  const h=b.canopyH||rad*1.3;
  return {cx,cy,cz:top+h*0.35,rx:rad,ry:rad,rz:h};
}

// Is the point inside this occluder's own volume? Used to let a camera
// mounted under a roof see out of it.
function insideOccluder(b,x,y,z){
  const p=isIdentityM(b)?[x,y,z]:TX.xformPt(TX.invRigid(worldM(b)),[x,y,z]);
  const [lx,ly,lz]=p;
  if(b.shape==='cyl'||b.shape==='tree'){
    const cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2;
    const dx=lx-cx, dy=ly-cy;
    if(dx*dx+dy*dy<=b.r*b.r*1.05 && lz>=zmin(b)-0.02 && lz<=zmax(b)+0.02)return true;
    const e=canopyOf(b);
    if(e){
      const ex=(lx-e.cx)/e.rx, ey=(ly-e.cy)/e.ry, ez=(lz-e.cz)/e.rz;
      if(ex*ex+ey*ey+ez*ez<=1.05)return true;
    }
    return false;
  }
  return lx>b.x0-.02&&lx<b.x1+.02&&ly>b.y0-.02&&ly<b.y1+.02&&
         lz>baseAt(b,lx,ly)-.02&&lz<topAt(b,lx,ly)+.02;
}

// The one intersection routine. Segment is given in WORLD space; it is
// transformed into the occluder's local frame and tested there, so the slab
// and bilinear code below is exactly the code that shipped before transforms
// existed.
function hitsOccluder(b,ox,oy,oz,dx,dy,dz){
  let lo=ox,lo2=oy,lo3=oz, ld=dx,ld2=dy,ld3=dz;
  if(!isIdentityM(b)){
    const inv=TX.invRigid(worldM(b));
    const p=TX.xformPt(inv,[ox,oy,oz]);
    const d=TX.xformDir(inv,[dx,dy,dz]);
    lo=p[0];lo2=p[1];lo3=p[2]; ld=d[0];ld2=d[1];ld3=d[2];
  }
  if(b.shape==='cyl'||b.shape==='tree'){
    if(segHitsCyl(lo,lo2,lo3,ld,ld2,ld3,{x0:b.x0,x1:b.x1,y0:b.y0,y1:b.y1,r:b.r,z0:zmin(b),z1:zmax(b)}))return true;
    const e=canopyOf(b);
    return e?segHitsEllipsoid(lo,lo2,lo3,ld,ld2,ld3,e):false;
  }
  if(isFlat(b))
    return segHitsBox(lo,lo2,lo3,ld,ld2,ld3,
      {x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1,z0:b.zb[0],z1:b.zt[0]});
  return segHitsWarped(lo,lo2,lo3,ld,ld2,ld3,b);
}
