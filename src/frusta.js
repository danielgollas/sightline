/* ------- frustum solids: the actual visible volume, clipped by structures ------- */
// Containment goes through insideOccluder(), the same test blocked() and the
// splatter use. This file used to carry its own axis-aligned insideBox(), which
// silently ignored yaw and treated a cylinder or a tree canopy as its bounding
// box - so the drawn volume disagreed with the coverage figures beside it for
// exactly the occluders the transform work added.
function castRay3(c,azm,elv2,maxR){
  const a=rad(azm), e=rad(elv2);
  const dx=Math.cos(a)*Math.cos(e), dy=Math.sin(a)*Math.cos(e), dz=-Math.sin(e);
  let lim=maxR;
  if(dz<-1e-6)lim=Math.min(lim,(0-c.z)/dz);            // ground plane
  if(occOn()){
    const step=0.6;
    for(let t=0.5;t<lim;t+=step){
      const x=c.x+dx*t, y=c.y+dy*t, z=c.z+dz*t;
      let hit=false;
      for(const b of boxes){
        if(!b.on)continue;
        if(insideOccluder(b,c.x,c.y,c.z))continue;      // mounted inside it
        if(insideOccluder(b,x,y,z)){hit=true;break;}
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
    const list=(tourOn())?stops(c):[{a:c.a,t:c.t||0,d:1}];
    list.forEach((st,si)=>{
      // The "far cap" is rarely at the far range: with any down-tilt every ray
      // stops on the ground, so the cap IS the ground footprint. A 7x5 grid
      // across a footprint that runs from 7 ft to 60 ft out cannot follow that
      // curve, and the flat quads cut through the lawn as a fan of blades. The
      // count below is what stopped that being visible.
      const NA=Math.max(12,Math.round(L.f/7)), NV=10;
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
      // A cone fades with distance from the lens. That is worth saying twice
      // over: it is what the coverage model already believes - pixel density
      // falls off with range - and it stops the far end of a 60 ft volume
      // sitting on the lawn as a uniform slab.
      const fade=P=>{
        let mx=0,my=0,mz=0;
        P.forEach(p=>{mx+=p[0];my+=p[1];mz+=p[2];});
        const n=P.length;
        const d=Math.hypot(mx/n-c.x,my/n-c.y,mz/n-c.z)/Math.max(L.r,1);
        return 0.35+0.65*Math.max(0,1-d);
      };
      // A quad whose corners came back at wildly different ranges is straddling
      // an occlusion edge - one ray cleared the porch post, its neighbour did
      // not. Drawn solid it becomes a sheet stretching from the post to the far
      // lawn, and those sheets are what turned the volume into a fan of blades.
      // The grid cannot represent the crease, so fade it out instead: the cone
      // visibly stops at the obstruction rather than smearing past it.
      const straddle=P=>{
        const d=P.map(p=>Math.hypot(p[0]-c.x,p[1]-c.y,p[2]-c.z));
        const t=Math.min(...d)/Math.max(Math.max(...d),0.01);
        // Gentle: only a quad whose corners differ by more than about 8x is
        // removed outright. A first attempt cut at 4x and dissolved the volume
        // wherever it passed a tree, which is exactly where you are looking.
        return clamp((t-0.12)/0.30,0,1);
      };
      const push=(P,a)=>{
        const w=a*fade(P)*straddle(P);
        if(w>0.002)out.push({p:P,col:k,a:w});
      };
      // far cap
      for(let i=0;i<NA;i++)for(let j=0;j<NV;j++)
        push([grid[i][j],grid[i+1][j],grid[i+1][j+1],grid[i][j+1]],alpha);
      // sides, top and bottom: apex to the outer edges
      const apex=[c.x,c.y,c.z];
      for(let j=0;j<NV;j++){
        push([apex,grid[0][j],grid[0][j+1],apex],alpha*0.8);
        push([apex,grid[NA][j],grid[NA][j+1],apex],alpha*0.8);
      }
      for(let i=0;i<NA;i++){
        push([apex,grid[i][0],grid[i+1][0],apex],alpha*0.55);
        push([apex,grid[i][NV],grid[i+1][NV],apex],alpha*0.55);
      }
    });
  });
  return out;
}

