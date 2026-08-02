/* ============================================================================
   Sightline WebGL renderer

   Replaces the SVG painter's-algorithm views with a real depth-buffered
   rasteriser. Two things this buys us:

     1. Correct visibility. The painter version overdrew the house wall in
        C1's view by 6x because a polygon that wraps behind the lens cannot
        be clipped and filled correctly in a cylindrical image. A z-buffer
        resolves it per fragment and the question disappears.

     2. Ambient occlusion instead of cast shadows. AO is baked per vertex on
        the CPU using the same ray engine the coverage model uses, so the
        shading cannot disagree with the occlusion maths.

   The Duo is rendered as two 90 degree perspective halves side by side,
   which is what the hardware actually does - two sensors stitched - and
   avoids the straight-lines-become-curves problem entirely.
   ========================================================================== */

const GL = (() => {

/* ---------- tiny matrix helpers ---------- */
const M4 = {
  ident:()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  mul(a,b){
    const o=new Array(16);
    for(let r=0;r<4;r++)for(let c=0;c<4;c++){
      let s=0; for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];
      o[c*4+r]=s;
    }
    return o;
  },
  perspective(fovyDeg,aspect,near,far){
    const f=1/Math.tan(fovyDeg*Math.PI/360), nf=1/(near-far);
    return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
  },
  // The scene is left-handed: x east, y south, z up, so x cross y points down.
  // A physically correct camera basis therefore has determinant -1 in these
  // coordinates. Build it explicitly - screen-right is world-up cross forward,
  // which puts south on your right when you face east - and let the caller
  // flip the winding order to match. Feeding these coordinates to a
  // conventional right-handed lookAt is what mirrored every view.
  lookAtLH(eye,at,worldUp){
    let f=[at[0]-eye[0],at[1]-eye[1],at[2]-eye[2]];
    let l=Math.hypot(...f)||1; f=f.map(v=>v/l);
    let r=[worldUp[1]*f[2]-worldUp[2]*f[1],
           worldUp[2]*f[0]-worldUp[0]*f[2],
           worldUp[0]*f[1]-worldUp[1]*f[0]];
    l=Math.hypot(...r)||1; r=r.map(v=>v/l);
    const u=[f[1]*r[2]-f[2]*r[1], f[2]*r[0]-f[0]*r[2], f[0]*r[1]-f[1]*r[0]];
    const n=f.map(v=>-v);                       // GL looks down -Z
    return [r[0],u[0],n[0],0, r[1],u[1],n[1],0, r[2],u[2],n[2],0,
      -(r[0]*eye[0]+r[1]*eye[1]+r[2]*eye[2]),
      -(u[0]*eye[0]+u[1]*eye[1]+u[2]*eye[2]),
      -(n[0]*eye[0]+n[1]*eye[1]+n[2]*eye[2]), 1];
  }
};

/* ---------- shaders ---------- */
const VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aAO;
uniform mat4 uMVP;
uniform mat4 uView;
uniform vec3 uSun;
uniform float uFlat;
// uCyl > 0 switches to a cylindrical camera, which is the only way to render
// past 180 degrees: a perspective divide diverges as the half-angle reaches 90.
uniform float uCyl;
uniform float uHalfH;   // radians
uniform float uHalfV;   // radians
uniform float uFar;
varying vec3 vCol;
varying float vFog;
varying vec4 vClip;
void main(){
  vec4 clip;
  if(uCyl > 0.5){
    vec4 vc = uView * vec4(aPos,1.0);
    float fwd = -vc.z;                       // GL looks down -Z
    float phi = atan(vc.x, fwd);             // -pi .. pi
    float r   = length(vec2(vc.x, vc.z));
    float h   = vc.y / max(r, 1e-4);
    float d   = length(vc.xyz);
    // Vertices outside the barrel wrap around the seam behind the camera and
    // would smear a triangle across the frame. Push them out of the clip
    // volume so the rasteriser trims the triangle instead.
    if(abs(phi) > uHalfH + 0.30){
      gl_Position = vec4(0.0,0.0,2.0,1.0);
      vCol = vec3(0.0); vFog = 0.0; vClip = vec4(0.0,0.0,2.0,1.0);
      return;
    }
    float nx = phi / uHalfH;
    float ny = h / tan(uHalfV);
    float nz = clamp(d / uFar, 0.0, 1.0) * 2.0 - 1.0;
    clip = vec4(nx, ny, nz, 1.0);
  } else {
    clip = uMVP * vec4(aPos,1.0);
  }
  gl_Position = clip;
  vClip = clip;
  float lam = max(dot(normalize(aNormal), uSun), 0.0);
  // sky bounce: surfaces facing up pick up a little blue, down a little warm
  float up = aNormal.z * 0.5 + 0.5;
  vec3 ambient = mix(vec3(0.30,0.29,0.27), vec3(0.44,0.50,0.60), up);
  vec3 lit = aColor * (ambient + vec3(0.95,0.92,0.84) * lam * 0.85);
  vCol = mix(lit * aAO, aColor, uFlat);
  float dist = (uCyl > 0.5) ? length((uView * vec4(aPos,1.0)).xyz) : clip.w;
  vFog = mix(clamp(dist / 260.0, 0.0, 0.55), 0.0, uFlat);
}`;

const FS = `
precision mediump float;
varying vec3 vCol;
varying float vFog;
void main(){
  vec3 haze = vec3(0.61,0.77,0.89);
  gl_FragColor = vec4(mix(vCol, haze, vFog), 1.0);
}`;

const SKY_VS = `
attribute vec2 aXY;
varying float vY;
void main(){ vY = aXY.y * 0.5 + 0.5; gl_Position = vec4(aXY,0.999,1.0); }`;

const SKY_FS = `
precision mediump float;
varying float vY;
uniform vec3 uTop;
uniform vec3 uBot;
void main(){ gl_FragColor = vec4(mix(uBot,uTop,vY),1.0); }`;

function compile(gl,type,src){
  const sh=gl.createShader(type);
  gl.shaderSource(sh,src); gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))
    throw new Error('shader: '+gl.getShaderInfoLog(sh));
  return sh;
}
function program(gl,vs,fs){
  const p=gl.createProgram();
  gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vs));
  gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))
    throw new Error('link: '+gl.getProgramInfoLog(p));
  return p;
}

/* ---------- context ---------- */
function makeCtx(canvas){
  const gl=canvas.getContext('webgl',
    {antialias:true,alpha:false,depth:true,preserveDrawingBuffer:true});
  if(!gl)return null;
  const ctx={gl,canvas};
  ctx.prog=program(gl,VS,FS);
  ctx.sky=program(gl,SKY_VS,SKY_FS);
  ctx.loc={
    aPos:gl.getAttribLocation(ctx.prog,'aPos'),
    aNormal:gl.getAttribLocation(ctx.prog,'aNormal'),
    aColor:gl.getAttribLocation(ctx.prog,'aColor'),
    aAO:gl.getAttribLocation(ctx.prog,'aAO'),
    uMVP:gl.getUniformLocation(ctx.prog,'uMVP'),
    uSun:gl.getUniformLocation(ctx.prog,'uSun'),
    uFlat:gl.getUniformLocation(ctx.prog,'uFlat'),
    uView:gl.getUniformLocation(ctx.prog,'uView'),
    uCyl:gl.getUniformLocation(ctx.prog,'uCyl'),
    uHalfH:gl.getUniformLocation(ctx.prog,'uHalfH'),
    uHalfV:gl.getUniformLocation(ctx.prog,'uHalfV'),
    uFar:gl.getUniformLocation(ctx.prog,'uFar'),
    skyXY:gl.getAttribLocation(ctx.sky,'aXY'),
    skyTop:gl.getUniformLocation(ctx.sky,'uTop'),
    skyBot:gl.getUniformLocation(ctx.sky,'uBot')
  };
  ctx.buf={pos:gl.createBuffer(),nrm:gl.createBuffer(),col:gl.createBuffer(),
           ao:gl.createBuffer(),skyQuad:gl.createBuffer()};
  gl.bindBuffer(gl.ARRAY_BUFFER,ctx.buf.skyQuad);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]),gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CW);
  ctx.count=0;
  return ctx;
}

function upload(ctx,mesh){
  const {gl,buf}=ctx;
  const put=(b,arr)=>{gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.STATIC_DRAW);};
  put(buf.pos,mesh.pos); put(buf.nrm,mesh.nrm);
  put(buf.col,mesh.col); put(buf.ao,mesh.ao);
  ctx.count=mesh.pos.length/3;
}

function drawScene(ctx,mvp,sun,skyTop,skyBot,vp,cyl){
  const {gl,loc,buf}=ctx;
  gl.viewport(vp[0],vp[1],vp[2],vp[3]);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(vp[0],vp[1],vp[2],vp[3]);

  // clear FIRST, with the depth mask open. glClear is gated by depthMask,
  // so clearing after depthMask(false) is a silent no-op and last frame's
  // depth survives - which is what smeared 3D and blacked out the second
  // half of each Duo.
  gl.depthMask(true);
  gl.clearColor(skyBot[0],skyBot[1],skyBot[2],1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

  gl.depthMask(false);
  gl.useProgram(ctx.sky);
  gl.bindBuffer(gl.ARRAY_BUFFER,buf.skyQuad);
  gl.enableVertexAttribArray(loc.skyXY);
  gl.vertexAttribPointer(loc.skyXY,2,gl.FLOAT,false,0,0);
  gl.uniform3fv(loc.skyTop,skyTop);
  gl.uniform3fv(loc.skyBot,skyBot);
  gl.drawArrays(gl.TRIANGLES,0,6);
  gl.disableVertexAttribArray(loc.skyXY);
  gl.depthMask(true);

  if(!ctx.count){gl.disable(gl.SCISSOR_TEST);return;}
  gl.useProgram(ctx.prog);
  const bind=(b,l,n)=>{gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l,n,gl.FLOAT,false,0,0);};
  bind(buf.pos,loc.aPos,3); bind(buf.nrm,loc.aNormal,3);
  bind(buf.col,loc.aColor,3); bind(buf.ao,loc.aAO,1);
  gl.uniformMatrix4fv(loc.uMVP,false,new Float32Array(mvp));
  gl.uniformMatrix4fv(loc.uView,false,new Float32Array(cyl?cyl.view:mvp));
  gl.uniform1f(loc.uCyl,cyl?1:0);
  gl.uniform1f(loc.uHalfH,cyl?cyl.halfH:1);
  gl.uniform1f(loc.uHalfV,cyl?cyl.halfV:1);
  gl.uniform1f(loc.uFar,cyl?cyl.far:600);
  gl.uniform3fv(loc.uSun,sun);
  gl.uniform1f(loc.uFlat,ctx.flat?1:0);
  gl.drawArrays(gl.TRIANGLES,0,ctx.count);
  gl.disable(gl.SCISSOR_TEST);
}

return {M4,makeCtx,upload,drawScene};
})();

