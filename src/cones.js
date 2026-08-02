/* ------- vector cones: 3D-accurate visibility, drawn as crisp polygons ------- */
// for one azimuth, return the visible distance intervals at the target height
function intervals(c,azm,tz,lvl,dstep){
  const L=lensOf(c), a=rad(azm), ca=Math.cos(a), sa=Math.sin(a);
  const out=[]; let open=null;
  for(let d=1;d<=L.r;d+=dstep){
    const q=qual(c,c.x+d*ca,c.y+d*sa,tz,c.a,c.t||0);
    const ok=(lvl===2)?(q===2):(q>=1);
    if(ok&&!open)open=d;
    else if(!ok&&open){out.push([open,d-dstep]);open=null;}
  }
  if(open)out.push([open,L.r]);
  return out;
}
// merge adjacent azimuths into smooth sector polygons
function conePaths(c,tz,lvl,astep,dstep){
  const L=lensOf(c), a0=c.a-L.f/2, a1=c.a+L.f/2;
  const cols=[];
  for(let a=a0;a<=a1+1e-6;a+=astep)cols.push({a,iv:intervals(c,a,tz,lvl,dstep)});
  const paths=[]; const used=cols.map(col=>col.iv.map(()=>false));
  for(let i=0;i<cols.length;i++){
    for(let j=0;j<cols[i].iv.length;j++){
      if(used[i][j])continue;
      const run=[{a:cols[i].a,iv:cols[i].iv[j]}]; used[i][j]=true;
      let cur=cols[i].iv[j];
      for(let k=i+1;k<cols.length;k++){
        let bi=-1,bd=1e9;
        cols[k].iv.forEach((v,m)=>{
          if(used[k][m])return;
          const dd=Math.abs(v[0]-cur[0])+Math.abs(v[1]-cur[1]);
          if(dd<bd){bd=dd;bi=m;}
        });
        if(bi<0||bd>6)break;
        used[k][bi]=true; cur=cols[k].iv[bi];
        run.push({a:cols[k].a,iv:cur});
      }
      if(run.length<2)continue;
      const outer=run.map(r=>[c.x+r.iv[1]*Math.cos(rad(r.a)),c.y+r.iv[1]*Math.sin(rad(r.a))]);
      const inner=run.slice().reverse().map(r=>[c.x+r.iv[0]*Math.cos(rad(r.a)),c.y+r.iv[0]*Math.sin(rad(r.a))]);
      const pts=[...outer,...inner];
      paths.push('M '+pts.map(([x,y])=>`${wx(x).toFixed(1)} ${wy(y).toFixed(1)}`).join(' L ')+' Z');
    }
  }
  return paths;
}

