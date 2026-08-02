/* ---------------- plan view ---------------- */
const svg=$('plan');
function drawPlan(){
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  svg.setAttribute('width',W); svg.setAttribute('height',H);
  svg.textContent='';
  const g=el('g'); svg.append(g);
  if($('tGrid').checked){
    const a=Math.floor(sx(0)/5)*5,bb=Math.ceil(sx(W)/5)*5;
    const c0=Math.floor(sy(0)/5)*5,d0=Math.ceil(sy(H)/5)*5;
    for(let v=a;v<=bb;v+=5)g.append(el('line',{class:'gridline',x1:wx(v),y1:0,x2:wx(v),y2:H}));
    for(let v=c0;v<=d0;v+=5)g.append(el('line',{class:'gridline',x1:0,y1:wy(v),x2:W,y2:wy(v)}));
  }
  // property boundary
  {
    const dfs=el('defs');
    const gp=el('pattern',{id:'grass2d',width:10,height:10,patternUnits:'userSpaceOnUse'});
    gp.append(el('rect',{width:10,height:10,fill:'#22301F'}));
    gp.append(el('path',{d:'M2 8 l1.5 -4 M6 9 l1 -4',stroke:'#2E4429','stroke-width':.9,
      'stroke-linecap':'round'}));
    dfs.append(gp); g.append(dfs);
    g.append(el('polygon',{points:prop.map(([x,y])=>`${wx(x)},${wy(y)}`).join(' '),
      fill:'url(#grass2d)',stroke:'none'}));
    [...boxes.filter(b=>b.on).map(shadowOf),...fenceShadows()].forEach(poly=>{
      g.append(el('polygon',{points:poly.map(([x,y])=>`${wx(x)},${wy(y)}`).join(' '),
        fill:'#12200F','fill-opacity':.5,stroke:'none'}));
    });
    const pts=prop.map(([x,y])=>`${wx(x)},${wy(y)}`).join(' ');
    g.append(el('polygon',{points:pts,fill:'none',stroke:selProp?'#E9E5DB':'#4A5462',
      stroke:selProp?'#E9E5DB':(fence.on?MAT.wood:'#4A5462'),
      'stroke-width':(fence.on?3.4:1.4)*(selProp?1.3:1),
      'stroke-dasharray':fence.on?'':'8 5'}));
    if(selProp){
      prop.forEach(([x,y],i)=>{
        const h=el('circle',{cx:wx(x),cy:wy(y),r:7,fill:'#0F1319',stroke:'#E9E5DB',
          'stroke-width':1.8,style:'cursor:move'});
        h.dataset.vert=i; g.append(h);
      });
      prop.forEach(([x,y],i)=>{
        const [nx,ny]=prop[(i+1)%prop.length];
        const mx=(x+nx)/2, my=(y+ny)/2;
        const h=el('g',{style:'cursor:copy'}); h.dataset.mid=i;
        h.append(el('circle',{cx:wx(mx),cy:wy(my),r:9,fill:'transparent'}));
        h.append(el('circle',{cx:wx(mx),cy:wy(my),r:5,fill:'#0F1319',stroke:'#7C8593','stroke-width':1.3}));
        h.append(el('path',{d:`M ${wx(mx)-2.5} ${wy(my)} h5 M ${wx(mx)} ${wy(my)-2.5} v5`,
          stroke:'#B9C0C9','stroke-width':1.2}));
        g.append(h);
      });
    }
  }
  // coverage cones
  if($('rmode').value==='cones'){
    const tz=parseFloat($('tz').value);
    const astep=coarse?3:1.25, dstep=coarse?1.6:0.8;
    cams.forEach(c=>{
      if(!c.on)return;
      const k=colC(c), dim=(sel&&sel!==c.id)?.13:1;
      const gc=el('g'); gc.style.opacity=dim; gc.style.pointerEvents='none';
      if($('tTour').checked&&(c.lens||'ptz')==='ptz'&&c.tour&&c.tour.length){
        const save={a:c.a,t:c.t};
        c.tour.forEach(kf=>{
          c.a=kf.a; c.t=kf.t;
          conePaths(c,tz,1,coarse?4:2,coarse?2:1.2).forEach(d=>
            gc.append(el('path',{d,fill:k,'fill-opacity':.07,stroke:k,
              'stroke-opacity':.35,'stroke-width':.7,'stroke-dasharray':'5 4'})));
        });
        c.a=save.a; c.t=save.t;
      }
      conePaths(c,tz,1,astep,dstep).forEach(d=>
        gc.append(el('path',{d,fill:k,'fill-opacity':.14,stroke:k,
          'stroke-opacity':.5,'stroke-width':.9,'stroke-linejoin':'round'})));
      if($('tId').checked)
        conePaths(c,tz,2,astep,dstep).forEach(d=>
          gc.append(el('path',{d,fill:k,'fill-opacity':.24,stroke:'none'})));
      g.append(gc);
    });
  }
  // occluder boxes
  boxes.forEach(b=>{
    const isSel=selBox===b.id;
    const tall=zmax(b)-zmin(b);
    g.append(el('rect',{x:wx(b.x0),y:wy(b.y0),width:(b.x1-b.x0)*T.s,height:(b.y1-b.y0)*T.s,
      fill:b.on?(tall>6?MAT.wall:(/deck/i.test(b.name)?MAT.deck:MAT.wood)):'transparent',
      'fill-opacity':b.on?(tall>6?1:.85):.2,
      stroke:isSel?'#E9E5DB':'#4A5462','stroke-width':isSel?1.6:.9,
      'stroke-dasharray':b.on?'':'4 3'}));
    const cxm=wx((b.x0+b.x1)/2), cym=wy((b.y0+b.y1)/2);
    g.append(txt({x:cxm,y:cym,'text-anchor':'middle','font-family':'var(--mono)','font-size':9,
      fill:tall>6?'#5B6472':'#97A0AD'},b.name));
    g.append(txt({x:cxm,y:cym+11,'text-anchor':'middle','font-family':'var(--mono)','font-size':8,
      fill:tall>6?'#8F959D':'#7C8593'},
      isFlat(b)?`${b.zb[0]}–${b.zt[0]} ft`:`${zmin(b)}–${zmax(b)} ft sloped`));
    if(isSel){
      const mh=el('g',{style:'cursor:move'}); mh.dataset.box=b.id; mh.dataset.grab='move';
      mh.append(el('circle',{cx:cxm,cy:cym+22,r:13,fill:'transparent'}));
      mh.append(el('circle',{cx:cxm,cy:cym+22,r:7,fill:'#0F1319',stroke:'#E9E5DB','stroke-width':1.5}));
      mh.append(el('path',{d:`M ${cxm-3.5} ${cym+22} h7 M ${cxm} ${cym+18.5} v7`,
        stroke:'#E9E5DB','stroke-width':1.3}));
      g.append(mh);
      [[b.x0,b.y0,'nw'],[b.x1,b.y0,'ne'],[b.x1,b.y1,'se'],[b.x0,b.y1,'sw']].forEach(([hx,hy,k])=>{
        const h=el('rect',{x:wx(hx)-5,y:wy(hy)-5,width:10,height:10,fill:'#0F1319',
          stroke:'#E9E5DB','stroke-width':1.4,style:'cursor:nwse-resize'});
        h.dataset.box=b.id; h.dataset.corner=k; g.append(h);
      });
    }
  });
  // cameras
  cams.forEach(c=>{
    const k=colC(c), dim=(sel&&sel!==c.id)?.3:1;
    const gg=el('g'); gg.style.opacity=c.on?dim:.22;
    const ax=wx(c.x+7*Math.cos(rad(c.a))), ay=wy(c.y+7*Math.sin(rad(c.a)));
    gg.append(el('line',{x1:wx(c.x),y1:wy(c.y),x2:ax,y2:ay,stroke:k,'stroke-width':1.6}));
    const aim=el('g',{style:'cursor:grab'}); aim.dataset.cam=c.id; aim.dataset.mode='aim';
    aim.append(el('circle',{cx:ax,cy:ay,r:11,fill:'transparent'}));
    aim.append(el('circle',{cx:ax,cy:ay,r:4,fill:k}));
    const mv=el('g',{style:'cursor:move'}); mv.dataset.cam=c.id; mv.dataset.mode='move';
    mv.append(el('circle',{cx:wx(c.x),cy:wy(c.y),r:12,fill:'transparent'}));
    mv.append(el('circle',{cx:wx(c.x),cy:wy(c.y),r:5.5,fill:'#0F1319',stroke:k,'stroke-width':2}));
    gg.append(aim,mv);
    gg.append(txt({x:wx(c.x),y:wy(c.y)-11,'text-anchor':'middle',fill:k,
      'font-family':'var(--mono)','font-size':10,'font-weight':500},c.id));
    g.append(gg);
  });
  // compass
  const nx=wx(-29),ny=wy(-24);
  g.append(el('line',{x1:nx,y1:ny+14,x2:nx,y2:ny-14,stroke:'#5C6673','stroke-width':1.2}));
  g.append(el('path',{d:`M ${nx} ${ny-18} l 5 10 l -10 0 Z`,fill:'#8A9099'}));
  g.append(txt({x:nx,y:ny+27,'text-anchor':'middle','font-family':'var(--mono)','font-size':9,
    fill:'#6E7783'},'N / FRONT ←'));
}

