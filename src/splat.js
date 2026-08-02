/* ------- splatter: which cameras actually see each patch of ground / structure ------- */
// visibility of an arbitrary 3D point, ignoring the surface it sits on
function seesPoint(c,x,y,z,skip){
  const L=lensOf(c);
  const dx=x-c.x, dy=y-c.y, dz=z-c.z, hd=Math.hypot(dx,dy);
  if(hd>L.r||hd<0.3)return 0;
  if(Math.abs(((deg(Math.atan2(dy,dx))-c.a+540)%360)-180)>L.f/2)return 0;
  const e2=deg(Math.atan2(c.z-z,hd));
  if(Math.abs(e2-(c.t||0))>L.vf/2)return 0;
  if(occOn()){
    for(const b of boxes){
      if(!b.on||b===skip)continue;
      if(c.x>b.x0-.02&&c.x<b.x1+.02&&c.y>b.y0-.02&&c.y<b.y1+.02&&
         c.z>baseAt(b,c.x,c.y)-.02&&c.z<topAt(b,c.x,c.y)+.02)continue;
      if(isFlat(b)){
        if(segHitsBox(c.x,c.y,c.z,dx,dy,dz,{x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1,z0:b.zb[0],z1:b.zt[0]}))return 0;
      } else if(hitsWarped(c,dx,dy,dz,b))return 0;
    }
    if(hitsFence(c.x,c.y,c.z,dx,dy,dz))return 0;
  }
  return hd<=20?2:1;
}
function bestAt(x,y,z,skip,nrm){
  let q=0,c=null;
  for(const cam of cams){
    if(!cam.on)continue;
    if(sel&&sel!==cam.id)continue;
    // backface cull: the camera must be on the outward side of the surface
    if(nrm){
      const d=(cam.x-x)*nrm[0]+(cam.y-y)*nrm[1]+(cam.z-z)*nrm[2];
      if(d<=0.05)continue;
    }
    const v=seesPoint(cam,x,y,z,skip);
    if(v>q){q=v;c=cam;}
  }
  return {q,c};
}
const lerp3=(A,B,t)=>[A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t];
function quadAt(P,u,v){ return lerp3(lerp3(P[0],P[1],u), lerp3(P[3],P[2],u), v); }

function buildSplat(){
  const out=[];
  const add=(P,skip,nrm)=>{
    const span=Math.max(
      Math.hypot(P[1][0]-P[0][0],P[1][1]-P[0][1],P[1][2]-P[0][2]),
      Math.hypot(P[3][0]-P[0][0],P[3][1]-P[0][1],P[3][2]-P[0][2]));
    const N=clamp(Math.round(span/1.6),1,14);
    for(let i=0;i<N;i++)for(let j=0;j<N;j++){
      const c0=quadAt(P,i/N,j/N), c1=quadAt(P,(i+1)/N,j/N),
            c2=quadAt(P,(i+1)/N,(j+1)/N), c3=quadAt(P,i/N,(j+1)/N);
      const m=[(c0[0]+c2[0])/2,(c0[1]+c2[1])/2,(c0[2]+c2[2])/2];
      const OFF=0.18;
      const r=bestAt(m[0]+nrm[0]*OFF,m[1]+nrm[1]*OFF,m[2]+nrm[2]*OFF,null,nrm);
      if(!r.q)continue;
      out.push({p:[c0,c1,c2,c3],col:colC(r.c),a:r.q===2?0.5:0.26});
    }
  };
  // ground, limited to the property
  const PB=propBounds(), st=2.5;
  for(let x=PB.x0;x<PB.x1;x+=st)for(let y=PB.y0;y<PB.y1;y+=st){
    if(!inProp(x+st/2,y+st/2))continue;
    const r=bestAt(x+st/2,y+st/2,0.05,null);
    if(!r.q)continue;
    out.push({p:[[x,y,0],[x+st,y,0],[x+st,y+st,0],[x,y+st,0]],
      col:colC(r.c),a:r.q===2?0.42:0.2});
  }
  // structure surfaces
  boxes.forEach(b=>{
    if(!b.on)return;
    const T=TC(b), B2=BC(b);
    add([T[0],T[1],T[2],T[3]],b,[0,0,1]);                       // roof
    add([[b.x0,b.y0,B2[0][2]],[b.x1,b.y0,B2[1][2]],[b.x1,b.y0,T[1][2]],[b.x0,b.y0,T[0][2]]],b,[0,-1,0]);
    add([[b.x1,b.y1,B2[2][2]],[b.x0,b.y1,B2[3][2]],[b.x0,b.y1,T[3][2]],[b.x1,b.y1,T[2][2]]],b,[0,1,0]);
    add([[b.x0,b.y1,B2[3][2]],[b.x0,b.y0,B2[0][2]],[b.x0,b.y0,T[0][2]],[b.x0,b.y1,T[3][2]]],b,[-1,0,0]);
    add([[b.x1,b.y0,B2[1][2]],[b.x1,b.y1,B2[2][2]],[b.x1,b.y1,T[2][2]],[b.x1,b.y0,T[1][2]]],b,[1,0,0]);
  });
  return out;
}

