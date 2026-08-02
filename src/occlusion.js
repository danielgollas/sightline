/* ---------------- 3D occlusion ---------------- */
/*
   Everything that answers "can this camera see that point" still funnels
   through quality() / blocked(). The shape tests themselves now live in
   shapes.js so the AO bake's caster cannot drift from this code.
*/
function blocked(c,x,y,tz){
  if(!occOn())return false;
  const dx=x-c.x, dy=y-c.y, dz=tz-c.z;
  for(const b of boxes){
    if(!b.on)continue;
    // a camera inside an occluder's own volume isn't blocked by it
    // (mounted under a roof, on a post, inside a porch)
    if(insideOccluder(b,c.x,c.y,c.z))continue;
    if(hitsOccluder(b,c.x,c.y,c.z,dx,dy,dz))return true;
  }
  if(hitsFence(c.x,c.y,c.z,dx,dy,dz))return true;
  return false;
}
// 0 none, 1 detection, 2 face-ID.
//
// The two tiers are DORI recognise and identify computed from the camera's
// own resolution and field of view, so a 4K camera genuinely outreaches a 2K
// one. Both are clamped by what the camera can light: at night that is IR or
// floodlight distance, and a camera with neither contributes nothing.
function qual(c,x,y,tz,aim,tlt){
  const S=specOf(c);
  const dx=x-c.x, dy=y-c.y;
  const hd=Math.hypot(dx,dy);
  const far=detectFt(S);
  if(hd>far)return 0;
  const az=deg(Math.atan2(dy,dx));
  if(Math.abs(((az-aim+540)%360)-180)>S.fovH/2)return 0;
  const elv=deg(Math.atan2(c.z-tz,Math.max(hd,1e-6)));   // + = looking down
  if(Math.abs(elv-tlt)>S.fovV/2)return 0;
  if(blocked(c,x,y,tz))return 0;
  return hd<=identifyFt(S)?2:1;
}
// every stop in the circuit: home first, then keyframes
function stops(c){
  const home={a:c.a,t:c.t||0,d:c.hd||20};
  if(!specOf(c).ptz||!c.tour||!c.tour.length)return [home];
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
  if(tourOn())return swept(c,x,y,tz).q;
  return qual(c,x,y,tz,c.a,c.t||0);
}
