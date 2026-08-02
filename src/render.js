/* ---------------- render ---------------- */
let coarse=false;
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
    splat=(!playing&&splatOn())?buildSplat():null;
    frusta=(!playing&&frusOn())?buildFrusta():null;
    draw3d(); }
  if(!playing){
    const code=$('code');            // only present when Project is selected
    if(code)code.value=encode();
    updateStats();
    autosave();
  }
}
