/* ---------------- presets ---------------- */
// Camera positions only. Swapping a preset keeps the structures and the
// recorder, and now also keeps whatever catalog entry each camera came from -
// a preset is a layout, not a shopping list.
const PRESET_LABEL={yours:'7 PTZ',duo2:'2 Duo + 4 E1',duo4:'4 Duo mid-wall'};
const PRESETS={
 yours:[['ptz',-1.2,11.3,8.5,185],['ptz',-0.4,1.5,10.5,143],['ptz',25.7,2.2,8,329],
        ['ptz',26,23.5,10.5,329],['ptz',1.7,25,10.5,48],['ptz',3.4,-0.6,11,316],['ptz',22.2,-0.8,11,224]],
 duo2 :[['duo',12.5,-1,11,270],['duo',12.5,26,11,90],['ptz',-6.5,11,8.5,126],
        ['ptz',33.5,3.5,8,312],['ptz',-1.5,-1.5,10.5,135],['ptz',26.5,26.5,10.5,309]],
 duo4 :[['duo',12.5,-1,11,270],['duo',26,12.5,11,0],['duo',12.5,26,11,90],['duo',-1,12.5,11,180]]
};
function applyPreset(k){
  const home=nvrs[0]?nvrs[0].id:null;
  cams=PRESETS[k].map(([lens,x,y,z,a],i)=>migrateCam(
    {id:'C'+(i+1),lens,x,y,z,a,t:15,name:LEGACY_SPEC[LEGACY_KEY[lens]].model,
     note:'',on:true,nvr:home}));
  select(null);
  toast('Cameras swapped — structures kept');
}
