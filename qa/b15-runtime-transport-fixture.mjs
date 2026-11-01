// Tiny HTTP/1 transport fixture, NOT the business router or QA/UAT evidence.
// Run in a disposable container with /ui/index.html from fixtureIndex below.
import http from 'node:http';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {baselineHtml,baselinePrefix,baselineId} from './b15-runtime-baseline-ui.mjs';
export const fixtureIndex=`<!doctype html><html><head><meta charset="utf-8"><title>Transport fixture only</title></head><body>
<h1>Transport fixture only — no product state or Worker</h1>
<button id="copy">Copy JSON fixture</button><output id="result"></output>
<script>document.querySelector('#copy').onclick=async()=>{
 try{const r=await fetch('/api/plans/fixture/copy',{method:'POST',headers:{'content-type':'application/json','x-aps-request':'workbench'},body:JSON.stringify({reason:'transport 中文',name:'isolated copy'})});
 document.querySelector('#result').textContent=JSON.stringify({status:r.status,reply:await r.json()});}
 catch(e){document.querySelector('#result').textContent=JSON.stringify({error:e.message});}
};</script></body></html>`;
const before=process.env.B15_BEFORE_UI?await import(pathToFileURL(process.env.B15_BEFORE_UI)):null;
const requests=[];
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture'),parts=[];
 let bytes=0;
 for await(const chunk of req){bytes+=chunk.length;if(bytes>128*1024){res.writeHead(413).end();return;}parts.push(chunk);}
 const body=Buffer.concat(parts).toString();
 if(url.pathname==='/__fixture/requests'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(requests));return;}
 requests.push({path:url.pathname,query:url.search,method:req.method,httpVersion:req.httpVersion,headers:req.headers,body});
 if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Access-Control-Allow-Headers','content-type,x-aps-request');}
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 if(url.pathname===baselinePrefix+'/role/planner'||url.pathname===baselinePrefix+'/role/query'){
  res.setHeader('Set-Cookie','b15Role='+url.pathname.split('/').at(-1)+'; HttpOnly; SameSite=Lax; Path=/');
  res.writeHead(302,{Location:baselinePrefix+'/ui'+url.search}).end();return;
 }
 if(url.pathname===baselinePrefix+'/ui'||url.pathname==='/main-guard'){
  res.setHeader('Content-Type','text/html');res.end((before&&url.searchParams.get('version')==='before'?before.baselineHtml:baselineHtml)());return;
 }
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(fixtureIndex);return;}
 let status=200;
 if(url.pathname.startsWith(baselinePrefix+'/api/')){
  if(req.headers['x-b15-simulation']!==baselineId)status=400;
  else if(req.method==='POST'&&!/(?:^|;\s*)b15Role=planner(?:;|$)/.test(req.headers.cookie||''))status=403;
 }
 if(url.pathname.startsWith('/api/')&&!['GET','HEAD'].includes(req.method))status=405;
 res.writeHead(status,{'Content-Type':'application/json'});
 res.end(JSON.stringify({path:url.pathname,query:url.search,method:req.method,headers:req.headers,body,httpVersion:req.httpVersion}));
});
if(process.env.B15_TRANSPORT_FIXTURE==='1'){
 if(process.env.WRITE_FIXTURE_INDEX==='1'){fs.mkdirSync('/ui',{recursive:true});fs.writeFileSync('/ui/index.html',fixtureIndex);}
 server.listen(Number(process.env.PORT||4317),'0.0.0.0',()=>console.log(JSON.stringify({fixture:true,port:server.address().port,pid:process.pid,rss:process.memoryUsage().rss})));
 const stop=()=>server.close(()=>process.exit());process.on('SIGTERM',stop);process.on('SIGINT',stop);
 // Fixture cannot outlive an interrupted verification indefinitely.
 setTimeout(stop,180000).unref();
}
