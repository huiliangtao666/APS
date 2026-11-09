import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const oomStart=fs.readFileSync('/sys/fs/cgroup/memory.events','utf8');
const start=Date.now(),limit=115000,owned=new Map(),stages=[],samples=[];let stopped=false,child=null;
const record=(kind,data)=>console.log(JSON.stringify({kind,at:new Date().toISOString(),...data}));
function proc(){const out=[];for(const name of fs.readdirSync('/proc'))if(/^\d+$/.test(name))try{const raw=fs.readFileSync('/proc/'+name+'/stat','utf8'),parts=raw.slice(raw.lastIndexOf(')')+2).split(' ');out.push({pid:Number(name),ppid:Number(parts[1]),started:parts[19],rss:Number(parts[21])*4096,command:fs.readFileSync('/proc/'+name+'/cmdline','utf8').replaceAll('\0',' ')});}catch{}return out;}
function killOwned(){const rows=proc();const pids=new Set([process.pid]);let changed=true;while(changed){changed=false;for(const r of rows)if(pids.has(r.ppid)&&!pids.has(r.pid)){pids.add(r.pid);changed=true;}}for(const r of rows.reverse())if(r.pid!==process.pid&&pids.has(r.pid))try{process.kill(r.pid,'SIGKILL');}catch{}}
function poll(){
 if(fs.readFileSync('/sys/fs/cgroup/memory.events','utf8')!==oomStart)stop('CGROUP_MEMORY_EVENT_CHANGE');
 const rows=proc(),pids=new Set([process.pid]);let changed=true;while(changed){changed=false;for(const r of rows)if(pids.has(r.ppid)&&!pids.has(r.pid)){pids.add(r.pid);changed=true;}}
 const exact=rows.filter(r=>pids.has(r.pid));for(const r of exact){const old=owned.get(r.pid);if(old&&old!==r.started)stop('PID_REUSED');owned.set(r.pid,r.started);}
 const total=exact.reduce((n,r)=>n+r.rss,0),available=Number(fs.readFileSync('/proc/meminfo','utf8').match(/MemAvailable:\s+(\d+)/)[1])*1024;
 samples.push({ms:Date.now()-start,total,available,pids:exact.map(r=>({pid:r.pid,ppid:r.ppid,started:r.started,rss:r.rss}))});
 if(exact.some(r=>r.rss>=512*1024**2)||total>=1024*1024**2||available<=256*1024**2||Date.now()-start>=limit)stop('RSS_CAPACITY_OR_TIME_STOP');
}
function stop(reason){if(stopped)return;stopped=true;record('STOP',{reason});killOwned();}
const timer=setInterval(poll,100);process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));
async function command(stage,args){if(stopped)throw Error('stopped');poll();const before=Date.now();record('stage-start',{stage,args});const code=await new Promise((resolve,reject)=>{child=spawn(args[0],args.slice(1),{stdio:'inherit',env:{...process.env,OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',MKL_NUM_THREADS:'1',UV_THREADPOOL_SIZE:'1',npm_config_jobs:'1'}});child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});stages.push({stage,seconds:(Date.now()-before)/1000,...code});if(code.code!==0||stopped)throw Error(stage+' failed '+JSON.stringify(code));}
try{
 poll();const self=proc().find(p=>p.pid===process.pid);if(!self||samples[0].pids.length<1||self.started!==owned.get(process.pid))throw Error('MONITOR_SELFTEST_FAILED');record('monitor-selftest',{status:'PASS',scope:'own container descendant PID/start/RSS/cgroup and capacity; host guard covers frozen source/protected files'});const first=samples[0];if(first.available<2*1024**3)throw Error('fresh capacity below2GiB');
 record('identity',{hostname:os.hostname(),pid:process.pid,proc:proc().find(p=>p.pid===process.pid),cgroup:fs.readFileSync('/proc/self/cgroup','utf8'),memoryMax:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),memoryEvents:fs.readFileSync('/sys/fs/cgroup/memory.events','utf8')});
 const pkg=JSON.parse(fs.readFileSync('package.json')),lock=JSON.parse(fs.readFileSync('package-lock.json'));fs.mkdirSync('.official-sdk');
 for(const name of ['lite-app-runtime','lite-app-server']){const from='/workspace/.praetor/sdk/'+name+'.tgz',buffer=fs.readFileSync(from),integrity='sha512-'+createHash('sha512').update(buffer).digest('base64');if(lock.packages['node_modules/@praetor/'+name].integrity!==integrity)throw Error('official SDK integrity mismatch');fs.writeFileSync('.official-sdk/'+name+'.tgz',buffer);const value='file:.official-sdk/'+name+'.tgz';pkg.dependencies['@praetor/'+name]=value;lock.packages[''].dependencies['@praetor/'+name]=value;lock.packages['node_modules/@praetor/'+name].resolved=value;record('official-sdk',{name,integrity,bytes:buffer.length});}
 fs.writeFileSync('package.json',JSON.stringify(pkg));fs.writeFileSync('package-lock.json',JSON.stringify(lock));
 await command('dependencies',['npm','ci','--no-audit','--no-fund']);
 await command('daily-domain-and-seams',['node','--test','qa/daily-domain.test.mjs','qa/daily-seams.test.mjs']);
 await command('standard-build',['npm','run','build']);
 await command('user-mainpath-HTTP',['node','qa/daily-user-http.mjs']);
 record('RESULT',{status:'PASS',stages});
}catch(e){record('RESULT',{status:'FAIL',message:e.message,stages});process.exitCode=1;}
finally{clearInterval(timer);killOwned();record('monitor',{seconds:(Date.now()-start)/1000,maxSingleRss:Math.max(...samples.flatMap(s=>s.pids.map(p=>p.rss))),maxOwnedRss:Math.max(...samples.map(s=>s.total)),minAvailable:Math.min(...samples.map(s=>s.available)),samples:samples.length,identities:[...owned].map(([pid,started])=>({pid,started})),stopped});}
