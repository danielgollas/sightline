/* ---------------- presets & buttons ---------------- */


const PRESETS={
 yours:[['ptz',-1.2,11.3,8.5,185],['ptz',-0.4,1.5,10.5,143],['ptz',25.7,2.2,8,329],
        ['ptz',26,23.5,10.5,329],['ptz',1.7,25,10.5,48],['ptz',3.4,-0.6,11,316],['ptz',22.2,-0.8,11,224]],
 duo2 :[['duo',12.5,-1,11,270],['duo',12.5,26,11,90],['ptz',-6.5,11,8.5,126],
        ['ptz',33.5,3.5,8,312],['ptz',-1.5,-1.5,10.5,135],['ptz',26.5,26.5,10.5,309]],
 duo4 :[['duo',12.5,-1,11,270],['duo',26,12.5,11,0],['duo',12.5,26,11,90],['duo',-1,12.5,11,180]]
};
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{
  if(b.dataset.preset==='measured'){
    loadMeasured(); sel=selBox=null; splat=null; render(); list();
    toast('Measured house loaded'); return;
  }
  cams=PRESETS[b.dataset.preset].map(([lens,x,y,z,a],i)=>
    ({id:'C'+(i+1),lens,x,y,z,a,t:15,name:LENS[lens].label,note:'',on:true}));
  sel=null;render();list();toast('Cameras swapped — structures kept');
});
$('bFit').onclick=()=>resetView();
$('bReset').onclick=()=>{loadMeasured();sel=selBox=null;splat=null;render();list();toast('Reset to measured house');};
$('bAddCam').onclick=()=>{
  let n=1; while(cams.some(c=>c.id==='C'+n))n++;
  const c={id:'C'+n,lens:'ptz',x:-14,y:16,z:10.5,a:0,t:15,name:'New camera',note:'',on:true};
  cams.push(c); sel=c.id; render(); list();
};
$('bAddBox').onclick=()=>{
  let n=1; while(boxes.some(b=>b.id==='B'+n))n++;
  const b={id:'B'+n,name:'New occluder',x0:-14,y0:-10,x1:-6,y1:-2,zb:[0,0,0,0],zt:[8,8,8,8],on:true};
  boxes.push(b); selBox=b.id; sel=null; render(); list();
};
['tOcc','tId','tGrid','tz','rmode','tSplat','tTour','tFrus','tFence','fh'].forEach(i=>$(i).onchange=()=>{render();list();});
$('tFence').onchange=()=>{fence.on=$('tFence').checked;splat=frusta=null;render();list();};
$('fh').oninput=()=>{const v=parseFloat($('fh').value); if(!Number.isNaN(v)){fence.h=v;splat=frusta=null;render();list();}};
$('bCopy').onclick=async()=>{const t=$('code');t.select();
  try{await navigator.clipboard.writeText(t.value);toast('Copied');}catch(e){toast('Select and copy');}};
$('bLoad').onclick=()=>{
  const {C,B,P}=decode($('code').value);
  if(!C.length&&!B.length&&!P){toast('Nothing recognised');return;}
  if(C.length)cams=C; if(B.length)boxes=B; if(P)prop=P;
  sel=selBox=null;selProp=false;splat=null;render();list();
  toast(`Loaded ${C.length} cameras, ${B.length} occluders${P?', boundary':''}`);
};
