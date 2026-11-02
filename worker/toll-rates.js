// Toll price for a planned route from published rates (worker/toll-rates.json, Class 1 car).
// TomTom's toll sections say where the route is on toll road; the rate data says what each plaza charges.
// A price is shown as an estimate only when every toll section has at least one priced plaza. Otherwise it is a "at least" subtotal.
const rateTolerance=250,rateWindow=300;
const rateXY=(p,o)=>[(p[0]-o[0])*111195*Math.cos(o[1]*Math.PI/180),(p[1]-o[1])*111195];
function rateRoute(route){
 const points=(route.legs||[]).flatMap(l=>(l.points||[]).map(p=>[p.longitude,p.latitude]));
 if(points.length<2||points.length>100000||!points.every(p=>p.every(Number.isFinite)))return null;
 const offsets=[0];for(let i=1;i<points.length;i++)offsets.push(offsets[i-1]+Math.hypot(...rateXY(points[i],points[i-1])));
 const raw=(route.sections||[]).filter(s=>s.sectionType==='TOLL'&&Number.isInteger(s.startPointIndex)&&Number.isInteger(s.endPointIndex)&&s.startPointIndex>=0&&s.endPointIndex<points.length&&s.startPointIndex<s.endPointIndex).map(s=>({start:offsets[s.startPointIndex],end:offsets[s.endPointIndex]})).sort((a,b)=>a.start-b.start);
 const sections=[];for(const s of raw){const last=sections.at(-1);if(last&&s.start<=last.end+50)last.end=Math.max(last.end,s.end);else sections.push({...s})}
 return {points,offsets,sections};
}
// Nearest approach of a plaza to the route, only along stretches that are on or beside a toll section.
function rateNearest(r,point,tol=rateTolerance){
 let best=null;
 for(let i=0;i<r.points.length-1;i++){
  const a=r.points[i],b=r.points[i+1];
  if(Math.min(a[0],b[0])>point[0]+.004||Math.max(a[0],b[0])<point[0]-.004||Math.min(a[1],b[1])>point[1]+.004||Math.max(a[1],b[1])<point[1]-.004)continue;
  if(!r.sections.some(s=>r.offsets[i+1]>=s.start-rateWindow&&r.offsets[i]<=s.end+rateWindow))continue;
  const p=rateXY(a,point),q=rateXY(b,point),dx=q[0]-p[0],dy=q[1]-p[1],len2=dx*dx+dy*dy,t=len2?Math.max(0,Math.min(1,-(p[0]*dx+p[1]*dy)/len2)):0,d=Math.hypot(p[0]+t*dx,p[1]+t*dy);
  if(d<=tol&&(!best||d<best.distance))best={distance:d,offset:r.offsets[i]+t*Math.sqrt(len2)};
 }
 return best;
}
function priceSections(r,rates,skip){
 const out={sections:r.sections.length,items:[],unpriced:[],covered:new Array(r.sections.length).fill(false),offsets:r.offsets,route:r};
 if(!r.sections.length)return out;
 const sectionOf=offset=>r.sections.findIndex(s=>offset>=s.start-rateWindow&&offset<=s.end+rateWindow);
 for(const h of rates.highways){
  if(skip.has(h.id))continue;
  const price=new Map(h.rates.map(([i,j,v])=>[i+','+j,v])),hits=[];
  h.plazas.forEach((p,i)=>{if(p[1]==null)return;const near=rateNearest(r,[p[1],p[2]],r.synthetic?150:rateTolerance);if(near)hits.push({i,name:p[0],...near,section:sectionOf(near.offset)})});
  hits.sort((a,b)=>a.offset-b.offset);
  if(h.system==='closed'){
   // A ticket carries across the whole highway, so entry and exit are found over every toll section, not one section at a time.
   const seq=[];for(const x of hits)if(!seq.some(y=>y.i===x.i))seq.push(x);
   if(!seq.length)continue;
   let chosen=null;
   for(let a=0;a<seq.length-1&&!chosen;a++)for(let b=seq.length-1;b>a&&!chosen;b--){const v=price.get(seq[a].i+','+seq[b].i);if(v!=null)chosen={from:seq[a],to:seq[b],amount:v}}
   if(chosen){out.items.push({operator:h.short,label:chosen.from.name+' → '+chosen.to.name,amount:chosen.amount,source:'dataset',confidence:h.confidence,highway:h.id,offset:Math.round(chosen.from.offset)});
    r.sections.forEach((sec,s)=>{if(sec.end>=chosen.from.offset-rateWindow&&sec.start<=chosen.to.offset+rateWindow)out.covered[s]=true})}
   else out.unpriced.push({operator:h.short,label:seq.map(x=>x.name).join(' · '),highway:h.id,why:seq.length<2?'one plaza only':'no published pair'});
  }else{
   for(const x of hits){const v=price.get(x.i+','+x.i);
    if(v!=null){out.items.push({operator:h.short,label:x.name,amount:v,source:'dataset',confidence:h.confidence,highway:h.id,offset:Math.round(x.offset)});out.covered[x.section]=true}
    else out.unpriced.push({operator:h.short,label:x.name,highway:h.id,why:'no published fare'})}
  }
 }
 out.items.sort((a,b)=>a.offset-b.offset);
 return out;
}
export function estimateFromRates(route,rates,skip=new Set()){
 const r=rateRoute(route);return r?priceSections(r,rates,skip):null;
}
// A route from the basic (OSRM) provider carries no toll sections, so the whole
// polyline is the candidate stretch and the plazas decide which toll roads it uses.
export function estimateFromGeometry(route,rates,skip=new Set()){
 const r=rateRoute(route);if(!r)return null;
 if(!r.sections.length){r.sections=[{start:0,end:r.offsets.at(-1)}];r.synthetic=true}
 return priceSections(r,rates,skip);
}
const rateRound=n=>Math.round(n*100)/100;
// Combine the careful per-operator estimate (LDP, KESAS, PLUS pairs) with the rate data, never charging a highway twice.
export function mergeRateTolls(base,route,rates,fromGeometry=false){
 const skip=new Set();
 if(base.items.some(i=>i.operator==='LDP'&&Number.isFinite(i.amount)))skip.add('4');
 if(base.items.some(i=>i.operator==='KESAS'&&Number.isFinite(i.amount)))skip.add('2');
 if(base.items.some(i=>i.operator==='PLUS'&&Number.isFinite(i.amount)))skip.add('1');
 let extra;try{extra=(fromGeometry?estimateFromGeometry:estimateFromRates)(route,rates,skip)}catch{extra=null}
 if(!extra)return base;
 const result={...base,items:base.items.slice(),vehicleClass:1,rates:{builtAt:rates.builtAt}};
 if(!extra.route.sections.length||(extra.route.synthetic&&!extra.items.length&&!extra.unpriced.length)){
  // Nothing on the route is a toll road. Say so only when no mapped plaza sits on it either.
  result.status='none';result.amount=0;
  result.note=extra.route.synthetic?'No toll plaza sits on this route. Not every plaza is mapped.':'No toll roads were reported for this route. Not every plaza is mapped.';
  return result;
 }
 // A PLUS pair that could not be resolved is replaced by the dataset price when there is one.
 if(extra.items.some(i=>i.highway==='1'))result.items=result.items.filter(i=>!(i.operator==='PLUS'&&!Number.isFinite(i.amount)));
 result.items.push(...extra.items);result.items.sort((a,b)=>a.offset-b.offset);
 result.unpriced=extra.unpriced;
 const known=result.items.filter(i=>Number.isFinite(i.amount));
 const baseCovered=sec=>base.items.some(i=>Number.isFinite(i.amount)&&i.offset>=extra.route.sections[sec].start-1500&&i.offset<=extra.route.sections[sec].end+1500);
 // Slivers of toll road shorter than 300 m (ramp edges, map gaps) do not need a price of their own.
 const uncovered=extra.covered.filter((c,s)=>!c&&extra.route.sections[s].end-extra.route.sections[s].start>=300&&!baseCovered(s)).length;
 result.uncoveredSections=uncovered;
 result.missingOperators=[...new Set(result.items.filter(i=>!Number.isFinite(i.amount)).map(i=>i.operator))];
 result.amount=known.length?rateRound(known.reduce((s,i)=>s+i.amount,0)):null;
 if(!known.length)result.status='unavailable';
 else if(uncovered===0&&!extra.unpriced.length&&!result.missingOperators.length)result.status='estimate';
 else result.status='partial';
 const weakest=['official-api','official-page','official-form','official-image','secondary'];
 result.confidence=known.length?weakest[Math.max(...known.map(i=>Math.max(0,weakest.indexOf(i.confidence||'official-page'))))]:null;
 return result;
}

// The basic route is planned in the browser, so the app asks for its toll separately.
// Points are [longitude, latitude] in Malaysia, between 2 and 20,000 of them.
export function priceGeometryRequest(request,rates){return geometryResponse(request,rates)}
async function geometryResponse(request,rates){
 let body;try{body=await request.json()}catch{return Response.json({error:'Send the route points as JSON.'},{status:400})}
 const points=body?.points;
 if(!Array.isArray(points)||points.length<2||points.length>20000)return Response.json({error:'Send between 2 and 20000 route points.'},{status:400});
 if(!points.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>99&&p[0]<120&&p[1]>0.8&&p[1]<7.6))return Response.json({error:'Points must be [longitude, latitude] in Malaysia.'},{status:400});
 const route={legs:[{points:points.map(([longitude,latitude])=>({longitude,latitude}))}]};
 const result=mergeRateTolls({items:[],amount:null,missingOperators:[]},route,rates,true);
 return Response.json({tollEstimate:result});
}
