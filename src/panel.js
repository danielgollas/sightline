/* ---------------- sidebar refresh ---------------- */
// list() has meant "redraw the side panel" since the first version, and every
// interaction path still calls it. It still means that; there is simply more
// panel now.
function list(){
  renderTree();
  renderProps();
  renderLayers();
}
// how much of the nominal arc is actually usable
function lowVis(c){
  const S=specOf(c), tz=targetZ();
  const far=detectFt(S);
  if(!(far>0))return 'no usable range in these lighting conditions';
  let free=0,n=0;
  for(let o=-S.fovH/2;o<=S.fovH/2;o+=3){
    n++;
    const aa=rad(c.a+o);
    let any=false;
    for(let d=6;d<=far;d+=3){
      if(quality(c,c.x+d*Math.cos(aa),c.y+d*Math.sin(aa),tz)){any=true;break;}
    }
    if(any)free++;
  }
  const p=Math.round(100*free/n);
  return p<80?`only ${p}% of its arc reaches anything`:'';
}
