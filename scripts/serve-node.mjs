// Serves the built Worker (dist/server/index.js) on plain Node, for hosts without
// a Workers runtime. The Worker only uses standard Web APIs, so this is a thin
// adapter plus a D1-compatible shim over node:sqlite.
//
// Usage: node scripts/serve-node.mjs
//   PORT            listen port (default 8771)
//   TOMTOM_API_KEY  live routing key; without it /api/route returns 503
//   DB_PATH         SQLite file for visitor statistics (default ./data/analytics.db)

import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, mkdirSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const workerPath=join(root,'dist','worker.mjs');
if(!existsSync(workerPath))throw Error('dist/worker.mjs is missing. Run: npm run build && npm run build:node');
const worker=(await import(pathToFileURL(workerPath).href)).default;

const dbPath=process.env.DB_PATH||join(root,'data','analytics.db');
mkdirSync(dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL');
db.exec(readFileSync(join(root,'deploy','schema.sql'),'utf8'));

class Statement{
  constructor(sql,params=[]){this.sql=sql;this.params=params}
  bind(...params){return new Statement(this.sql,params)}
  async first(column){
    const row=db.prepare(this.sql).get(...this.params);
    if(!row)return null;
    return column?row[column]??null:row;
  }
  async run(){
    const r=db.prepare(this.sql).run(...this.params);
    return {success:true,results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};
  }
  async all(){
    const rows=db.prepare(this.sql).all(...this.params);
    return {success:true,results:rows,meta:{}};
  }
}

// D1 batch: run every statement in one transaction, keeping SELECT results
// addressable so callers can read them by index.
class D1{
  prepare(sql){return new Statement(sql)}
  async batch(statements){
    const out=[];
    db.exec('BEGIN');
    try{
      for(const s of statements){
        let rows=null;
        try{rows=db.prepare(s.sql).all(...s.params)}
        catch(e){if(!/does not return data/i.test(e.message))throw e}
        if(rows)out.push({success:true,results:rows,meta:{}});
        else{
          const r=db.prepare(s.sql).run(...s.params);
          out.push({success:true,results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}});
        }
      }
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e}
    return out;
  }
}

const env={DB:new D1(),TOMTOM_API_KEY:process.env.TOMTOM_API_KEY||''};
const ctx={waitUntil(){},passThroughOnException(){}};
const port=Number(process.env.PORT)||8771;
const readBody=req=>new Promise((resolve,reject)=>{
  const chunks=[];
  req.on('data',c=>chunks.push(c));
  req.on('end',()=>resolve(Buffer.concat(chunks)));
  req.on('error',reject);
});

const server=createServer(async(req,res)=>{
  try{
    const forwardedProto=req.headers['x-forwarded-proto'];
    const proto=typeof forwardedProto==='string'?forwardedProto.split(',')[0].trim():(req.socket.encrypted?'https':'http');
    const host=req.headers['x-forwarded-host']||req.headers.host||`127.0.0.1:${port}`;
    const headers=new Headers();
    for(const [name,value] of Object.entries(req.headers)){
      if(value===undefined)continue;
      if(Array.isArray(value))for(const v of value)headers.append(name,v);
      else headers.set(name,value);
    }
    const method=(req.method||'GET').toUpperCase();
    const body=method==='GET'||method==='HEAD'?undefined:await readBody(req);
    const request=new Request(`${proto}://${host}${req.url}`,{method,headers,body,redirect:'manual'});
    const response=await worker.fetch(request,env,ctx);
    res.statusCode=response.status;
    for(const [name,value] of response.headers){
      if(name.toLowerCase()==='set-cookie')continue;
      res.setHeader(name,value);
    }
    const cookies=response.headers.getSetCookie?.();
    if(cookies?.length)res.setHeader('Set-Cookie',cookies);
    if(!response.body||method==='HEAD'){res.end();return}
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){
    console.error('request failed',e);
    if(!res.headersSent){
      res.statusCode=500;
      res.setHeader('Content-Type','text/plain; charset=utf-8');
    }
    res.end('Internal error');
  }
});

server.listen(port,'127.0.0.1',()=>console.log(`lapan on :${port} db=${dbPath} tomtom=${env.TOMTOM_API_KEY?'configured':'missing'}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>{db.close();process.exit(0)})});
