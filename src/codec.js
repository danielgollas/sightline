/* ---------------- code ---------------- */
function encode(){
  const L=['PLAN v3 · feet · x=east y=south · a=bearing (0=east,90=south) · z=mount height · t=down-tilt'];
  cams.forEach(c=>L.push(`CAM ${c.id} | ${c.on?'ON ':'OFF'} | ${(c.lens||'ptz').toUpperCase()} | x ${c.x} | y ${c.y} | z ${c.z} | a ${c.a} | t ${c.t} | ${c.name}`));
  cams.forEach(c=>{ if(c.tour&&c.tour.length)
    L.push(`TOUR ${c.id} | home ${c.hd||20} | `+c.tour.map(k=>`${k.a},${k.t},${k.d}`).join(' | ')); });
  L.push('PROP '+prop.map(v=>v.join(',')).join(' | '));
  L.push(`FENCE | ${fence.on?'ON':'OFF'} | h ${fence.h}`);
  boxes.forEach(b=>L.push(`BOX ${b.id} | ${b.on?'ON ':'OFF'} | x0 ${b.x0} | y0 ${b.y0} | x1 ${b.x1} | y1 ${b.y1} | base ${b.zb.join('/')} | top ${b.zt.join('/')} | ${b.name}`));
  return L.join('\n');
}
function decodeRaw(s){
  const C=[],B=[],TR=[]; let P=null;
  s.split('\n').forEach(ln=>{
    const p=ln.split('|').map(v=>v.trim());
    const g=t=>{const f=p.find(v=>v.startsWith(t+' ')); return f?parseFloat(f.slice(t.length+1)):NaN;};
    if(/^FENCE/i.test(p[0])){
      const hh=p.find(v=>/^h /i.test(v));
      fence={on:!/OFF/i.test(ln),h:hh?parseFloat(hh.slice(2)):8};
      return;
    }
    if(/^PROP/i.test(p[0])){
      const raw=ln.replace(/^\s*PROP\s*/i,'').split('|');
      const v=raw.map(t=>t.trim().split(',').map(parseFloat))
                 .filter(a=>a.length===2&&!a.some(Number.isNaN));
      if(v.length>=3)P=v;
      return;
    }
    if(/^TOUR /i.test(p[0])){
      const id=p[0].slice(5).trim();
      const hm=p.find(v=>/^home /i.test(v));
      const kf=p.slice(1).filter(v=>/^-?[\d.]+\s*,/.test(v))
        .map(v=>v.split(',').map(parseFloat))
        .filter(a=>a.length===3&&!a.some(Number.isNaN))
        .map(([a,t,d])=>({a,t,d}));
      TR.push({id,hd:hm?parseFloat(hm.slice(5)):20,tour:kf});
      return;
    }
    if(/^CAM /i.test(p[0])){
      const o={id:p[0].slice(4).trim(),on:/^ON/i.test(p[1]),
        lens:/DUO/i.test(p[2])?'duo':'ptz',
        x:g('x'),y:g('y'),z:g('z'),a:g('a'),t:g('t'),
        name:p[p.length-1]||p[0],note:''};
      if(Number.isNaN(o.z))o.z=10.5; if(Number.isNaN(o.t))o.t=15;
      if(![o.x,o.y,o.a].some(Number.isNaN))C.push(o);
    } else if(/^BOX /i.test(p[0])){
      const quad=(tag,fb)=>{
        const f=p.find(v=>new RegExp('^'+tag+' ','i').test(v));
        if(f){const a=f.slice(tag.length+1).split('/').map(parseFloat);
          if(a.length===4&&!a.some(Number.isNaN))return a;
          if(a.length===1&&!Number.isNaN(a[0]))return [a[0],a[0],a[0],a[0]];}
        const n=g(fb); return Number.isNaN(n)?null:[n,n,n,n];
      };
      const zt=quad('top','z1'), zb=quad('base','z0');
      const o={id:p[0].slice(4).trim(),on:/^ON/i.test(p[1]),
        x0:g('x0'),y0:g('y0'),x1:g('x1'),y1:g('y1'),zb,zt,
        name:p[p.length-1]||p[0]};
      if(zt&&zb&&![o.x0,o.y0,o.x1,o.y1].some(Number.isNaN))B.push(o);
    }
  });
  TR.forEach(t=>{const c=C.find(v=>v.id===t.id); if(c){c.hd=t.hd;c.tour=t.tour;}});
  return {C,B,P};
}

const decode=decodeRaw;
