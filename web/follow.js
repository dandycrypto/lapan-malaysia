(function(root){
// Follows the phone while the driver moves, with no route planned. One watch, one marker,
// and the map recentres only when the fix is far enough away to be real movement not jitter.
function create(options={}){
 const geo=options.geo||root.navigator?.geolocation,map=options.map,doc=options.doc||root.document;
 const zoom=Number.isFinite(options.zoom)?options.zoom:16.5,minMove=Number.isFinite(options.minMove)?options.minMove:6;
 const onFix=options.onFix||(()=>{}),onState=options.onState||(()=>{}),onError=options.onError||(()=>{});
 let watchId=null,wanted=false,last=null;
 const metres=(a,b)=>Math.hypot((b[1]-a[1])*Math.cos(b[0]*Math.PI/180),b[0]-a[0])*111320;
 function inMalaysia(x,y){return Number.isFinite(x)&&Number.isFinite(y)&&x>=99&&x<=120&&y>=.8&&y<=7.6}
 function paint(p){
  const y=p?.coords?.latitude,x=p?.coords?.longitude;
  if(!inMalaysia(x,y))return;
  const here=[y,x];
  if(!last)map?.setView?.(here,zoom);
  else if(metres(last,here)>=minMove)map?.panTo?.(here,{animate:true,duration:.4});
  last=here;onFix(p,here);
 }
 function attach(){
  if(watchId!=null||!wanted)return;
  if(!geo?.watchPosition){wanted=false;onState(false);onError({code:0,message:'Location is not available on this device.'});return}
  const id=geo.watchPosition(paint,e=>{onError(e);if(e?.code===1){wanted=false;detach();onState(false)}},{enableHighAccuracy:true,maximumAge:2000,timeout:15000});
  watchId=id;
  if(!wanted){geo?.clearWatch?.(id);watchId=null}
 }
 function detach(){if(watchId!=null){geo?.clearWatch?.(watchId);watchId=null}}
 function start(){
  if(wanted)return true;
  if(!geo?.watchPosition){onError({code:0,message:'Location is not available on this device.'});return false}
  wanted=true;last=null;attach();if(!wanted)return false;onState(true);return true;
 }
 function stop(){
  if(!wanted&&watchId==null)return;
  wanted=false;detach();last=null;onState(false);
 }
 // A hidden tab stops asking the GPS; it resumes on the same intent when the driver comes back.
 doc?.addEventListener?.('visibilitychange',()=>{if(doc.visibilityState==='hidden')detach();else attach()});
 return {start,stop,isFollowing:()=>wanted,recenter(){if(last)map?.setView?.(last,zoom)}};
}
root.LapanFollow={create};
if(typeof module==='object')module.exports={create};
})(typeof window==='object'?window:globalThis);
