/* ---------------- 3D occlusion ---------------- */
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
function hitsWarped(c,dx,dy,dz,b){
  const r=xyRange(c.x,c.y,dx,dy,b); if(!r)return false;
  const N=22;
  for(let i=0;i<=N;i++){
    const t=r[0]+(r[1]-r[0])*i/N;
    if(t<=1e-4||t>=1-1e-4)continue;
    const px=c.x+dx*t, py=c.y+dy*t, pz=c.z+dz*t;
    if(pz>=baseAt(b,px,py) && pz<=topAt(b,px,py))return true;
  }
  return false;
}
function blocked(c,x,y,tz){
  if(!$('tOcc').checked)return false;
  const dx=x-c.x, dy=y-c.y, dz=tz-c.z;
  for(const b of boxes){
    if(!b.on)continue;
    // a camera inside a box's own volume isn't blocked by it (mounted under a roof)
    if(c.x>b.x0-.02&&c.x<b.x1+.02&&c.y>b.y0-.02&&c.y<b.y1+.02&&
       c.z>baseAt(b,c.x,c.y)-.02&&c.z<topAt(b,c.x,c.y)+.02)continue;
    if(isFlat(b)){
      if(segHitsBox(c.x,c.y,c.z,dx,dy,dz,{x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1,z0:b.zb[0],z1:b.zt[0]}))return true;
    } else if(hitsWarped(c,dx,dy,dz,b))return true;
  }
  if(hitsFence(c.x,c.y,c.z,dx,dy,dz))return true;
  return false;
}
// 0 none, 1 detection, 2 face-ID
function qual(c,x,y,tz,aim,tlt){
  const L=lensOf(c);
  const dx=x-c.x, dy=y-c.y;
  const hd=Math.hypot(dx,dy);
  if(hd>L.r)return 0;
  const az=deg(Math.atan2(dy,dx));
  if(Math.abs(((az-aim+540)%360)-180)>L.f/2)return 0;
  const elv=deg(Math.atan2(c.z-tz,Math.max(hd,1e-6)));   // + = looking down
  if(Math.abs(elv-tlt)>L.vf/2)return 0;
  if(blocked(c,x,y,tz))return 0;
  return hd<=20?2:1;
}
// every stop in the circuit: home first, then keyframes
function stops(c){
  const home={a:c.a,t:c.t||0,d:c.hd||20};
  if((c.lens||'ptz')!=='ptz'||!c.tour||!c.tour.length)return [home];
  return [home,...c.tour];
}
// Bounce playback: 1 -> 2 -> 3 -> 2 -> 1, not 1 -> 2 -> 3 -> 1.
// A real PT head has to travel back through the middle anyway, so a wrap
// straight from the last stop to the first is a fiction that also leaves
// the far side of the arc unwatched for the whole return swing.
function order(c){
  const S=stops(c), n=S.length;
  if(n<3)return [...Array(n).keys()];
  // Sweep in bearing order, not list order. Sorting by signed offset from the
  // home position means the head travels monotonically to one end and back
  // instead of lurching past a stop and returning to it.
  const off=i=>((S[i].a-S[0].a+540)%360)-180;
  const f=[...Array(n).keys()].sort((a,b)=>off(a)-off(b));
  return f.concat(f.slice(1,-1).reverse());
}
// how many times each stop is visited per cycle, for duty-cycle maths
function visits(c){
  const w=new Array(stops(c).length).fill(0);
  order(c).forEach(i=>w[i]++);
  return w;
}
const cycle=c=>{
  const S=stops(c), o=order(c);
  return Math.round(o.reduce((s,i)=>s+(S[i].d||0),0)+o.length*MOVE);
};
// best quality anywhere in the circuit, plus the share of the cycle it's covered
function swept(c,x,y,tz){
  const S=stops(c), w=visits(c);
  let q=0,seen=0,tot=0;
  S.forEach((k,i)=>{
    const d=(k.d||0)*w[i];              // middle stops are visited twice
    tot+=d;
    const v=qual(c,x,y,tz,k.a,k.t);
    if(v){seen+=d; if(v>q)q=v;}
  });
  return {q,frac:tot?seen/tot:0};
}
function quality(c,x,y,tz){
  if($('tTour')&&$('tTour').checked)return swept(c,x,y,tz).q;
  return qual(c,x,y,tz,c.a,c.t||0);
}

