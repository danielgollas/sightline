
/* ============================================================================
   Sightline mesh builder + ambient occlusion bake

   Turns the scene's occluder boxes, ground and perimeter fence into a
   triangle soup with a per-vertex AO term.

   AO is computed on the CPU by hemisphere sampling with the same ray
   intersection code the coverage model uses. That matters: the picture and
   the percentages then come from one source of truth, so the render cannot
   quietly disagree with the numbers.

   Faces are tessellated rather than emitted as single quads. AO is a vertex
   attribute, so a 25 ft wall drawn as two triangles would have no gradient
   at all - the darkening under a roof or in a corner only appears if there
   are vertices there to carry it.
   ========================================================================== */

const MESH = (() => {

const hex=h=>[parseInt(h.slice(1,3),16)/255,
              parseInt(h.slice(3,5),16)/255,
              parseInt(h.slice(5,7),16)/255];

/* ---------- ray intersection against the scene ---------- */
// The AO bake used to carry its own copy of the occlusion maths, and the
// developer guide warned that the copy and blocked() had to be changed in
// lockstep or they would diverge silently. They no longer diverge: both call
// hitsOccluder() in shapes.js. What stays separate is the loop policy - this
// one skips the layer toggles because it runs in the bake's hot loop, and it
// takes an unbounded ray with a maxT rather than a 0..1 segment.
function makeCaster(env){
  const {boxes,prop,fence}=env;
  const solids=boxes.filter(b=>b.on);

  // does anything block the segment from origin out to maxT?
  return function occluded(ox,oy,oz,dx,dy,dz,maxT,ignore){
    if(dz<-1e-9){
      const t=-oz/dz;
      if(t>1e-3&&t<maxT)return true;              // the ground itself
    }
    // scale the direction so the shared test's 0..1 segment spans 0..maxT
    const sx=dx*maxT, sy=dy*maxT, sz=dz*maxT;
    for(const b of solids){
      if(b===ignore)continue;
      if(hitsOccluder(b,ox,oy,oz,sx,sy,sz))return true;
    }
    if(fence.on&&fence.h>0){
      for(let i=0;i<prop.length;i++){
        const [ax,ay]=prop[i],[bx,by]=prop[(i+1)%prop.length];
        const ex=bx-ax, ey=by-ay, den=dx*ey-dy*ex;
        if(Math.abs(den)<1e-9)continue;
        const qx=ax-ox, qy=ay-oy;
        const t=(qx*ey-qy*ex)/den, u=(qx*dy-qy*dx)/den;
        if(t<=1e-3||t>=maxT||u<0||u>1)continue;
        const z=oz+dz*t;
        if(z>=0&&z<=fence.h)return true;
      }
    }
    return false;
  };
}

/* ---------- cosine-weighted hemisphere directions ---------- */
const AO_DIRS=(()=>{
  const N=24, out=[];
  const golden=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<N;i++){
    const y=1-(i+0.5)/N;                    // 1 -> 0, cosine-ish weighting
    const r=Math.sqrt(Math.max(0,1-y*y));
    const th=golden*i;
    out.push([Math.cos(th)*r, Math.sin(th)*r, y]);
  }
  return out;
})();

function basisFor(n){
  const up=Math.abs(n[2])<0.9?[0,0,1]:[1,0,0];
  let t=[up[1]*n[2]-up[2]*n[1], up[2]*n[0]-up[0]*n[2], up[0]*n[1]-up[1]*n[0]];
  const l=Math.hypot(...t)||1; t=t.map(v=>v/l);
  const b=[n[1]*t[2]-n[2]*t[1], n[2]*t[0]-n[0]*t[2], n[0]*t[1]-n[1]*t[0]];
  return [t,b];
}

// AO_RADIUS sets how far a surface has to be from something before it stops
// darkening. Too large and the whole scene greys out; too small and corners
// stop reading as corners. 9 ft suits a domestic scene.
const AO_RADIUS=9;

function aoAt(occ,p,n,ignore){
  const [t,b]=basisFor(n);
  let open=0;
  for(const d of AO_DIRS){
    const w=[t[0]*d[0]+b[0]*d[1]+n[0]*d[2],
             t[1]*d[0]+b[1]*d[1]+n[1]*d[2],
             t[2]*d[0]+b[2]*d[1]+n[2]*d[2]];
    const o=[p[0]+n[0]*0.06, p[1]+n[1]*0.06, p[2]+n[2]*0.06];
    if(!occ(o[0],o[1],o[2],w[0],w[1],w[2],AO_RADIUS,ignore))open+=d[2];
  }
  let tot=0; for(const d of AO_DIRS)tot+=d[2];
  return 0.25+0.75*(open/tot);        // never fully black
}

/* ---------- build ---------- */
function build(env){
  const {boxes,prop,fence,MAT,matOf,XY,TC,BC,baseAt,topAt,inProp,zmin,zmax}=env;
  const occ=makeCaster(env);
  const pos=[],nrm=[],col=[],ao=[];

  // The scene model is left-handed (x east, y south, z up), GL is right-handed.
  // Negate y on the way in and reverse triangle winding so normals, winding and
  // face culling all stay consistent. Doing it here means nothing downstream
  // has to know.
  const push=(p,n,c,a)=>{pos.push(p[0],p[1],p[2]);nrm.push(n[0],n[1],n[2]);
    col.push(c[0],c[1],c[2]);ao.push(a);};
  const tri=(A,B,C,n,c,aA,aB,aC)=>{push(A,n,c,aA);push(B,n,c,aB);push(C,n,c,aC);};

  // a quad, tessellated, with AO sampled per vertex
  function quad(P,n,c,ignore,cell){
    const w=Math.hypot(P[1][0]-P[0][0],P[1][1]-P[0][1],P[1][2]-P[0][2]);
    const h=Math.hypot(P[3][0]-P[0][0],P[3][1]-P[0][1],P[3][2]-P[0][2]);
    const NU=Math.max(1,Math.min(10,Math.round(w/(cell||2.5))));
    const NV=Math.max(1,Math.min(10,Math.round(h/(cell||2.5))));
    const at=(u,v)=>{
      const a=[P[0][0]+(P[1][0]-P[0][0])*u, P[0][1]+(P[1][1]-P[0][1])*u, P[0][2]+(P[1][2]-P[0][2])*u];
      const b=[P[3][0]+(P[2][0]-P[3][0])*u, P[3][1]+(P[2][1]-P[3][1])*u, P[3][2]+(P[2][2]-P[3][2])*u];
      return [a[0]+(b[0]-a[0])*v, a[1]+(b[1]-a[1])*v, a[2]+(b[2]-a[2])*v];
    };
    const grid=[],aog=[];
    for(let i=0;i<=NU;i++){grid.push([]);aog.push([]);
      for(let j=0;j<=NV;j++){
        const p=at(i/NU,j/NV);
        grid[i].push(p); aog[i].push(aoAt(occ,p,n,ignore));
      }}
    for(let i=0;i<NU;i++)for(let j=0;j<NV;j++){
      const a=grid[i][j],b=grid[i+1][j],c2=grid[i+1][j+1],d=grid[i][j+1];
      const aa=aog[i][j],ab=aog[i+1][j],ac=aog[i+1][j+1],ad=aog[i][j+1];
      tri(a,b,c2,n,c,aa,ab,ac);
      tri(a,c2,d,n,c,aa,ac,ad);
    }
  }

  const outward=(b,P)=>{
    const u=[P[1][0]-P[0][0],P[1][1]-P[0][1],P[1][2]-P[0][2]];
    const v=[P[2][0]-P[0][0],P[2][1]-P[0][1],P[2][2]-P[0][2]];
    let n=[u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const l=Math.hypot(...n)||1; n=n.map(q=>q/l);
    const fc=[0,1,2].map(k=>P.reduce((s,q)=>s+q[k],0)/P.length);
    const bc=[(b.x0+b.x1)/2,(b.y0+b.y1)/2,(zmin(b)+zmax(b))/2];
    const d=(fc[0]-bc[0])*n[0]+(fc[1]-bc[1])*n[1]+(fc[2]-bc[2])*n[2];
    return d<0?n.map(q=>-q):n;
  };
  // wind a quad so its front face matches the outward normal
  const wound=(P,n)=>{
    const u=[P[1][0]-P[0][0],P[1][1]-P[0][1],P[1][2]-P[0][2]];
    const v=[P[2][0]-P[0][0],P[2][1]-P[0][1],P[2][2]-P[0][2]];
    const c=[u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    return (c[0]*n[0]+c[1]*n[1]+c[2]*n[2])>=0?P:[P[0],P[3],P[2],P[1]];
  };

  // A cylinder as a tessellated tube with a cap, plus an ellipsoid canopy for
  // the tree preset. Tessellated for the same reason every other surface is:
  // AO is a vertex attribute and a two-triangle wall carries no gradient.
  function tube(b,c,w){
    const cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2;
    const z0=zmin(b), z1=zmax(b), r=b.r||0.5;
    const SEG=12, RINGS=Math.max(2,Math.min(8,Math.round((z1-z0)/2.2)));
    const at=(i,k)=>{
      const a=2*Math.PI*i/SEG;
      return w([cx+Math.cos(a)*r, cy+Math.sin(a)*r, z0+(z1-z0)*k/RINGS]);
    };
    for(let i=0;i<SEG;i++)for(let k=0;k<RINGS;k++){
      const P=[at(i,k),at(i+1,k),at(i+1,k+1),at(i,k+1)];
      const a=2*Math.PI*(i+0.5)/SEG;
      let n=[Math.cos(a),Math.sin(a),0];
      n=env.xformDir(env.worldM(b),n);
      quad(wound(P,n),n,c,b,2.2);
    }
    // cap
    const top=[at(0,RINGS),at(Math.floor(SEG/4),RINGS),at(Math.floor(SEG/2),RINGS),at(Math.floor(3*SEG/4),RINGS)];
    quad(wound(top,[0,0,1]),[0,0,1],c,b,2.2);

    if(b.shape!=='tree')return;
    const rad=b.canopyR||Math.max(r*3,3), h=b.canopyH||rad*1.3;
    const ccz=z1+h*0.35;
    const leaf=hex(MAT.grassLit||'#5E8C48');
    const LAT=6, LON=10;
    const pt=(u,v)=>{
      const th=Math.PI*u/LAT, ph=2*Math.PI*v/LON;
      return w([cx+rad*Math.sin(th)*Math.cos(ph), cy+rad*Math.sin(th)*Math.sin(ph), ccz+h*Math.cos(th)]);
    };
    for(let u=0;u<LAT;u++)for(let v=0;v<LON;v++){
      const P=[pt(u,v),pt(u+1,v),pt(u+1,v+1),pt(u,v+1)];
      const mid=pt(u+0.5,v+0.5);
      let n=[mid[0]-cx,mid[1]-cy,mid[2]-ccz];
      const l=Math.hypot(...n)||1; n=n.map(q=>q/l);
      quad(wound(P,n),n,leaf,b,2.2);
    }
  }

  /* structures */
  // Corners come out of TC/BC in the occluder's own frame; worldM carries them
  // up through any parent chain. With no yaw and no parent this is the
  // identity, so an untransformed scene emits exactly the vertices it always
  // did.
  const W=b=>{
    const m=env.worldM(b);
    return p=>env.xformPt(m,p);
  };
  boxes.forEach(b=>{
    if(!b.on)return;
    const c=hex(matOf(b));
    const w=W(b);
    if(b.shape==='cyl'||b.shape==='tree'){ tube(b,c,w); return; }
    const T=TC(b).map(w), B=BC(b).map(w);
    const faces=[
      [T[0],T[1],T[2],T[3]],                                        // top
      [B[0],B[1],B[2],B[3]],                                        // base
      [B[0],B[1],T[1],T[0]],                                        // y0
      [B[3],B[2],T[2],T[3]],                                        // y1
      [B[0],B[3],T[3],T[0]],                                        // x0
      [B[1],B[2],T[2],T[1]]                                         // x1
    ];
    faces.forEach(P=>{
      const n=outward(b,P);
      quad(wound(P,n),n,c,b,2.2);
    });
  });

  /* ground: a grid clipped to the property, skipping building footprints */
  {
    const c=hex(MAT.grass);
    const xs=prop.map(p=>p[0]), ys=prop.map(p=>p[1]);
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
    const step=4.5, n=[0,0,1];
    const under=(x,y)=>boxes.some(b=>b.on&&x>b.x0&&x<b.x1&&y>b.y0&&y<b.y1&&zmin(b)<=0.05);
    for(let x=x0;x<x1;x+=step)for(let y=y0;y<y1;y+=step){
      const cx=x+step/2, cy=y+step/2;
      if(!inProp(cx,cy)||under(cx,cy))continue;
      quad([[x,y,0],[x+step,y,0],[x+step,y+step,0],[x,y+step,0]],n,c,null,2.5);
    }
  }

  /* perimeter fence, both sides */
  if(fence.on&&fence.h>0){
    const c=hex(MAT.wood);
    for(let i=0;i<prop.length;i++){
      const [ax,ay]=prop[i],[bx,by]=prop[(i+1)%prop.length];
      const ex=bx-ax, ey=by-ay, l=Math.hypot(ex,ey)||1;
      const n=[ey/l,-ex/l,0];
      quad([[ax,ay,0],[bx,by,0],[bx,by,fence.h],[ax,ay,fence.h]],n,c,null,3);
      const n2=n.map(q=>-q);
      quad([[bx,by,0],[ax,ay,0],[ax,ay,fence.h],[bx,by,fence.h]],n2,c,null,3);
    }
  }

  return {pos,nrm,col,ao,verts:pos.length/3};
}

return {build,makeCaster,AO_RADIUS};
})();
