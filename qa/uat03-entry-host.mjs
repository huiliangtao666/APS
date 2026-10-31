// QA-only wrapper; never imported by product routes. No product source edits.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {createHash} from 'node:crypto';
import {b2Host} from './b2-host.mjs';import {configuredOriginalBatch} from './b231-fixture.mjs';
const SHA='833b3d56929f88c9521cb64765066eece9f83879',hash=b=>createHash('sha256').update(b).digest('hex');
if(process.env.UAT03_ISOLATED!=='1'||process.env.NODE_ENV==='production')throw Error('Explicit disposable QA host required');
const manifest=JSON.parse(fs.readFileSync(process.env.UAT03_SOURCE_MANIFEST,'utf8'));if(manifest.productSha!==SHA)throw Error('Source SHA mismatch');
for(const [f,h]of Object.entries(manifest.files))if(hash(fs.readFileSync(f))!==h)throw Error('Fixed source mismatch: '+f);
const harness=JSON.parse(fs.readFileSync(process.env.UAT03_HARNESS_VERSION||'/uat03/harness-version.json','utf8'));for(const [f,h]of Object.entries(harness.files))if(hash(fs.readFileSync(f))!==h)throw Error('QA harness mismatch: '+f);
const dir=process.env.UAT03_DATA_DIR,fixtureDir=process.env.UAT03_FIXTURE_DIR;fs.mkdirSync(fixtureDir,{recursive:true});
const b=configuredOriginalBatch('03');fs.writeFileSync(path.join(fixtureDir,'CONFIG.json'),JSON.stringify({...b,files:undefined,manifest:undefined,originals:undefined},null,2));
for(const f of b.files)fs.writeFileSync(path.join(fixtureDir,f.name),f.text);
const f=await b2Host({dir,browser:true}),walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
const build=Object.fromEntries(walk(path.join(dir,'dist')).map(p=>[path.relative(path.join(dir,'dist'),p),hash(fs.readFileSync(p))]));
const fixtureHashes=Object.fromEntries(walk(fixtureDir).map(p=>[path.basename(p),hash(fs.readFileSync(p))]));
const fingerprint=()=>{const s=fs.existsSync(path.join(dir,'business.json'))?JSON.parse(fs.readFileSync(path.join(dir,'business.json'),'utf8')):null;return {productSha:SHA,sourceFileCount:Object.keys(manifest.files).length,sourceManifestSha256:hash(JSON.stringify(manifest)),qaHarnessSha:harness.commit,qaHarnessFiles:harness.files,identity:'synthetic planner/supervisor/query; no customer SSO',scenario:'UAT-03 only; explicit replaceable simulation, no UAT verdict',node:process.version,pid:process.pid,build,buildFingerprint:hash(JSON.stringify(build)),fixtureHashes,fixtureFingerprint:hash(JSON.stringify(fixtureHashes)),revision:s?.revision??0,inputVersionId:s?.inputVersionId??null,dataFingerprint:s?hash(JSON.stringify(s.data)):null,configFingerprint:s?hash(JSON.stringify(Object.fromEntries(['resourceMappings','resourceClaims','tools','rules','calendars','downtime','dependencies','orders'].map(k=>[k,s.data[k]])))):null};};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://qa');
 if(url.pathname==='/api/uat03-build'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fingerprint()));return;}
 if(url.pathname.startsWith('/qa-role/')){const role=url.pathname.slice(9);if(!['planner','supervisor','query'].includes(role))throw Error('Unknown synthetic role');res.writeHead(302,{'Set-Cookie':'uat03-role='+role+'; Path=/; SameSite=Lax','Location':'/'});res.end();return;}
 if(url.pathname.startsWith('/fixtures/')){const name=decodeURIComponent(url.pathname.slice(10));if(path.basename(name)!==name)throw Error('Invalid file');const p=path.join(fixtureDir,name);if(!fs.existsSync(p)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.json')?'application/json':'text/csv; charset=utf-8');res.end(fs.readFileSync(p));return;}
 const role=req.headers['test-sub']||req.headers.cookie?.match(/uat03-role=(planner|supervisor|query)/)?.[1]||'planner';
 const headers={...req.headers,host:new URL(f.url).host,'test-sub':role};if(req.headers.origin==='http://'+req.headers.host)headers.origin=f.url;if(req.headers.referer?.startsWith('http://'+req.headers.host+'/'))headers.referer=f.url+new URL(req.headers.referer).pathname;
 const proxy=http.request(new URL(req.url,f.url),{method:req.method,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});proxy.on('error',e=>{res.writeHead(502);res.end(e.message);});req.pipe(proxy);
 }catch(e){res.writeHead(500);res.end(e.message);}});
server.listen(Number(process.env.UAT03_PORT||3000),'0.0.0.0',()=>{fs.writeFileSync(path.join(dir,'READY.json'),JSON.stringify(fingerprint(),null,2));console.log('UAT03_READY '+JSON.stringify(fingerprint()));});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{server.close();await f.close();process.exit(0);});
