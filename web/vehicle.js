(function(root){
// The shape that sits on the map at your position. One choice, kept on the device,
// used by the flat map and the 3D driving screen so they never disagree.
const KEY='lapan-vehicle';
const SHAPES={
 arrow:'<path d="M20 4 33 34 20 27 7 34Z" fill="#1783ee" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>',
 car:'<path d="M12 7h16a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V11a4 4 0 0 1 4-4Z" fill="#1783ee" stroke="#fff" stroke-width="3"/><path d="M9 17h22M9 27h22" stroke="#fff" stroke-width="2"/>',
 motorcycle:'<circle cx="11" cy="28" r="5.5" fill="none" stroke="#1783ee" stroke-width="4"/><circle cx="29" cy="28" r="5.5" fill="none" stroke="#1783ee" stroke-width="4"/><path d="M11 28l7-11h7l4 6" fill="none" stroke="#1783ee" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 17h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
 van:'<path d="M13 5h14a5 5 0 0 1 5 5v20a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5V10a5 5 0 0 1 5-5Z" fill="#1783ee" stroke="#fff" stroke-width="3"/><path d="M8 14h24M8 28h24" stroke="#fff" stroke-width="2"/>',
 lorry:'<path d="M11 4h10v18H11z" fill="#1783ee" stroke="#fff" stroke-width="3"/><path d="M22 12h5l6 6v4H22z" fill="#1783ee" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle cx="14" cy="30" r="3" fill="#fff"/><circle cx="29" cy="30" r="3" fill="#fff"/>'
};
const LABELS={arrow:'Arrow',car:'Car',motorcycle:'Motorcycle',van:'Van',lorry:'Lorry'};
const ids=Object.keys(SHAPES);
const doc=root.document;
const listeners=[];
let chosen=null,loaded=false;
function read(){
 if(!loaded){
  loaded=true;
  try{const v=root.localStorage?.getItem(KEY);chosen=ids.includes(v)?v:'arrow'}catch{chosen='arrow'}
 }
 return chosen;
}
function current(){return read()}
function svg(id=read()){
 return '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">'+(SHAPES[id]||SHAPES.arrow)+'</svg>';
}
function html(id=read()){return '<span class="vehicle-shape">'+svg(id)+'</span>'}
function set(id){
 if(!ids.includes(id))return current();
 chosen=id;loaded=true;
 try{root.localStorage?.setItem(KEY,id)}catch{}
 for(const fn of listeners){try{fn(id)}catch{}}
 return id;
}
function onChange(fn){if(typeof fn==='function')listeners.push(fn)}
function bind(){
 const select=doc?.getElementById?.('vehicleIcon');
 if(!select)return;
 select.value=read();
 select.onchange=()=>set(select.value);
}
if(doc){ if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',bind); else bind(); }
root.LapanVehicle={ids,labels:LABELS,current,set,svg,html,onChange};
if(typeof module==='object')module.exports={ids,labels:LABELS,current,set,svg,html,onChange};
})(typeof window==='object'?window:globalThis);
