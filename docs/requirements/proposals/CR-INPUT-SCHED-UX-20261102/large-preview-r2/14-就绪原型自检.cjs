const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'12-A2就绪定位原型.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(script);
const elements=new Map();function el(id){if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,hidden:false,focus(){this.focused=true}});return elements.get(id)}
const context={document:{getElementById:el,addEventListener(){}},window:{}};vm.createContext(context);vm.runInContext(script,context);
const d=context.window.readinessDemo,checks=[];function check(n,f){f();checks.push(n)}
check('30 report identities;1/20/9 groups',()=>{assert.equal(d.issues.length,30);assert.equal(new Set(d.issues.map(x=>x.issue_key)).size,30);for(const [g,n] of [['G01',1],['G02',20],['G03',9]])assert.equal(d.issues.filter(r=>r.check_code===g).length,n)});
check('initial list bounded25',()=>assert.equal((el('list').innerHTML.match(/<tr>/g)||[]).length,25));
check('search SF020 across full report',()=>{d.S.q='SF020';assert.equal(d.matches().length,1);assert.equal(d.matches()[0].issue_key,'G02-SF020')});
check('SF target is production routes with exact material',()=>{d.openIssue('G02-SF020');assert(el('fields').innerHTML.includes('工艺路线'));assert(el('fields').innerHTML.includes('成品编号精确=SF020'));assert(el('fields').innerHTML.includes('A32:D32'));assert.equal(el('target').disabled,true)});
check('WP008 distinct raw facts and missing mapping',()=>{d.openIssue('G03-WP008');assert(el('fields').innerHTML.includes('A10:M10'));assert(el('fields').innerHTML.includes('EQ025'));assert(el('fields').innerHTML.includes('未提供mapping.wip_remaining'))});
check('G01 has no invented Excel row',()=>{d.openIssue('G01-LINE');assert(el('fields').innerHTML.includes('row=null'));assert(el('target').disabled)});
check('G03 unavailable real action stays disabled',()=>{d.openIssue('G03-MAPPING');assert(el('target').disabled);assert(el('fields').innerHTML.includes('待实现'))});
check('save demonstration invalidates;never passes real readiness',()=>{el('mockSave').onclick();assert.equal(d.S.version,3);assert(el('state').textContent.includes('旧检查过期'));assert(el('state').textContent.includes('没有发起检查'));assert.equal(d.issues.length,30);assert.equal(d.S.q,'SF020')});
check('cancel retains version and original selection',()=>{el('cancel').onclick();assert.equal(d.S.version,3);assert.equal(d.S.selected,'SO-SCOPE-DEMO')});
check('10 page boundary and G03 filter',()=>{d.S.q='';d.S.group='G02';d.S.size=10;d.S.page=1;d.render();assert.equal((el('list').innerHTML.match(/<tr>/g)||[]).length,10);assert(el('next').disabled);d.S.group='G03';d.S.page=0;d.render();assert.equal(d.matches().length,9)});
check('no product network, writes, or fake URLs',()=>{assert(!/\b(fetch|XMLHttpRequest|localStorage|sessionStorage)\b/.test(script));assert(!/href=["'](?:https?:|\/api\/)/.test(html))});
console.log(JSON.stringify({scope:'OFFLINE_DESIGN_DOM_STUB_ONLY',checks:checks.length,passed:checks,syntax:'PASS',realBrowser:'NOT_EXECUTED',realProduct:'NOT_EXECUTED',performance:'NOT_EXECUTED',UAT:'NOT_EXECUTED'},null,2));
