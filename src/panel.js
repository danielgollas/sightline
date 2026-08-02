/* ---------------- panel ---------------- */
function numFld(lbl,val,cb,step){
  const d=document.createElement('div'); d.className='fld';
  const l=document.createElement('label'); l.textContent=lbl;
  const i=document.createElement('input'); i.className='t'; i.type='number';
  i.step=step||0.5; i.value=val;
  i.oninput=()=>{const v=parseFloat(i.value); if(!Number.isNaN(v)){cb(v);render();}};
  d.append(l,i); return d;
}
function list(){
  const L=$('camlist'); L.textContent='';
  cams.forEach(c=>{
    const k=colC(c);
    const d=document.createElement('div');
    d.className='card'+(c.on?'':' off')+(sel===c.id?' sel':'');
    d.style.setProperty('--dot',k);
    const h=document.createElement('div'); h.className='head';
    const lo=lowVis(c);
    h.innerHTML=`<div class="b"><div class="id">${c.id} · ${lensOf(c).label}</div>
      <div class="nm">${c.name}</div><div class="mt">${c.note}<br>
      x ${c.x} · y ${c.y} · ${c.z} ft · aim ${c.a}° · tilt ${c.t}°${
        (c.tour&&c.tour.length)?`<br>PT circuit: ${stops(c).length} stops, ${cycle(c)}s${
          stops(c).length>2?' bounce':''}`:''}
      ${lo?`<br><b>${lo}</b>`:''}</div></div>`;
    const eye=document.createElement('button'); eye.className='eye';
    eye.textContent=c.on?'●':'○';
    eye.onclick=ev=>{ev.stopPropagation();c.on=!c.on;render();list();};
    h.append(eye);
    h.onclick=()=>{sel=sel===c.id?null:c.id;selBox=null;render();list();};
    d.append(h);
    const ed=document.createElement('div'); ed.className='edit';
    const nm=document.createElement('div'); nm.className='fld';
    const nl=document.createElement('label'); nl.textContent='name';
    const ni=document.createElement('input'); ni.className='t'; ni.value=c.name;
    ni.oninput=()=>{c.name=ni.value;$('code').value=encode();};
    nm.append(nl,ni); ed.append(nm);
    const lr=document.createElement('div'); lr.className='row'; lr.style.marginBottom='5px';
    Object.keys(LENS).forEach(key=>{
      const bt=document.createElement('button'); bt.className='act'; bt.textContent=LENS[key].label;
      if((c.lens||'ptz')===key){bt.style.borderColor=k;bt.style.background='#212A35';}
      bt.onclick=()=>{c.lens=key;render();list();};
      lr.append(bt);});
    ed.append(lr);
    ed.append(numFld('height ft',c.z,v=>c.z=v));
    ed.append(numFld('down-tilt°',c.t,v=>c.t=v,1));
    ed.append(numFld('aim °',c.a,v=>c.a=norm(v),1));
    if((c.lens||'ptz')==='ptz'){
      const hdr=document.createElement('div');
      hdr.style.cssText='font-family:var(--mono);font-size:9.5px;color:var(--dim);margin:8px 0 4px;letter-spacing:.1em';
      const cyc=cycle(c);
      const n=stops(c).length;
      hdr.textContent=`PT CIRCUIT · ${n} stops · ${cyc}s cycle`+
        (n>2?' · bounce':'');
      ed.append(hdr);
      ed.append(numFld('home s',c.hd||20,v=>c.hd=Math.max(1,v),1));
      (c.tour||[]).forEach((kf,i)=>{
        const row=document.createElement('div'); row.className='fld';
        const lb=document.createElement('label'); lb.textContent='stop '+(i+1);
        const mk=(val,cb,w)=>{const n=document.createElement('input');
          n.className='t'; n.type='number'; n.step=1; n.value=val; n.style.flex=w;
          n.oninput=()=>{const v=parseFloat(n.value); if(!Number.isNaN(v)){cb(v);render();}};
          return n;};
        const del=document.createElement('button');
        del.className='eye'; del.textContent='×'; del.title='remove stop';
        del.onclick=()=>{c.tour.splice(i,1);render();list();};
        row.append(lb,
          mk(kf.a,v=>kf.a=norm(v),'1 1 0'),
          mk(kf.t,v=>kf.t=clamp(v,-30,60),'1 1 0'),
          mk(kf.d,v=>kf.d=Math.max(1,v),'1 1 0'),
          del);
        row.title='aim° / tilt° / dwell s';
        ed.append(row);
      });
      const kr=document.createElement('div'); kr.className='row'; kr.style.marginBottom='5px';
      const add=document.createElement('button'); add.className='act';
      add.textContent='+ Stop here';
      add.title='Capture the current aim and tilt as a circuit stop';
      add.onclick=()=>{
        c.tour=c.tour||[];
        if(c.tour.length>=2){toast('3 stops total is the cap');return;}
        const last=c.tour.length?c.tour[c.tour.length-1].a:c.a;
        c.tour.push({a:norm(last+60),t:c.t||15,d:8});
        render();list();};
      const clr=document.createElement('button'); clr.className='act'; clr.textContent='Clear';
      clr.onclick=()=>{c.tour=[];render();list();};
      kr.append(add,clr); ed.append(kr);
    }
    const rr=document.createElement('div'); rr.className='row';
    const del=document.createElement('button'); del.className='act danger'; del.textContent='Delete';
    del.onclick=()=>{cams=cams.filter(v=>v!==c);sel=null;render();list();};
    rr.append(del); ed.append(rr); d.append(ed);
    L.append(d);
  });

  const B=$('boxlist'); B.textContent='';
  {
    const d=document.createElement('div');
    d.className='card'+(selProp?' sel':''); d.style.setProperty('--dot','#B9C0C9');
    const h=document.createElement('div'); h.className='head';
    const A=polyArea();
    h.innerHTML=`<div class="b"><div class="id">PROPERTY</div>
      <div class="nm">Boundary</div><div class="mt">${prop.length} vertices · ~${
        Math.round(A).toLocaleString()} sq ft<br>${
        selProp?'drag a vertex · + adds one · shift-click removes':'click to edit'}</div></div>`;
    h.onclick=()=>{selProp=!selProp;sel=null;selBox=null;render();list();};
    d.append(h);
    const ed=document.createElement('div'); ed.className='edit';
    // scale the polygon about its centroid to hit a known lot area
    const sr=document.createElement('div'); sr.className='fld';
    const sl2=document.createElement('label'); sl2.textContent='lot sq ft';
    const si=document.createElement('input'); si.className='t'; si.type='number'; si.step=100;
    si.value=Math.round(polyArea());
    const sb=document.createElement('button'); sb.className='act'; sb.style.flex='0 0 62px';
    sb.textContent='Scale';
    sb.onclick=()=>{
      const target=parseFloat(si.value), cur=polyArea();
      if(!(target>0)||!(cur>0))return;
      const k=Math.sqrt(target/cur);
      const cx0=prop.reduce((a,v)=>a+v[0],0)/prop.length;
      const cy0=prop.reduce((a,v)=>a+v[1],0)/prop.length;
      prop=prop.map(([x,y])=>[Math.round((cx0+(x-cx0)*k)*10)/10,
                              Math.round((cy0+(y-cy0)*k)*10)/10]);
      render();list();toast('Scaled to '+Math.round(polyArea()).toLocaleString()+' sq ft');
    };
    sr.append(sl2,si,sb); ed.append(sr);
    const r=document.createElement('div'); r.className='row';
    const sq=document.createElement('button'); sq.className='act'; sq.textContent='Reset to square';
    sq.onclick=()=>{prop=DEF_PROP();render();list();};
    const md=document.createElement('button'); md.className='act'; md.textContent='Measured lot';
    md.title='Restore the surveyed boundary without touching cameras or structures';
    md.onclick=()=>{const {P}=decodeRaw(MEASURED); if(P){prop=P;splat=null;render();list();
      toast('Boundary restored — '+Math.round(polyArea()).toLocaleString()+' sq ft');}};
    const ft=document.createElement('button'); ft.className='act'; ft.textContent='Fit to structures';
    ft.onclick=()=>{
      const on=boxes.filter(b=>b.on);
      if(!on.length)return;
      const m=8;
      const x0=Math.min(...on.map(b=>b.x0))-m, x1=Math.max(...on.map(b=>b.x1))+m;
      const y0=Math.min(...on.map(b=>b.y0))-m, y1=Math.max(...on.map(b=>b.y1))+m;
      prop=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([a,c])=>[Math.round(a*10)/10,Math.round(c*10)/10]);
      render();list();};
    r.append(md,sq); ed.append(r);
    const r2=document.createElement('div'); r2.className='row'; r2.style.marginTop='5px';
    r2.append(ft); ed.append(r2); d.append(ed);
    B.append(d);
  }
  boxes.forEach(b=>{
    const d=document.createElement('div');
    d.className='card'+(b.on?'':' off')+(selBox===b.id?' sel':'');
    d.style.setProperty('--dot','#5A6678');
    const h=document.createElement('div'); h.className='head';
    h.innerHTML=`<div class="b"><div class="id">${b.id}</div><div class="nm">${b.name}</div>
      <div class="mt">${b.x0},${b.y0} → ${b.x1},${b.y1}<br>${
        isFlat(b)?`base ${b.zb[0]} ft · top ${b.zt[0]} ft`
        :`sloped ${zmin(b)}–${zmax(b)} ft`}</div></div>`;
    const eye=document.createElement('button'); eye.className='eye';
    eye.textContent=b.on?'●':'○';
    eye.onclick=ev=>{ev.stopPropagation();b.on=!b.on;render();list();};
    h.append(eye);
    h.onclick=()=>{selBox=selBox===b.id?null:b.id;sel=null;render();list();};
    d.append(h);
    const ed=document.createElement('div'); ed.className='edit';
    const nm=document.createElement('div'); nm.className='fld';
    const nl=document.createElement('label'); nl.textContent='name';
    const ni=document.createElement('input'); ni.className='t'; ni.value=b.name;
    ni.oninput=()=>{b.name=ni.value;$('code').value=encode();};
    nm.append(nl,ni); ed.append(nm);
    // edge heights: each field moves the two corners on that edge together
    const eLbl={N:'N edge',E:'E edge',S:'S edge',W:'W edge'};
    [['zt','top'],['zb','base']].forEach(([key,word])=>{
      EDGES.forEach(edg=>{
        const cur=(b[key][edg.c[0]]+b[key][edg.c[1]])/2;
        ed.append(numFld(word+' '+edg.k,Math.round(cur*100)/100,v=>{
          edg.c.forEach(i=>b[key][i]=v);
          if(key==='zt')b.zt=b.zt.map((z,i)=>Math.max(z,b.zb[i]+.15));
          else b.zb=b.zb.map((z,i)=>Math.min(z,b.zt[i]-.15));
        },0.25));
      });
    });
    const r1=document.createElement('div'); r1.className='row'; r1.style.marginTop='4px';
    const fl=document.createElement('button'); fl.className='act'; fl.textContent='Level';
    fl.onclick=()=>{const m=Math.max(...b.zt),n=Math.min(...b.zb);
      b.zt=[m,m,m,m];b.zb=[n,n,n,n];render();list();};
    const sl=document.createElement('button'); fl.style.flex='1';
    sl.className='act'; sl.textContent='Slab base';
    sl.title='Set the base parallel to the top';
    sl.onclick=()=>{const th=Math.max(0.25,b.zt[0]-b.zb[0]);
      b.zb=b.zt.map(v=>Math.round((v-th)*100)/100);render();list();};
    r1.append(fl,sl); ed.append(r1);
    const rr=document.createElement('div'); rr.className='row';
    const del=document.createElement('button'); del.className='act danger'; del.textContent='Delete';
    del.onclick=()=>{boxes=boxes.filter(v=>v!==b);selBox=null;render();list();};
    rr.append(del); ed.append(rr); d.append(ed);
    B.append(d);
  });
}
// how much of the nominal arc is actually usable
function lowVis(c){
  const L=lensOf(c), tz=parseFloat($('tz').value);
  let free=0,n=0;
  for(let o=-L.f/2;o<=L.f/2;o+=3){
    n++;
    const aa=rad(c.a+o);
    let any=false;
    for(let d=6;d<=L.r;d+=3){
      if(quality(c,c.x+d*Math.cos(aa),c.y+d*Math.sin(aa),tz)){any=true;break;}
    }
    if(any)free++;
  }
  const pct=Math.round(100*free/n);
  return pct<80?`only ${pct}% of its arc reaches anything`:'';
}

