/* ---------------- render ---------------- */
let coarse=false;
// What the 3D ray-cast overlays depend on. `playing` is in here because the PT
// animation deliberately drops them, and `sel` because both are filtered to
// the selected camera.
let _overlayKey='';
function overlayKey(){
  return [sceneKey(),
          cams.map(c=>`${c.on?1:0}${c.x},${c.y},${c.z},${c.a},${c.t}`).join(';'),
          opts.occ?1:0, opts.night?1:0, opts.tour?1:0,
          splatOn()?1:0, frusOn()?1:0, sel||'', playing?1:0, targetZ()].join('|');
}
function render(){
  // Transform matrices cache against this, so they are stale for at most one
  // frame and never need invalidating by hand on an edit.
  sceneGen++;
  T=fit();
  if(mode!=='3d')$('gl3d').style.display='none';
  if(mode==='pov'){
    cov.style.display='none'; svg.style.display='none'; v3.style.display='none';
    renderPOV();
  }
  else if(mode==='split'){
    const heat=drawMode()==='heat';
    cov.style.display=heat?'':'none'; svg.style.display=''; v3.style.display='none';
    if(heat)paintCoverage(coarse);
    drawPlan();
    renderPOV();
  }
  else if(mode==='2d'){
    const heat=drawMode()==='heat';
    cov.style.display=heat?'':'none'; svg.style.display=''; v3.style.display='none';
    if(heat)paintCoverage(coarse);
    drawPlan(); }
  else if(mode==='3d'){ cov.style.display='none'; svg.style.display='none';
    $('gl3d').style.display=''; v3.style.display='';
    GLON=render3DGL();
    // Frustum solids and splatter are ray-cast, not drawn: measured at ~30 ms
    // and ~100 ms respectively, which every property edit was paying. They
    // depend only on the geometry, the camera poses and the coverage options,
    // so cache them on exactly that.
    const k3=overlayKey();
    if(k3!==_overlayKey){
      splat=(!playing&&splatOn())?buildSplat():null;
      frusta=(!playing&&frusOn())?buildFrusta():null;
      _overlayKey=k3;
    }
    draw3d(); }
  if(!playing){
    const code=$('code');            // only present when Project is selected
    if(code)code.value=encode();
    updateStats();
    autosave();
  }
}
