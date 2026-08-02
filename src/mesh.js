
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
// Mirrors the occlusion model: axis-aligned solids with bilinear top and
// base surfaces, plus the vertical fence panels on the property boundary.
function makeCaster(env){
  const {boxes,prop,fence,baseAt,topAt,flatT,flatB}=env;
  const solids=boxes.filter(b=>b.on);

  function xySpan(ox,oy,dx,dy,b){
    let t0=0,t1=Infinity;
    for(const[o,d,lo,hi]of [[ox,dx,b.x0,b.x1],[oy,dy,b.y0,b.y1]]){
      if(Math.abs(d)<1e-9){ if(o<lo||o>hi)return null; continue; }
      let a=(lo-o)/d, z=(hi-o)/d; if(a>z){const s=a;a=z;z=s;}
      if(a>t0)t0=a; if(z<t1)t1=z;
      if(t0>t1)return null;
    }
    return [t0,t1];
  }

  // does anything block the segment from origin out to maxT?
  return function occluded(ox,oy,oz,dx,dy,dz,maxT,ignore){
    if(dz<-1e-9){
      const t=-oz/dz;
      if(t>1e-3&&t<maxT)return true;              // the ground itself
    }
    for(const b of solids){
      if(b===ignore)continue;
      const r=xySpan(ox,oy,dx,dy,b);
      if(!r)continue;
      const lo=Math.max(r[0],1e-3), hi=Math.min(r[1],maxT);
      if(lo>=hi)continue;
      if(flatT(b)&&flatB(b)){
        const z0=b.zb[0],z1=b.zt[0];
        let a=lo,z=hi;
        if(Math.abs(dz)<1e-9){ if(oz<z0||oz>z1)continue; return true; }
        let ta=(z0-oz)/dz, tb=(z1-oz)/dz;
        if(ta>tb){const s=ta;ta=tb;tb=s;}
        if(Math.max(a,ta)<=Math.min(z,tb))return true;
      } else {
        const N=14;
        for(let i=0;i<=N;i++){
          const t=lo+(hi-lo)*i/N;
          const x=ox+dx*t,y=oy+dy*t,z=oz+dz*t;
          if(z>=baseAt(b,x,y)&&z<=topAt(b,x,y))return true;
        }
      }
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

  /* structures */
  boxes.forEach(b=>{
    if(!b.on)return;
    const c=hex(matOf(b));
    const T=TC(b), B=BC(b);
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
