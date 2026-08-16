/* ---------------- PT circuit animation ---------------- */
const MOVE=1.5;                       // seconds to swing between stops
let speed=4;                          // playback multiplier
let playing=false, t0=0, snap=null, lastFrame=0;
function timeline(c){
  const S=stops(c), o=order(c), seg=[];
  o.forEach((idx,j)=>{
    const k=S[idx], n=S[o[(j+1)%o.length]];
    seg.push({kind:'hold',a:k.a,t:k.t,dur:k.d||8});
    seg.push({kind:'move',a0:k.a,t0:k.t,a1:n.a,t1:n.t,dur:MOVE});
  });
  return seg;
}
const shortest=(a,b2)=>{let d=((b2-a+540)%360)-180;return a+d;};
function poseAt(c,tau){
  const seg=timeline(c), tot=seg.reduce((s,k)=>s+k.dur,0);
  let u=tot?tau%tot:0;
  for(const k of seg){
    if(u<k.dur){
      if(k.kind==='hold')return {a:k.a,t:k.t};
      const f=u/k.dur, e=f*f*(3-2*f);            // ease in-out
      return {a:norm(k.a0+(shortest(k.a0,k.a1)-k.a0)*e), t:k.t0+(k.t1-k.t0)*e};
    }
    u-=k.dur;
  }
  return {a:c.a,t:c.t};
}
function frame(ts){
  if(!playing)return;
  const tau=(ts-t0)/1000*speed;
  cams.forEach(c=>{
    if((c.lens||'ptz')!=='ptz'||!c.tour||!c.tour.length)return;
    const base=snap[c.id]; if(!base)return;
    const saveA=c.a,saveT=c.t; c.a=base.a; c.t=base.t;
    const q=poseAt(c,tau); c.a=Math.round(q.a*10)/10; c.t=Math.round(q.t*10)/10;
  });
  if(ts-lastFrame>90){ lastFrame=ts; coarse=true; render(); }
  requestAnimationFrame(frame);
}
function togglePlay(){
  playing=!playing;
  $('bPlay').setAttribute('aria-pressed',playing);
  $('bPlay').textContent=playing?'❚❚ CIRCUIT':'▶ CIRCUIT';
  if(playing){
    if(!cams.some(c=>c.tour&&c.tour.length)){toast('No PT circuits defined');playing=false;
      $('bPlay').textContent='▶ CIRCUIT';$('bPlay').setAttribute('aria-pressed',false);return;}
    snap={}; cams.forEach(c=>snap[c.id]={a:c.a,t:c.t});
    t0=performance.now(); lastFrame=0;
    requestAnimationFrame(frame);
  } else {
    if(snap)cams.forEach(c=>{const b2=snap[c.id]; if(b2){c.a=b2.a;c.t=b2.t;}});
    snap=null; coarse=false; render(); list();
  }
}
$('bPlay').onclick=togglePlay;
$('bSpeed').onclick=()=>{speed=speed===1?4:speed===4?10:1;$('bSpeed').textContent=speed+'×';};

let tt;
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');
  clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),1900);}
addEventListener('keydown',ev=>{
  const t=ev.target.tagName;
  if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT'||ev.metaKey||ev.ctrlKey)return;
  const k=ev.key.toLowerCase();
  if(k==='2'){$('m2d').click();}
  else if(k==='3'){$('m3d').click();}
  else if(k==='4'){$('mpov').click();}
  else if(k==='5'){$('msplit').click();}
  else if(k===' '){togglePlay();}
  else if(k==='f'){resetView();}
  else if(k==='b'){const {P}=decodeRaw(MEASURED); if(P){prop=P;splat=null;render();list();
    toast('Boundary restored — '+Math.round(polyArea()).toLocaleString()+' sq ft');}}
  else if(k==='e'){selProp=!selProp;sel=null;selBox=null;render();list();}
  else if(k==='s'){opts.splat=!opts.splat;render();list();}
  else if(k==='v'){opts.frus=!opts.frus;render();list();}
  else if(k==='o'){opts.occ=!opts.occ;splat=null;render();list();}
  else if(k==='g'){opts.grid=!opts.grid;render();}
  else if(k==='n'){opts.night=!opts.night;clearSpecCache();splat=null;render();list();
    toast(opts.night?'Night: range limited by IR and floodlight':'Day');}
  else if(k==='escape'){sel=null;selBox=null;selProp=false;render();list();}
  else return;
  ev.preventDefault();
});
addEventListener('resize',()=>render());

/* ---------------- boot ---------------- */
// Order matters. The project's own catalog snapshot is seeded first so every
// camera resolves to a spec before anything asks for coverage; the network
// catalog is enrichment that arrives later, or never.
function boot(){
  initSidebar();
  restoreUserCatalog();
  if(!restore()){
    // No saved project: the default house, its porches and deck, a square
    // boundary and one recorder.
    loadMeasured();
  } else {
    CAT.seedFromProject(projectSnapshot());
  }
  fitProp();                      // frame whatever lot we ended up with
  render(); list();
  CAT.fetchCatalog().then(()=>{
    clearSpecCache();
    render(); list();
  });
}
boot();
