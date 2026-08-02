/* ---------------- coverage raster ---------------- */
const cov=$('cov'), cx2=cov.getContext('2d');
function paintCoverage(coarse){
  cov.width=W; cov.height=H;
  cx2.clearRect(0,0,W,H);
  const tz=targetZ();
  const step=coarse?2.2:1.1;                       // world ft per sample
  const px=Math.max(2,Math.ceil(step*T.s));
  const showId=idOn();
  const live=cams.filter(c=>c.on);
  const wx0=sx(0),wy0=sy(0),wx1=sx(W),wy1=sy(H);
  for(let gx=wx0;gx<wx1;gx+=step){
    for(let gy=wy0;gy<wy1;gy+=step){
      let best=0,bc=null;
      for(const c of live){
        if(sel&&sel!==c.id)continue;
        const q=quality(c,gx,gy,tz);
        if(q>best){best=q;bc=c;}
      }
      if(!best)continue;
      cx2.fillStyle=colC(bc);
      cx2.globalAlpha=(best===2&&showId)?0.34:0.15;
      cx2.fillRect(wx(gx),wy(gy),px,px);
    }
  }
  cx2.globalAlpha=1;
}

