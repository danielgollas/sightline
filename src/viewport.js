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
function resetView(){
  if(mode==='3d'){zoom=1;panX=0;panY=0;az=-38;elv=32;}
  else {zoom2=1;ctrX=VIEW.x0+VIEW.w/2;ctrY=VIEW.y0+VIEW.h/2;}
  render();}
let T=fit();
const wx=x=>x*T.s+T.ox, wy=y=>y*T.s+T.oy;
const sx=p=>(p-T.ox)/T.s, sy=p=>(p-T.oy)/T.s;

