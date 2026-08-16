/* ---------------- world <-> screen ---------------- */
const VIEW={x0:-34,y0:-30,w:100,h:88};
let W=900,H=700, zoom2=1, ctrX=VIEW.x0+VIEW.w/2, ctrY=VIEW.y0+VIEW.h/2;
function baseScale(){return Math.min(W/VIEW.w,H/VIEW.h);}
function fit(){
  const st=$('stage');
  W=Math.floor((st.clientWidth||900)*(mode==='split'?0.5:1)); H=st.clientHeight||700;
  const s=baseScale()*zoom2;
  return {s,ox:W/2-ctrX*s,oy:H/2-ctrY*s};
}
// VIEW is a fixed 100x88 ft box, and the scene the app actually boots with is a
// measured lot 199 ft across - so the plan opened cropped, with the boundary off
// screen in three directions, and the 3D orbit opened with the house filling the
// frame. Frame what is there instead of a constant.
function fitProp(){
  if(!prop||prop.length<3)return;
  const B=propBounds();
  ctrX=(B.x0+B.x1)/2; ctrY=(B.y0+B.y1)/2;
  T=fit();                                  // refresh W/H for the live stage
  const b=baseScale();
  if(b>0)zoom2=clamp(Math.min(W/Math.max(B.x1-B.x0,1),H/Math.max(B.y1-B.y0,1))/(b*1.10),0.05,20);
  T=fit();
}
function resetView(){
  if(mode==='3d'){zoom=1;panX=0;panY=0;az=-38;elv=32;}
  else fitProp();
  render();}
let T=fit();
const wx=x=>x*T.s+T.ox, wy=y=>y*T.s+T.oy;
const sx=p=>(p-T.ox)/T.s, sy=p=>(p-T.oy)/T.s;

