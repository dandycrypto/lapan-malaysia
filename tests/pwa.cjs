const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

// ---- The manifest is what a launcher reads ----
const manifest=JSON.parse(read('web/manifest.webmanifest'));
assert.equal(manifest.display,'standalone');
assert.equal(manifest.orientation,'portrait-primary','navigation holds one orientation');
assert.equal(manifest.start_url,'/');
assert.equal(manifest.theme_color,'#114b3e');
assert.equal(manifest.background_color,'#f7f8f3','the splash matches the app, not a dark rectangle');
const head=read('web/index.html');
assert.match(head,new RegExp('name="theme-color" content="'+manifest.theme_color+'"'),'manifest and page agree on the bar colour');
const maskable=manifest.icons.filter(i=>i.purpose==='maskable');
assert.equal(maskable.length,2,'Android needs a maskable icon or it letterboxes the launcher icon');
for(const icon of maskable){
  const png=fs.readFileSync(path.join(root,'web',icon.src.slice(1)));
  const size=icon.sizes.split('x').map(Number);
  assert.equal(png.readUInt32BE(16),size[0],icon.src+' width');
  assert.equal(png.readUInt32BE(20),size[1],icon.src+' height');
}
assert.equal(new Set(manifest.shortcuts.map(s=>s.url)).size,3,'three long-press shortcuts');
for(const s of manifest.shortcuts){assert.match(s.url,/\?action=(plan|locate|toll)$/);assert.ok(s.name.length)}

// ---- The page asks for an edge-to-edge shell ----
assert.match(head,/apple-mobile-web-app-status-bar-style" content="black-translucent"/,'iOS draws under the status bar');
assert.match(head,/name="mobile-web-app-capable"/);
assert.match(head,/rel="apple-touch-icon"/);
assert.match(head,/<div id="updateBanner"[^>]*class="hidden"/,'the update banner starts hidden');
assert.match(head,/id="updateReload"/);

// ---- The shell fills the screen and stops feeling like a page ----
const css=read('web/mobile.css');
assert.match(css,/@media \(display-mode:standalone\)/);
assert.match(css,/overscroll-behavior:none/,'no rubber-band bounce');
assert.match(css,/-webkit-tap-highlight-color:transparent/);
assert.match(css,/user-select:none/);
assert.match(css,/env\(safe-area-inset-top\)/);

// ---- A new worker waits for the driver, it does not swap mid-route ----
const sw=read('web/sw.js').replace('{{APP_VERSION}}','9.9.9').replace('__SHELL__','[]');
assert.ok(!/\.then\(\(\)=>self\.skipWaiting\(\)\)/.test(sw),'install no longer takes over by itself');
const swListeners={};
let skipped=0;
vm.runInNewContext(sw,{self:{location:{origin:'https://lapan.test'},addEventListener:(k,fn)=>swListeners[k]=fn,skipWaiting:()=>{skipped++},clients:{claim:()=>{}}},URL,Request:class{constructor(u,i={}){this.url=String(u);this.method=i.method||'GET';this.mode=i.mode||'cors'}},caches:{open:async()=>({add:async()=>{},put:async()=>{},match:async()=>undefined}),keys:async()=>[],delete:async()=>{}},fetch:async()=>{},setTimeout,clearTimeout,Promise,console,Error});
assert.ok(swListeners.message,'the worker listens for a promotion message');
swListeners.message({data:'SOMETHING_ELSE'});assert.equal(skipped,0,'other messages do nothing');
swListeners.message({data:'SKIP_WAITING'});assert.equal(skipped,1,'the driver can promote it');

// ---- The banner appears only when an update is waiting, and reloads on request ----
function loadUpdate(){const listeners={},elements={},posts=[];let reloads=0;
 const el=id=>elements[id]||(elements[id]={classList:{hidden:true,remove(){this.hidden=false},add(){this.hidden=true}},onclick:null});
 const ctx={document:{getElementById:el,addEventListener:()=>{}},location:{reload:()=>reloads++},
  navigator:{serviceWorker:{controller:{},addEventListener:(k,fn)=>listeners[k]=fn,register:async()=>({addEventListener:()=>{}}),getRegistration:async()=>null}},
  URLSearchParams,console};
 ctx.window=ctx;ctx.addEventListener=(k,fn)=>listeners[k]=fn;
 vm.runInNewContext(read('web/offline.js'),ctx);
 return {ctx,elements,listeners,posts,reloads:()=>reloads};
}
{
 const u=loadUpdate();
 assert.ok(u.ctx.LapanUpdate?.announce,'the update entry point exists');
 const banner=u.ctx.document.getElementById('updateBanner'),button=u.ctx.document.getElementById('updateReload');
 u.ctx.LapanUpdate.announce({waiting:null});
 assert.equal(banner.classList.hidden,true,'nothing to announce without a waiting worker');
 let posted=null;
 const reg={waiting:{postMessage:m=>posted=m}};
 u.ctx.LapanUpdate.announce(reg);
 assert.equal(banner.classList.hidden,false,'the banner is shown');
 button.onclick();
 assert.equal(posted,'SKIP_WAITING');
 assert.equal(u.reloads(),0,'nothing reloads until the worker changes');
 u.listeners.controllerchange();
 assert.equal(u.reloads(),1,'the page reloads once the new worker takes over');
}
{
 const u=loadUpdate();
 u.listeners.controllerchange();
 assert.equal(u.reloads(),0,'an unrequested take-over (first install) does not reload the page');
}
console.log('PASS: installable manifest with maskable icons and shortcuts, edge-to-edge shell, native scroll and selection behaviour, and an update that waits for the driver');
