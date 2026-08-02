

const NS='http://www.w3.org/2000/svg';
const $=i=>document.getElementById(i);
const rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI;
const norm=a=>((a%360)+360)%360;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const el=(n,at={})=>{const e=document.createElementNS(NS,n);for(const k in at)e.setAttribute(k,at[k]);return e;};
const txt=(at,s)=>{const e=el('text',at);e.textContent=s;return e;};

// Frame shape comes from the sensor, which is a hard fact; the field of view
// fills it. Reolink quote 88x41.5 on a 16:9 sensor and 189x55 on 32:9, and
// neither pair reconciles with a rectilinear projection - 88 across 16:9 would
// need 69 vertical, not 41.5. These are wide lenses with barrel distortion, so
// the recorded image simply is not rectilinear. Modelling it as linear in
// bearing and tangent in elevation, stretched to the sensor, is closer to what
// they actually produce than pretending it is a pinhole.
// The render paths (POV, cones, frusta, 3D) ask a camera for its lens in the
// shape they have always used. That shape is now derived from the camera's
// catalog spec rather than looked up in a table of two: `r` in particular is
// no longer a constant but the DORI recognise distance for this sensor and
// field of view, clamped by what the camera can light at night.
const lensOf=c=>{
  const S=specOf(c);
  return {f:S.fovH, vf:S.fovV, r:detectFt(S), sensor:S.resW/S.resH,
          label:`${S.brand} ${S.model}`};
};
const PAL=['#E8A33D','#4FB3C4','#C97FA0','#93BF63','#B49BE0','#E0785C','#63BFA6','#D9C25E'];

