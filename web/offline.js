(function(root){
if(!('serviceWorker' in navigator))return;
const $=id=>document.getElementById(id);
let asked=false;
function announce(reg){
 const banner=$('updateBanner'),button=$('updateReload');
 if(!banner||!button||!reg?.waiting)return;
 banner.classList.remove('hidden');
 button.onclick=()=>{asked=true;reg.waiting.postMessage('SKIP_WAITING')};
}
function watch(reg){
 if(reg.waiting&&navigator.serviceWorker.controller)announce(reg);
 reg.addEventListener('updatefound',()=>{
  const installing=reg.installing;if(!installing)return;
  installing.addEventListener('statechange',()=>{
   if(installing.state==='installed'&&navigator.serviceWorker.controller)announce(reg);
  });
 });
}
// The new worker takes over only when the driver asks it to, so a route in progress is never swapped underneath.
navigator.serviceWorker.addEventListener('controllerchange',()=>{if(asked)location.reload()});
window.addEventListener('load',()=>{
 navigator.serviceWorker.register('/sw.js').then(watch).catch(()=>{});
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')return;
  navigator.serviceWorker.getRegistration?.().then(reg=>reg?.update?.()).catch(()=>{});
 });
});
root.LapanUpdate={announce};
})(typeof window==='object'?window:globalThis);
