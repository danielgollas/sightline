/* ------- frustum solids: the actual visible volume, clipped by structures ------- */
function insideBox(b,x,y,z){
  return x>b.x0&&x<b.x1&&y>b.y0&&y<b.y1&&z>=baseAt(b,x,y)&&z<=topAt(b,x,y);
}
function castRay3(c,azm,elv2,maxR){
  const a=rad(azm), e=rad(elv2);
  const dx=Math.cos(a)*Math.cos(e), dy=Math.sin(a)*Math.cos(e), dz=-Math.sin(e);
  let lim=maxR;
  if(dz<-1e-6)lim=Math.min(lim,(0-c.z)/dz);            // ground plane
  if($('tOcc').checked){
    const step=0.6;
    for(let t=0.5;t<lim;t+=step){
      const x=c.x+dx*t, y=c.y+dy*t, z=c.z+dz*t;
      let hit=false;
      for(const b of boxes){
        if(!b.on)continue;
        if(insideBox(b,c.x,c.y,c.z))continue;          // mounted inside it
        if(insideBox(b,x,y,z)){hit=true;break;}
      }
      if(hit){lim=Math.max(0.5,t-step*0.5);break;}
    }
    lim=Math.min(lim,fenceDist(c.x,c.y,c.z,dx,dy,dz,lim));
  }
  return {d:lim,p:[c.x+dx*lim,c.y+dy*lim,c.z+dz*lim]};
}
function buildFrusta(){
  const out=[];
  cams.forEach(c=>{
    if(!c.on)return;
    if(sel&&sel!==c.id)return;
    const L=lensOf(c), k=colC(c);
    const list=($('tTour').checked)?stops(c):[{a:c.a,t:c.t||0,d:1}];
    list.forEach((st,si)=>{
      const NA=Math.max(6,Math.round(L.f/12)), NV=5;
      const grid=[];
      for(let i=0;i<=NA;i++){
        const azm=st.a-L.f/2+L.f*i/NA;
        const col=[];
        for(let j=0;j<=NV;j++){
          const e2=st.t-L.vf/2+L.vf*j/NV;
          col.push(castRay3(c,azm,e2,L.r).p);
        }
        grid.push(col);
      }
      const alpha=si===0?0.16:0.07;
      // far cap
      for(let i=0;i<NA;i++)for(let j=0;j<NV;j++)
        out.push({p:[grid[i][j],grid[i+1][j],grid[i+1][j+1],grid[i][j+1]],col:k,a:alpha});
      // sides, top and bottom: apex to the outer edges
      const apex=[c.x,c.y,c.z];
      for(let j=0;j<NV;j++){
        out.push({p:[apex,grid[0][j],grid[0][j+1],apex],col:k,a:alpha*0.8});
        out.push({p:[apex,grid[NA][j],grid[NA][j+1],apex],col:k,a:alpha*0.8});
      }
      for(let i=0;i<NA;i++){
        out.push({p:[apex,grid[i][0],grid[i+1][0],apex],col:k,a:alpha*0.55});
        out.push({p:[apex,grid[i][NV],grid[i+1][NV],apex],col:k,a:alpha*0.55});
      }
    });
  });
  return out;
}

