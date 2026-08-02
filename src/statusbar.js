/* ---------------- status bar and layer strip ---------------- */
const pct=(a,b)=>b?Math.round(100*a/b)+'%':'—';
function fmtDays(d){
  if(!isFinite(d)||d<=0)return '—';
  if(d<1)return (d*24).toFixed(1)+' h';
  if(d<90)return d.toFixed(1)+' d';
  return (d/30.4).toFixed(1)+' mo';
}
// `stale` dims the figures while the full-resolution pass is still running,
// so a coarse number is never mistaken for the final one.
function paintStats(r,stale){
  const bar=$('status'); if(!bar)return;
  const t=totals();
  bar.classList.toggle('stale',!!stale);
  const cells=[];
  cells.push(['', `<b>${t.nvrs}</b> NVR${t.nvrs===1?'':'s'} · <b>${t.cams}</b> cam${t.cams===1?'':'s'}`]);
  cells.push([t.cams>t.chans?'warn':'', `<b>${t.cams}/${t.chans||'?'}</b> channels`]);
  cells.push(['', priceKnown()?`<b>$${Math.round(t.cost).toLocaleString()}</b>`:'price <b>not set</b>']);
  if(r&&r.nc){
    cells.push(['', `near buildings <b>${pct(r.cc,r.nc)}</b> · face-ID <b>${pct(r.ci,r.nc)}</b>`]);
    cells.push(['', `lot <b>${pct(r.ac,r.n)}</b>`]);
    if(r.anyTour)cells.push(['', `watched <b>${pct(r.dut,r.nc)}</b> of each PT cycle`]);
  } else if(r){
    cells.push(['', 'boundary encloses no open ground']);
  }
  cells.push(['', `<b>${(t.storageGB/1000).toFixed(1)}</b> TB · <b>${t.mbps.toFixed(1)}</b> Mbps`]);
  cells.push(['', `records <b>${fmtDays(t.days)}</b>`]);
  if(opts.night)cells.push(['warn','<b>night</b>']);
  bar.innerHTML=cells.map(([c,h])=>`<span class="cell ${c}">${h}</span>`).join('');
  bar.title='Recording duration assumes continuous recording at the current fps and quality.';
}

// The handful of toggles worth keeping one click away from the stage.
function renderLayers(){
  const el=$('layers'); if(!el)return;
  el.textContent='';
  const t=(label,on,fn,title)=>{
    const b=document.createElement('button');
    b.textContent=label; b.setAttribute('aria-pressed',on?'true':'false');
    if(title)b.title=title;
    b.onclick=()=>{fn();render();list();};
    el.append(b);
  };
  t('OCCL',opts.occ,()=>{opts.occ=!opts.occ;splat=null;},'Occlusion on/off (O)');
  t('FACE-ID',opts.id,()=>opts.id=!opts.id,'Shade the face-ID range');
  t('CIRCUIT',opts.tour,()=>opts.tour=!opts.tour,'Count PT circuit coverage');
  t('FRUSTA',opts.frus,()=>opts.frus=!opts.frus,'Frustum solids in 3D (V)');
  t('SPLAT',opts.splat,()=>opts.splat=!opts.splat,'Splatter surfaces in 3D (S)');
  t('GRID',opts.grid,()=>opts.grid=!opts.grid,'5 ft grid (G)');
  t('NIGHT',opts.night,()=>{opts.night=!opts.night;clearSpecCache();splat=null;},'Limit range to IR / floodlight (N)');
}

/* ---------------- sidebar resizing ---------------- */
function initSidebar(){
  const side=$('side');
  const px=+localStorage.getItem('sightline.sidebar')||320;
  document.documentElement.style.setProperty('--sidebar',px+'px');
  const savedH=localStorage.getItem('sightline.treeh');
  if(savedH)side.style.setProperty('--treeh',savedH);

  let drag=null;
  $('grip').addEventListener('pointerdown',e=>{
    drag={x:e.clientX,w:side.getBoundingClientRect().width};
    $('grip').setPointerCapture(e.pointerId); e.preventDefault();
  });
  $('grip').addEventListener('pointermove',e=>{
    if(!drag)return;
    const w=clamp(drag.w+(e.clientX-drag.x),210,620);
    document.documentElement.style.setProperty('--sidebar',w+'px');
    render();
  });
  ['pointerup','pointercancel'].forEach(v=>$('grip').addEventListener(v,()=>{
    if(!drag)return;
    drag=null;
    localStorage.setItem('sightline.sidebar',parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar')));
    render();
  }));

  let vdrag=null;
  $('vgrip').addEventListener('pointerdown',e=>{
    vdrag={y:e.clientY,h:$('treepane').getBoundingClientRect().height};
    $('vgrip').setPointerCapture(e.pointerId); e.preventDefault();
  });
  $('vgrip').addEventListener('pointermove',e=>{
    if(!vdrag)return;
    const total=side.getBoundingClientRect().height;
    const h=clamp(vdrag.h+(e.clientY-vdrag.y),80,total-120);
    side.style.setProperty('--treeh',(100*h/total).toFixed(1)+'%');
  });
  ['pointerup','pointercancel'].forEach(v=>$('vgrip').addEventListener(v,()=>{
    if(!vdrag)return;
    vdrag=null;
    localStorage.setItem('sightline.treeh',side.style.getPropertyValue('--treeh'));
  }));
}
