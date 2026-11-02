const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {create}=require(path.join(__dirname,'..','web','follow.js'));

function harness({permission='granted'}={}){
 let watchers=new Map(),nextId=1,cleared=[],views=[],pans=[],fixes=[],states=[],errors=[],docListeners={};
 const geo={
  watchPosition(ok,err){const id=nextId++;watchers.set(id,{ok,err});if(permission!=='granted')err({code:1,message:'denied'});return id},
  clearWatch(id){cleared.push(id);watchers.delete(id)},
  push(p){for(const [,w] of watchers)w.ok(p)}
 };
 const map={setView:(p,z)=>views.push([p,z]),panTo:(p,o)=>pans.push([p,o])};
 const doc={visibilityState:'visible',addEventListener:(k,fn)=>docListeners[k]=fn};
 const follow=create({geo,map,doc,onFix:(p,at)=>fixes.push(at),onState:s=>states.push(s),onError:e=>errors.push(e)});
 const hide=()=>{doc.visibilityState='hidden';docListeners.visibilitychange()};
 const show=()=>{doc.visibilityState='visible';docListeners.visibilitychange()};
 return {follow,geo,map,views,pans,cleared,fixes,states,errors,hide,show,watchers:()=>watchers.size};
}

const at=(lat,lon,accuracy=10)=>({coords:{latitude:lat,longitude:lon,accuracy}});

(async()=>{
 // Nothing happens until the driver asks, and the first fix zooms in.
 let h=harness();
 assert.equal(h.follow.isFollowing(),false);
 assert.equal(h.follow.start(),true);
 assert.equal(h.follow.isFollowing(),true);
 assert.deepEqual(h.states,[true]);
 assert.equal(h.watchers(),1,'one watch for the whole follow, not one per fix');
 h.geo.push(at(3.139,101.6869));
 assert.equal(h.views.length,1,'the first fix centres the map');
 assert.equal(h.views[0][1],16.5,'and zooms in');
 assert.deepEqual(h.views[0][0],[3.139,101.6869]);

 // A real move pans; jitter under 6 m does not.
 h.geo.push(at(3.13905,101.6869));
 assert.equal(h.pans.length,0,'5 m of jitter does not shake the map');
 h.geo.push(at(3.1400,101.6869));
 assert.equal(h.pans.length,1,'100 m of movement does');
 assert.deepEqual(h.pans[0][0],[3.14,101.6869]);
 assert.equal(h.fixes.length,3,'the marker follows every fix, not only the pans');

 // A fix outside Malaysia is ignored rather than sending the map into the sea.
 h.geo.push(at(51.5,-0.12));
 assert.equal(h.fixes.length,3);

 // A hidden screen stops the GPS; coming back resumes the same intent.
 h.hide();
 assert.equal(h.cleared.length,1,'the watch is released while hidden');
 assert.equal(h.follow.isFollowing(),true,'the driver has not turned it off');
 assert.equal(h.watchers(),0);
 h.show();
 assert.equal(h.watchers(),1,'the watch comes back with the screen');

 // Tapping again stops it for good.
 h.follow.stop();
 assert.equal(h.follow.isFollowing(),false);
 assert.deepEqual(h.states,[true,false]);
 assert.equal(h.watchers(),0);
 const clearedAtStop=h.cleared.length;
 h.show();
 assert.equal(h.watchers(),0,'a stopped follow does not restart itself');
 assert.equal(h.cleared.length,clearedAtStop);

 // Without permission the app says so and never claims to be following.
 h=harness({permission:'denied'});
 h.follow.start();
 assert.equal(h.follow.isFollowing(),false);
 assert.equal(h.errors.length,1);
 assert.equal(h.errors[0].code,1);

 // A device with no geolocation is a clear no, not a crash.
 {const follow=create({geo:null,map:{},doc:{addEventListener(){}},onError:e=>assert.equal(e.code,0)});
  assert.equal(follow.start(),false);assert.equal(follow.isFollowing(),false)}

 // Starting twice does not open a second watch.
 h=harness();
 h.follow.start();h.follow.start();
 assert.equal(h.watchers(),1,'start is idempotent');
 console.log('PASS: live follow with no route, first-fix zoom, jitter-free panning, ignored off-map fixes, battery pause while hidden, a clean stop, denied permission and a missing GPS');
})().catch(e=>{console.error(e);process.exit(1)});
