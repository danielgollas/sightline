/* ---------------- render ---------------- */
let coarse=false;
function render(){
  T=fit();
  if(mode!=='3d')$('gl3d').style.display='none';
  if(mode==='pov'){
    cov.style.display='none'; svg.style.display='none'; v3.style.display='none';
    renderPOV();
  }
  else if(mode==='split'){
    const heat=$('rmode').value==='heat';
    cov.style.display=heat?'':'none'; svg.style.display=''; v3.style.display='none';
    if(heat)paintCoverage(coarse);
    drawPlan();
    renderPOV();
  }
  else if(mode==='2d'){
    const heat=$('rmode').value==='heat';
    cov.style.display=heat?'':'none'; svg.style.display=''; v3.style.display='none';
    if(heat)paintCoverage(coarse);
    drawPlan(); }
  else if(mode==='3d'){ cov.style.display='none'; svg.style.display='none';
    $('gl3d').style.display=''; v3.style.display='';
    GLON=render3DGL();
    splat=(!playing&&$('tSplat').checked)?buildSplat():null;
    frusta=(!playing&&$('tFrus').checked)?buildFrusta():null;
    draw3d(); }
  if(!playing){ $('code').value=encode(); updateStats(); }
}
let statTimer;
function updateStats(){
  clearTimeout(statTimer);
  statTimer=setTimeout(()=>{
    const tz=parseFloat($('tz').value);
    const B=propBounds();
    let ac=0,ai=0,n=0;
    for(let x=B.x0;x<=B.x1;x+=1.5)for(let y=B.y0;y<=B.y1;y+=1.5){
      if(!inProp(x,y)||inAnyBox(x,y))continue;
      n++;
      let best=0;
      for(const c of cams){ if(!c.on)continue; const q=quality(c,x,y,tz); if(q>best)best=q; }
      if(best)ac++; if(best===2)ai++;
    }
    // second pass: only ground within 25 ft of a structure
    let nc=0,cc=0,ci=0,dut=0;
    const near=(x,y)=>boxes.some(b=>{
      if(!b.on||zmax(b)<3)return false;
      const dx=Math.max(b.x0-x,0,x-b.x1), dy=Math.max(b.y0-y,0,y-b.y1);
      return Math.hypot(dx,dy)<=25;});
    for(let x=B.x0;x<=B.x1;x+=1.5)for(let y=B.y0;y<=B.y1;y+=1.5){
      if(!inProp(x,y)||inAnyBox(x,y)||!near(x,y))continue;
      nc++;
      let best=0,fr=0;
      for(const c of cams){ if(!c.on)continue;
        const q=quality(c,x,y,tz);
        if(q>best)best=q;
        const f=swept(c,x,y,tz).frac;
        if(f>fr)fr=f; }
      if(best)cc++; if(best===2)ci++;
      dut+=fr;
    }
    const area=Math.round(n*2.25), areaN=Math.round(nc*2.25);
    $('stats').textContent='';
    $('statline').innerHTML=n?
      `<b>Near buildings</b> (within 25 ft, ~${areaN.toLocaleString()} sq ft): `+
      `<b>${Math.round(100*cc/Math.max(nc,1))}%</b> on camera, <b>${Math.round(100*ci/Math.max(nc,1))}%</b> at face-ID.`+
      `<br><span style="color:var(--dim)">Whole lot (~${area.toLocaleString()} sq ft): `+
      `${Math.round(100*ac/n)}% on camera, ${Math.round(100*ai/n)}% at face-ID.`+
      (cams.some(c=>c.on&&c.tour&&c.tour.length)
        ? `<br>Near ground is watched <b style="color:var(--bone)">${
            Math.round(100*dut/Math.max(nc,1))}%</b> of each PT cycle on average.`
        : '')+`</span>`
      :'Property boundary encloses no open ground.';
  },120);
}

