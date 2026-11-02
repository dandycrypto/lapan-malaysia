const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web','vehicle.js'),'utf8');

function load(store=new Map()){
 const ctx={document:{getElementById:()=>null,addEventListener(){}},
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)},
  console};
 ctx.window=ctx;
 vm.runInNewContext(source,ctx);
 return {vehicle:ctx.LapanVehicle,store};
}

// The arrow stays the default for a phone that has never chosen.
const {vehicle,store}=load();
assert.equal(vehicle.current(),'arrow');
assert.equal(vehicle.ids.join(','),'arrow,car,motorcycle,van,lorry');

// A choice survives a restart of the app.
assert.equal(vehicle.set('car'),'car');
assert.equal(vehicle.current(),'car');
assert.equal(store.get('lapan-vehicle'),'car');
assert.equal(load(store).vehicle.current(),'car','a new page reads the same choice');

// Every shape is a real drawing, with a human name.
for(const id of vehicle.ids){
 const markup=vehicle.svg(id);
 assert.match(markup,/^<svg viewBox="0 0 40 40"/,id+' has a 40 unit box');
 assert.match(markup,/<\/svg>$/);
 assert.match(markup,/<(path|circle)/,id+' draws something');
 assert.ok(vehicle.labels[id],id+' has a human label');
}
assert.equal(vehicle.html('motorcycle'),'<span class="vehicle-shape">'+vehicle.svg('motorcycle')+'</span>');

// A hand-edited or older value never breaks the map.
assert.equal(vehicle.set('spaceship'),'car','an unknown choice is refused');
assert.equal(vehicle.svg('spaceship'),vehicle.svg('arrow'),'an unknown shape falls back to the arrow');
assert.equal(load(new Map([['lapan-vehicle','hovercraft']])).vehicle.current(),'arrow','a stored value that is not a shape reads as the default');

// Changing the icon tells the maps to redraw.
const seen=[];
vehicle.onChange(id=>seen.push(id));
vehicle.set('van');
vehicle.set('van');
assert.deepEqual(seen,['van','van'],'every set notifies, so a redraw never needs a page reload');

// A store that refuses to write still works for this session.
{const blind=new Map();
 const ctx={document:{getElementById:()=>null},localStorage:{getItem:()=>null,setItem(){throw Error('quota')}},console};
 ctx.window=ctx;vm.runInNewContext(source,ctx);
 assert.equal(ctx.LapanVehicle.current(),'arrow');
 assert.equal(ctx.LapanVehicle.set('lorry'),'lorry','the choice applies even when it cannot be saved');
 assert.match(ctx.LapanVehicle.svg(),/lorry|M11 4h10v18H11z/,'and the map draws it');
}
console.log('PASS: five vehicle shapes, a choice that survives restart, human labels, unknown values refused, maps told to redraw, and a store that cannot write');
