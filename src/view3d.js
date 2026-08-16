/* ---------------- 3D view ---------------- */
const v3=$('view3d');
let az=-38, elv=32, zoom=1, panX=0, panY=0;
// World point to a position in the SVG overlay.
//
// When WebGL is drawing the scene this MUST use the same matrices GL used, or
// the overlay only coincides with the render at one point and drifts away from
// it as you orbit. It used to be an independent orthographic projection while
// GL rendered in perspective, which put the camera markers and - worse - the
// box edit handles up to 200 px from the geometry they belong to, by an amount
// that changed with every rotation.
//
// The orthographic path below is still the real projection when WebGL is
// unavailable, because then this function IS the renderer.
function proj(x,y,z){
  if(GLON&&glView3D){
    const M=glView3D.mvp, V=glView3D.view;
    const X=M[0]*x+M[4]*y+M[8]*z+M[12];
    const Y=M[1]*x+M[5]*y+M[9]*z+M[13];
    const Wc=M[3]*x+M[7]*y+M[11]*z+M[15];
    // View-space depth, negated so larger still means nearer the viewer -
    // the overlay's painter sort and the +50 handle bias both rely on that.
    const vz=V[2]*x+V[6]*y+V[10]*z+V[14];
    if(Wc<=1e-6)return {x:-1e5,y:-1e5,d:-1e9};      // behind the eye
    return {x:(X/Wc*0.5+0.5)*W, y:(1-(Y/Wc*0.5+0.5))*H, d:-vz};
  }
  const A=rad(az), E=rad(elv);
  const X=x*Math.cos(A)-y*Math.sin(A);
  const Y=x*Math.sin(A)+y*Math.cos(A);
  const s=Math.min(W/VIEW.w,H/VIEW.h)*zoom;
  return {x:W/2+panX+(X-12.5)*s, y:H/2+panY+((Y-12.5)*Math.sin(E)-z*Math.cos(E))*s,
          d:(Y-12.5)*Math.cos(E)+z*Math.sin(E)};
}
// top corners in order NW, NE, SE, SW
const XY=b=>[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]];   // NW NE SE SW
const TC=b=>XY(b).map(([x,y],i)=>[x,y,b.zt[i]]);
const BC=b=>XY(b).map(([x,y],i)=>[x,y,b.zb[i]]);
const FACES=[
 {pts:b=>{const t=TC(b);return [t[0],t[1],t[2]];},axis:'top',shade:.30},
 {pts:b=>{const t=TC(b);return [t[0],t[2],t[3]];},axis:'top',shade:.32},
 {pts:b=>{const t=BC(b);return [t[0],t[1],t[2]];},axis:'base',shade:.05},
 {pts:b=>{const t=BC(b);return [t[0],t[2],t[3]];},axis:'base',shade:.06},
 {pts:b=>[[b.x0,b.y0,b.zb[0]],[b.x1,b.y0,b.zb[1]],[b.x1,b.y0,b.zt[1]],[b.x0,b.y0,b.zt[0]]],axis:'y0',shade:.20},
 {pts:b=>[[b.x0,b.y1,b.zb[3]],[b.x1,b.y1,b.zb[2]],[b.x1,b.y1,b.zt[2]],[b.x0,b.y1,b.zt[3]]],axis:'y1',shade:.14},
 {pts:b=>[[b.x0,b.y0,b.zb[0]],[b.x0,b.y1,b.zb[3]],[b.x0,b.y1,b.zt[3]],[b.x0,b.y0,b.zt[0]]],axis:'x0',shade:.24},
 {pts:b=>[[b.x1,b.y0,b.zb[1]],[b.x1,b.y1,b.zb[2]],[b.x1,b.y1,b.zt[2]],[b.x1,b.y0,b.zt[1]]],axis:'x1',shade:.10}
];
// edge + face handles: which corner indices each one moves
const EDGES=[{k:'N',c:[0,1]},{k:'E',c:[1,2]},{k:'S',c:[2,3]},{k:'W',c:[3,0]}];
function draw3d(){
  v3.setAttribute('viewBox',`0 0 ${W} ${H}`);
  v3.setAttribute('width',W); v3.setAttribute('height',H);
  v3.textContent='';
  const g=el('g'); v3.append(g);
  const items=[];
  if(!GLON){
  // grass inside the boundary
  {
    const dfs=el('defs');
    const gp=el('pattern',{id:'grass3d',width:16,height:16,patternUnits:'userSpaceOnUse'});
    gp.append(el('rect',{width:16,height:16,fill:MAT.grass}));
    gp.append(el('path',{d:'M3 13 l2 -5 M8 14 l1.5 -6 M12 12 l2 -4',
      stroke:MAT.grassLit,'stroke-width':1.1,'stroke-linecap':'round','stroke-opacity':.7}));
    dfs.append(gp); g.append(dfs);
    const P=prop.map(([x,y])=>proj(x,y,0));
    items.push({d:-9e5,e:el('polygon',{points:P.map(q=>`${q.x},${q.y}`).join(' '),
      fill:'url(#grass3d)',stroke:MAT.grassDark,'stroke-width':1.4})});
  }
  // shadows
  [...boxes.filter(b=>b.on).map(shadowOf),...fenceShadows()].forEach(poly=>{
    const P=poly.map(([x,y])=>proj(x,y,0.02));
    items.push({d:-8.9e5,e:el('polygon',{points:P.map(q=>`${q.x},${q.y}`).join(' '),
      fill:MAT.shadow,'fill-opacity':.45,stroke:'none'})});
  });
  // perimeter fence
  if(fence.on&&fence.h>0){
    for(let i=0;i<prop.length;i++){
      const [ax,ay]=prop[i], [bx,by]=prop[(i+1)%prop.length];
      const W3=[[ax,ay,0],[bx,by,0],[bx,by,fence.h],[ax,ay,fence.h]];
      const P=W3.map(([x,y,z])=>proj(x,y,z));
      items.push({d:P.reduce((s,q)=>s+q.d,0)/4,
        e:el('polygon',{points:P.map(q=>`${q.x},${q.y}`).join(' '),
          fill:shade(normalOf(W3),MAT.wood),stroke:MAT.woodDark,'stroke-width':.8})});
    }
  }
  }
  // ground grid
  if(!GLON)for(let v=-30;v<=65;v+=5){
    const a=proj(v,-30,0),b=proj(v,60,0),c=proj(-30,v,0),d=proj(60,v,0);
    items.push({d:-1e6,e:el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#1E2732','stroke-width':1})});
    items.push({d:-1e6,e:el('line',{x1:c.x,y1:c.y,x2:d.x,y2:d.y,stroke:'#1E2732','stroke-width':1})});
  }
  // Frustum solids are drawn by the GL pass now (GL.drawFrusta), depth-tested
  // against the scene. As SVG they were painted over the render, so a cone
  // pointing away through the house showed straight through the wall - and they
  // were expensive enough to have to disappear while you orbited.
  if(!GLON&&frusOn()&&frusta&&!orbit){
    frusta.forEach(f=>{
      const P=f.p.map(([x,y,z])=>proj(x,y,z));
      items.push({d:P.reduce((s,q)=>s+q.d,0)/P.length,
        e:el('polygon',{points:P.map(q=>`${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '),
          fill:f.col,'fill-opacity':f.a,stroke:f.col,'stroke-opacity':f.a*0.5,'stroke-width':.4})});
    });
  }
  // Splatter is drawn by the GL pass now (GL.drawSplat), against the real
  // depth buffer. As SVG it was painted over the render and patches behind a
  // building showed straight through it.

  boxes.forEach(b=>{
    if(!b.on)return;
    const isSel=selBox===b.id;
    if(!GLON)FACES.forEach(f=>{
      const W3=f.pts(b);
      const P=W3.map(([x,y,z])=>proj(x,y,z));
      const dep=P.reduce((s,p)=>s+p.d,0)/4;
      const e=el('polygon',{points:P.map(p=>`${p.x},${p.y}`).join(' '),
        fill:shade(outNormal(b,W3),matOf(b)),'fill-opacity':isSel?1:.95,
        stroke:isSel?'#E9E5DB':'rgba(0,0,0,.3)','stroke-width':isSel?1.5:.7,
        style:isSel?'cursor:ns-resize':'cursor:pointer'});
      e.dataset.box=b.id; e.dataset.face=f.axis;
      items.push({d:dep,e});
    });
    if(isSel){
      // A cylinder or a tree is described by its centre and radius, not by four
      // sides, and its x0..x1 is only a couple of feet wide - so the four edge
      // handles land on top of each other and read as one black smudge with
      // N/E/S/W stacked in it. Round occluders get the centre handle only.
      const round=b.shape==='cyl'||b.shape==='tree';
      [['zt',TC(b),'#E9E5DB'],['zb',BC(b),'#9AA3B0']].forEach(([key,C,clr])=>{
        if(!round)EDGES.forEach(ed=>{
          const a=C[ed.c[0]], z=C[ed.c[1]];
          const P=proj((a[0]+z[0])/2,(a[1]+z[1])/2,(a[2]+z[2])/2);
          const h=el('rect',{x:P.x-6,y:P.y-6,width:12,height:12,rx:2,fill:'#0F1319',
            stroke:clr,'stroke-width':1.6,style:'cursor:ns-resize'});
          h.dataset.box=b.id; h.dataset.surf=key; h.dataset.edge=ed.c.join(',');
          items.push({d:P.d+50,e:h});
          items.push({d:P.d+50,e:txt({x:P.x,y:P.y-9,'text-anchor':'middle',fill:clr,
            'font-family':'var(--mono)','font-size':8},ed.k)});
        });
        const cxx=C.reduce((s,p)=>s+p[0],0)/4, cyy=C.reduce((s,p)=>s+p[1],0)/4,
              czz=C.reduce((s,p)=>s+p[2],0)/4;
        const P=proj(cxx,cyy,czz);
        const h=el('circle',{cx:P.x,cy:P.y,r:7,fill:'#0F1319',stroke:clr,'stroke-width':1.6,
          style:'cursor:ns-resize'});
        h.dataset.box=b.id; h.dataset.surf=key; h.dataset.edge='0,1,2,3';
        items.push({d:P.d+51,e:h});
      });
    }
  });
  // cameras: mast + aim ray + fov edges
  cams.forEach(c=>{
    if(!c.on)return;
    const k=colC(c), L=lensOf(c);
    const base=proj(c.x,c.y,0), top=proj(c.x,c.y,c.z);
    items.push({d:top.d,e:el('line',{x1:base.x,y1:base.y,x2:top.x,y2:top.y,
      stroke:k,'stroke-width':1,'stroke-opacity':.45,'stroke-dasharray':'3 3'})});
    if(!frusOn())
    [-L.f/2,0,L.f/2].forEach(off=>{
      [-L.vf/2,L.vf/2].forEach(vo=>{
        const aa=rad(c.a+off), tt=rad((c.t||0)+vo);
        const hd=Math.min(L.r,(c.z-3)/Math.max(Math.tan(tt),0.05));
        const ex=c.x+hd*Math.cos(aa), ey=c.y+hd*Math.sin(aa);
        const ez=c.z-hd*Math.tan(tt);
        const p=proj(ex,ey,Math.max(ez,0));
        items.push({d:top.d,e:el('line',{x1:top.x,y1:top.y,x2:p.x,y2:p.y,
          stroke:k,'stroke-width':off===0?1.3:.8,'stroke-opacity':off===0?.85:.4})});
      });
    });
    items.push({d:top.d+1,e:el('circle',{cx:top.x,cy:top.y,r:5,fill:'#0F1319',stroke:k,'stroke-width':2})});
    items.push({d:top.d+1,e:txt({x:top.x,y:top.y-10,'text-anchor':'middle',fill:k,
      'font-family':'var(--mono)','font-size':10},c.id)});
  });
  items.sort((a,b)=>a.d-b.d).forEach(i=>g.append(i.e));
}

