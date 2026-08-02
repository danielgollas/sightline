/* ---------------- materials, sun and shadows ---------------- */
const MAT={
  sky0:'#4A7FB5', sky1:'#9CC4E4',
  grass:'#4E7A3E', grassLit:'#5E8C48', grassDark:'#3C6031',
  wall:'#F2EFE7', roof:'#D8D2C6', wood:'#7A5535', woodDark:'#5E4128',
  deck:'#8B6A45', shadow:'#243A22'
};
// sun sits over the north-east, ~40 degrees up
const SUN=(()=>{const v=[0.52,-0.52,0.68];
  const l=Math.hypot(...v); return v.map(q=>q/l);})();
function shade(n,base){
  const d=Math.max(0,n[0]*SUN[0]+n[1]*SUN[1]+n[2]*SUN[2]);
  const k=0.42+0.58*d;
  const r=parseInt(base.slice(1,3),16),g=parseInt(base.slice(3,5),16),b=parseInt(base.slice(5,7),16);
  const f=v=>Math.round(Math.min(255,v*k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function normalOf(P){
  if(P.length<3)return [0,0,1];
  const u=[P[1][0]-P[0][0],P[1][1]-P[0][1],P[1][2]-P[0][2]];
  const v=[P[2][0]-P[0][0],P[2][1]-P[0][1],P[2][2]-P[0][2]];
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const l=Math.hypot(...n)||1;
  return n.map(q=>q/l);
}
function outNormal(b,W3){
  let n=normalOf(W3);
  const fc=[W3.reduce((s,q)=>s+q[0],0)/W3.length,
            W3.reduce((s,q)=>s+q[1],0)/W3.length,
            W3.reduce((s,q)=>s+q[2],0)/W3.length];
  const bc=[(b.x0+b.x1)/2,(b.y0+b.y1)/2,
            (Math.min(...b.zb)+Math.max(...b.zt))/2];
  const d=(fc[0]-bc[0])*n[0]+(fc[1]-bc[1])*n[1]+(fc[2]-bc[2])*n[2];
  return d<0?n.map(q=>-q):n;
}
const facesCamera=(c,b,W3)=>{
  const n=outNormal(b,W3);
  const fc=[W3.reduce((s,q)=>s+q[0],0)/W3.length,
            W3.reduce((s,q)=>s+q[1],0)/W3.length,
            W3.reduce((s,q)=>s+q[2],0)/W3.length];
  return (c.x-fc[0])*n[0]+(c.y-fc[1])*n[1]+(c.z-fc[2])*n[2] > 0;
};
const matOf=b=>/roof/i.test(b.name)?MAT.roof
  :/deck/i.test(b.name)?MAT.deck
  :/fence|post|wall/i.test(b.name)?MAT.wood:MAT.wall;
// drop a point onto the ground along the sun ray
const dropSun=p=>[p[0]-SUN[0]*(p[2]/SUN[2]), p[1]-SUN[1]*(p[2]/SUN[2]), 0];
function hull(pts){
  const P=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lo=[],up=[];
  for(const p of P){while(lo.length>1&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}
  for(let i=P.length-1;i>=0;i--){const p=P[i];
    while(up.length>1&&cross(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p);}
  lo.pop();up.pop();
  return lo.concat(up);
}
function shadowOf(b){
  const pts=[];
  XY(b).forEach(([x,y],i)=>{pts.push([x,y]);pts.push(dropSun([x,y,b.zt[i]]).slice(0,2));});
  return hull(pts);
}
function fenceShadows(){
  if(!fence.on||fence.h<=0)return [];
  const out=[];
  for(let i=0;i<prop.length;i++){
    const [ax,ay]=prop[i],[bx,by]=prop[(i+1)%prop.length];
    const a2=dropSun([ax,ay,fence.h]), b2=dropSun([bx,by,fence.h]);
    out.push([[ax,ay],[bx,by],[b2[0],b2[1]],[a2[0],a2[1]]]);
  }
  return out;
}

