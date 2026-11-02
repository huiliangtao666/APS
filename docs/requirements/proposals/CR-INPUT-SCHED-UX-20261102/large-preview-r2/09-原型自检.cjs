const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const html=fs.readFileSync(require('path').join(__dirname,'07-交互原型.html'),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(js);
const elements=new Map();let blob;
function element(id){if(!elements.has(id))elements.set(id,{id,value:({table:'',operation:'',size:'25',query:''})[id]||'',innerHTML:'',textContent:'',disabled:false,checked:false,isConnected:true,classList:{toggle(){}},querySelectorAll(){return []},addEventListener(){},showModal(){this.open=true},close(){this.open=false},focus(){document.activeElement=this},click(){}});return elements.get(id)}
const document={getElementById:element,activeElement:null,createElement(){return {click(){}}}};
const context={document,window:{},console,setTimeout,clearTimeout,Blob,TextEncoder,Uint8Array,crypto:crypto.webcrypto,URL:{createObjectURL(b){blob=b;return 'demo:blob'},revokeObjectURL(){}}};vm.createContext(context);vm.runInContext(js,context);
const d=context.window.demo,checks=[];function check(name,fn){fn();checks.push(name)}
(async()=>{
 await new Promise(r=>setTimeout(r,180));
 check('G1 record/field counts and op partition',()=>{const s=d.summary();assert.equal(s.recordChanges,1830);assert.equal(s.changedFieldCount,7320);assert.equal(s.insert,610);assert.equal(s.update,610);assert.equal(s.delete,610)});
 check('29 tables represented',()=>assert.equal(new Set(d.ids(false).map(i=>d.record(i).tableId)).size,29));
 check('initial list emits only25 record rows, no field values',()=>{assert.equal((element('records').innerHTML.match(/<tr>/g)||[]).length,25);assert(!element('records').innerHTML.includes('_before_'))});
 check('search sees non-first-page key',()=>{d.S.q='R-001500';assert.equal(d.ids().length,1);assert.equal(d.record(d.ids()[0]).key,'R-001500')});
 check('ALL query scope ignores filter',()=>assert.equal(d.ids(false).length,1830));
 check('field detail presence/null and source',()=>{assert.equal(d.fields(d.record(0))[0].beforePresence,'missing');assert.equal(d.fields(d.record(2))[0].afterPresence,'missing');assert.equal(d.fields(d.record(1))[0].cell,'B2')});
 check('G2 counts',()=>{d.S.n=7320;d.S.q='';assert.equal(d.summary().changedFieldCount,29280);assert.equal(d.summary().insert,2440)});
 check('parameter zero changes preserves4 reports2 locations1group',()=>{d.S.kind='parameter';d.resetPreview();assert.equal(d.summary().recordChanges,0);assert.equal(d.reports().length,4);assert.equal(new Set(d.reports().map(r=>r.locationId)).size,2);assert.equal(new Set(d.reports().map(r=>r.groupId)).size,1)});
 check('direct confirmation blocked despite matching fingerprint',()=>assert(d.checkCommit(d.binding()).startsWith('422')));
 check('source dialog retains duplicate report IDs',()=>{d.openSource(3429);assert(element('dialogBody').innerHTML.includes('CAL-1'));assert(element('dialogBody').innerHTML.includes('CAL-3'))});
 check('reupload creates new revision and leaves candidate unchanged',()=>{const rev=d.S.revision;d.S.fixed=true;d.resetPreview();assert(d.S.revision>rev);assert.equal(d.reports().length,0);assert.equal(d.S.parameter,'P1')});
 check('stale fingerprint rejected',()=>{const old=d.binding();d.resetPreview();assert(d.checkCommit(old).startsWith('409'))});
 check('expiry rejects confirmation',()=>{d.S.expired=true;assert(d.checkCommit(d.binding()).startsWith('410'));d.resetPreview()});
 check('target conflict rejects confirmation',()=>{d.S.current++;assert(d.checkCommit(d.binding()).startsWith('409'));d.resetPreview()});
 check('unavailable full list rejects confirmation',()=>{d.S.exportAvailable=false;assert(d.checkCommit(d.binding()).startsWith('503'));d.resetPreview()});
 check('candidate commit keeps effective business and parameters',()=>{const b=d.S.businessVersion,p=d.S.parameter;d.applyCommit();assert.equal(d.S.businessVersion,b);assert.equal(d.S.parameter,p)});
 check('new preview result is not prior commit',()=>{d.resetPreview();assert.equal(d.S.commitId,null)});
 check('adoption changes effective parameter and invalidates readiness',()=>{d.S.mode='dataset';d.resetPreview();d.applyCommit();assert.equal(d.S.parameter,'P2');assert(d.S.readyStale)});
 check('committed preview cannot be submitted again',()=>assert(d.checkCommit(d.binding()).includes('已提交')));
 d.S.kind='business';d.S.n=1830;d.S.q='R-001500';d.resetPreview();await d.download(false);let data=JSON.parse(await blob.text()),payload=JSON.parse(data.payload);
 check('ALL export complete1830 records7320fields',()=>{assert.equal(payload.records.length,1830);assert.equal(payload.records.reduce((n,r)=>n+r.fields.length,0),7320);assert.equal(data.manifest.scope,'ALL')});
 check('export bytes/SHA independently match',()=>{assert.equal(data.manifest.payloadBytes,Buffer.byteLength(data.payload));assert.equal(data.manifest.payloadSHA256,crypto.createHash('sha256').update(data.payload).digest('hex'))});
 await d.download(true);data=JSON.parse(await blob.text());payload=JSON.parse(data.payload);
 check('FILTERED export explicit1 record confirmation remainsALL',()=>{assert.equal(payload.records.length,1);assert.equal(payload.exportScope,'FILTERED');assert.equal(payload.confirmationScope,'ALL_CHANGES')});
 check('bypass button does not commit ready batch',()=>{element('direct').onclick();assert.equal(d.S.committed,false)});
 check('unknown commit can query original result',()=>{element('unknown').onclick();assert(d.S.unknown);const id=d.S.commitId;element('result').onclick();assert(!d.S.unknown);assert.equal(d.S.commitId,id)});
 const result={scope:'OFFLINE_PROTOTYPE_STUB_ONLY',checks:checks.length,passed:checks,syntax:'PASS',browserLayout:'NOT_EXECUTED',realAPI:'NOT_EXECUTED',productTests:'NOT_EXECUTED',performance:'NOT_EXECUTED',UAT:'NOT_EXECUTED'};fs.mkdirSync('temp/input-sched-large-preview',{recursive:true});fs.writeFileSync('temp/input-sched-large-preview/prototype-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1});
