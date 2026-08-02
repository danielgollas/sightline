/* ---------------- equipment catalog ---------------- */
/*
   Three sources, merged by id:

     1. the copy embedded in the project   - always present, always usable
     2. ./catalog/*.json                   - enrichment, fetched at runtime
     3. a file the user imported           - persisted in localStorage

   The fetch failing is an expected state, not an error. It always fails on
   file://, which is why a project carries its own copy: a saved scene is
   self-describing wherever it is opened.

   Where an id collides and any stat differs, BOTH entries are kept as
   variants tagged by source. Nothing is overwritten, so reopening an old plan
   never silently moves its coverage numbers or its cost. Byte-identical
   duplicates collapse.
*/

const CAT = (() => {

const store = { nvrs: [], cameras: [] };
let listeners = [];

// Identity for dedup: everything except bookkeeping. Two entries that differ
// in any spec are different equipment as far as this app is concerned.
//
// Key order must not matter, so this canonicalises recursively. The obvious
// JSON.stringify(e, keys) shortcut is wrong twice over: the replacer array
// applies to NESTED objects as well, so {resolution:{w,h}} silently loses w
// and h, and `key` has to be excluded or a stored entry never matches the
// incoming copy of itself.
const canon = v => Array.isArray(v) ? v.map(canon)
  : (v && typeof v === 'object')
    ? Object.keys(v).sort().reduce((o,k)=>{o[k]=canon(v[k]);return o;},{})
    : v;
const fingerprint = e => { const {source,key,...rest}=e; return JSON.stringify(canon(rest)); };

function add(kind, entries, source){
  if(!Array.isArray(entries))return;
  for(const raw of entries){
    if(!raw || !raw.id)continue;
    const e = {...raw, source};
    const fp = fingerprint(e);
    const list = store[kind];
    // identical entry already present (same id, same stats) - collapse
    if(list.some(x => x.id===e.id && fingerprint(x) === fp))continue;
    // same id, different stats - keep both, disambiguated by source
    const clash = list.filter(x => x.id===e.id);
    e.key = clash.length ? `${e.id}@${source}` : e.id;
    if(list.some(x=>x.key===e.key))continue;
    list.push(e);
  }
}

const all = kind => store[kind];
const byKey = (kind,key) => store[kind].find(e=>e.key===key||e.id===key);
const onChange = fn => { listeners.push(fn); };
const fire = () => listeners.forEach(fn=>fn());

function seedFromProject(snap){
  if(!snap)return;
  add('nvrs', snap.nvrs, 'project');
  add('cameras', snap.cameras, 'project');
  fire();
}
function addImported(doc){
  add('nvrs', doc.nvrs, 'imported');
  add('cameras', doc.cameras, 'imported');
  fire();
}
// Enrichment. Never surfaces an error: on file:// this always rejects.
async function fetchCatalog(){
  for(const [kind,file] of [['nvrs','nvrs.json'],['cameras','cameras.json']]){
    try{
      const r = await fetch('./catalog/'+file, {cache:'no-cache'});
      if(!r.ok)continue;
      const doc = await r.json();
      add(kind, doc[kind], 'catalog');
    }catch(e){ /* expected on file:// - the project's own copy stands in */ }
  }
  fire();
}
const isEmpty = () => !store.nvrs.length && !store.cameras.length;

return {all,byKey,add,seedFromProject,addImported,fetchCatalog,onChange,isEmpty};
})();

/* ---------------- pixel density and DORI ---------------- */
/*
   Range is derived, not typed in.

   The textbook density formula assumes a rectilinear lens:

       pxPerM(d) = resW / (2 * d * tan(h/2))

   That is WRONG for the cameras this app exists to model, and not marginally:
   at the Duo's 189 degrees, tan(94.5) is off to infinity and the formula
   hands back a detection range under a foot. These are wide lenses with
   barrel distortion - the app settled that when it moved the camera view to a
   cylindrical projection, linear in bearing, because a perspective divide
   cannot reach 180 degrees at all.

   Under a cylindrical projection pixels spread evenly across BEARING, so
   density is angular:

       px per radian = resW / fovH_radians
       pxPerM(d)     = resW / (fovH_radians * d)

   which stays finite and sensible right through 189 degrees, and matches the
   projection the renderer already uses. Using anything else here would put
   the numbers and the picture back into disagreement, which is the one thing
   this codebase refuses to do.

   EN 62676-4 (DORI) fixes what those densities are worth:
   detect 25, observe 62, recognise 125, identify 250 px per metre.

   This app keeps two tiers - the ones the UI has always shown - mapped onto
   recognise and identify. DORI's detect tier is deliberately unused: it
   reaches hundreds of feet, which is meaningless outdoors at night.
*/
const M_PER_FT = 0.3048;
const DORI = { recognise: 125, identify: 250 };

// Distance in feet at which this camera delivers `pxPerM` pixels per metre.
function distForDensity(spec, pxPerM){
  const h = rad(Math.max(spec.fovH, 1));
  const m = spec.resW / (h * pxPerM);
  return m / M_PER_FT;
}

// A camera's usable outer range, before DORI. Daylight uses an optional
// catalog cap; night uses whatever the camera can actually light up, and a
// camera with no IR and no floodlight sees nothing at night.
function rangeCap(spec){
  if(night()){
    const lit = Math.max(spec.irFt||0, spec.floodlightFt||0);
    return lit>0 ? lit : 0;
  }
  return spec.maxRangeFt || Infinity;
}
const identifyFt = spec => Math.min(distForDensity(spec, DORI.identify), rangeCap(spec));
const detectFt   = spec => Math.min(distForDensity(spec, DORI.recognise), rangeCap(spec));

// Resolve a placed camera to the spec the coverage model uses. A camera whose
// catalog entry has gone missing falls back to its embedded copy, so a scene
// never silently loses its geometry.
function specOf(c){
  if(c._spec)return c._spec;
  const e = c.catKey ? CAT.byKey('cameras', c.catKey) : null;
  const src = e || c.spec || {};
  const resW = (src.resolution&&src.resolution.w) || 1920;
  const resH = (src.resolution&&src.resolution.h) || 1080;
  const fovH = src.fovH || 90;
  // Not every manufacturer publishes a vertical figure. Falling back to the
  // sensor aspect is the least-wrong assumption and is flagged in the UI.
  const fovV = src.fovV || deg(2*Math.atan(Math.tan(rad(fovH/2))*resH/resW));
  const s = {resW,resH,fovH,fovV,
    irFt:src.irFt||0, floodlightFt:src.floodlightFt||0,
    maxRangeFt:src.maxRangeFt||0,
    ptz:!!src.ptz, poe:!!src.poe, wifi:!!src.wifi,
    formats:src.formats||['H.265'],
    brand:src.brand||'', model:src.model||'custom',
    fovVAssumed:!src.fovV};
  c._spec = s;
  return s;
}
const clearSpecCache = () => cams.forEach(c=>{ delete c._spec; });
