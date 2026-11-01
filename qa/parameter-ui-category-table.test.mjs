// Offline InputData component checks. No DOM, HTTP, Worker, build or live state.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as runStatus from '../src/lib/workbook-run-status.mjs';

const schema=JSON.parse(fs.readFileSync(new URL('../server/workbook-schema.json',import.meta.url)));
const source=fs.readFileSync(process.env.CATEGORY_COMPONENT_SOURCE||new URL('../src/InputData.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal(compiled.diagnostics.length,0);
const element=(type,props)=>({type,props:props||{}});
function nodes(tree){
 if(Array.isArray(tree))return tree.flatMap(nodes);
 if(!tree||typeof tree!=='object')return [];
 return [tree,...nodes(tree.props?.children)];
}
function text(node){
 if(Array.isArray(node))return node.map(text).join('');
 if(node&&typeof node==='object')return text(node.props?.children);
 return node==null?'':String(node);
}

async function harness({canWrite=true,reason='offline test',failCopy=false}={}){
 let cursor=0,dirty=true,tree,effects=[],version=7;
 const slots=[],calls=[],drafts=[];
 const react={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{const next=typeof v==='function'?v(slots[i]):v;if(!Object.is(next,slots[i])){slots[i]=next;dirty=true;}}];},
  useRef(initial){const i=cursor++;return slots[i]??=( {current:initial} );},
  useEffect(fn,deps){const i=cursor++;const previous=slots[i];if(!previous||deps.some((v,n)=>!Object.is(v,previous[n]))){slots[i]=deps;effects.push(fn);}},
 };
 const module={exports:{}};
 const stubs=new Map();
 function require(name){
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return {jsx:element,jsxs:element,Fragment:'fragment'};
  if(name==='./lib/workbook-run-status.mjs')return runStatus;
  if(name.endsWith('.css'))return {};
  if(!stubs.has(name))stubs.set(name,new Proxy({}, {get:(_,key)=>String(key)}));
  return stubs.get(name);
 }
 vm.runInNewContext(compiled.outputText,{exports:module.exports,require,module},{timeout:1000});
 async function api(path,body){
  calls.push({path,body});
  if(path.endsWith('/draft')&&body){
   if(failCopy)throw Error('409 original conflict');
   version++;
   drafts.push({id:'DRAFT',quantity:200,sourceRun:'RUN',sourceVersion:7});
   return drafts[0];
  }
  if(path==='/workbooks/schema')return schema;
  if(path==='/workbooks/datasets')return [{id:'DATA',name:'offline',version}];
  if(path==='/workbooks/datasets/DATA')return {id:'DATA',version,readiness:{ready:true,supported:[],issues:[]}};
  if(path.endsWith('/drafts'))return [...drafts];
  if(path==='/workbooks/runs')return [{id:'RUN',datasetId:'DATA',version:7,status:'completed'}];
  if(path==='/workbooks/runs/RUN')return {id:'RUN',datasetId:'DATA',version:7,status:'completed'};
  if(path.includes('/rows?')){
   const params=new URLSearchParams(path.split('?')[1]);
   const table=params.get('table');
   const spec=schema.tables[table];
   return {rows:[{_row:1,[spec.fields[0].name]:table+'-row'}],total:60,bindings:[]};
  }
  throw Error('Unexpected offline API '+path);
 }
 function render(){cursor=0;dirty=false;tree=module.exports.InputData({api,canWrite,canExport:true,reason});}
 async function flush(){
  for(let i=0;i<30;i++){
   if(dirty)render();
   const pending=effects;effects=[];for(const effect of pending)effect();
   await Promise.resolve();await Promise.resolve();
  }
  assert.equal(dirty,false,'Offline component did not settle');
  assert.equal(effects.length,0);
 }
 const all=()=>nodes(tree);
 const find=predicate=>{const found=all().find(predicate);assert.ok(found,'Expected component element');return found;};
 const label=name=>find(n=>n.props['aria-label']===name);
 const button=name=>find(n=>n.type==='button'&&text(n)===name);
 const result=()=>find(n=>n.type===module.exports.WorkbookResult);
 await flush();label('当前数据集').props.onChange({target:{value:'DATA'}});await flush();
 label('重开冻结运行').props.onChange({target:{value:'RUN'}});await flush();
 return {calls,label,button,result,all,flush,async copy(){await result().props.onDraft({id:'SUGGESTION',quantity:200});await flush();},async select(table){label('业务表').props.onChange({target:{value:table}});await flush();},lastRows(){return calls.filter(c=>c.path.includes('/rows?')).at(-1).path;}};
}

test('UI-CATEGORY-TABLE-01: copy from 每日需求 synchronizes category, select, columns, rows and clears filter/page',async()=>{
 const h=await harness();await h.select('每日需求');
 h.label('输入查询').props.onChange({target:{value:'OLD-DEMAND'}});await h.flush();
 h.button('下一页').props.onClick();await h.flush();assert.match(h.lastRows(),/offset=25/);
 await h.copy();
 assert.equal(h.label('业务表').props.value,'供应商与供货条件');
 assert.equal(h.button('补单').props.className,'chosen');
 assert.equal(h.label('输入查询').props.value,'');assert.equal(h.button('上一页').props.disabled,true);
 assert.equal(new URLSearchParams(h.lastRows().split('?')[1]).get('table'),'供应商与供货条件');
 assert.match(h.lastRows(),/&q=&offset=0&/);
 const heads=h.all().filter(n=>n.type==='th').map(text);
 assert.ok(heads.includes('供货关系编号'));assert.ok(!heads.includes('需求编号'));
 assert.ok(h.all().some(n=>n.type==='td'&&text(n)==='供应商与供货条件-row'));
 assert.ok(h.all().some(n=>n.type==='WorkbookDrafts'&&n.props.drafts[0]?.quantity===200));
 const writes=h.calls.filter(c=>c.body);
 assert.equal(writes.length,1);
 assert.equal(JSON.stringify(writes[0].body),JSON.stringify({expectedVersion:7,sourceRun:'RUN',suggestionId:'SUGGESTION',currentDay:1}));
 assert.equal(h.result().props.run.version,7);
});

test('copy uses the same table selection as manual category navigation from all four categories',async()=>{
 for(const category of ['需求','库存','生产','补单']){
  const h=await harness();h.button(category).props.onClick();await h.flush();
  if(category==='补单')await h.select('既有采购在途');
  await h.copy();assert.equal(h.label('业务表').props.value,'供应商与供货条件');
  h.button('库存').props.onClick();await h.flush();assert.equal(h.label('业务表').props.value,'物料主数据');
  h.button('补单').props.onClick();await h.flush();assert.equal(h.label('业务表').props.value,'供应商与供货条件');
 }
});

test('failed copy retains category, target table, search and pagination without a success message',async()=>{
 const h=await harness({failCopy:true});await h.select('每日需求');
 h.label('输入查询').props.onChange({target:{value:'KEEP'}});await h.flush();h.button('下一页').props.onClick();await h.flush();
 await h.copy();assert.equal(h.label('业务表').props.value,'每日需求');assert.equal(h.button('需求').props.className,'chosen');
 assert.equal(h.label('输入查询').props.value,'KEEP');assert.equal(h.button('上一页').props.disabled,false);
 assert.ok(h.all().some(n=>n.props.role==='status'&&text(n)==='409 original conflict'));
});

test('read-only and missing-reason props still disable actual copy buttons and issue no write',async()=>{
 for(const permission of [{canWrite:false},{reason:''}]){
  const h=await harness(permission);const props=h.result().props;assert.equal(props.canWrite,false);
  const result=props.run;
  const p={demandSummary:{records:0,totalKg:0,scheduled:0,unplanned:0},tasks:[],source:{},demandResults:[],shortages:[],allocations:[],suggestions:[{id:'SUGGESTION',quantity:200}],findings:[]};
  const rendered=h.result().type({...props,run:{...result,result:p}});
  const copy=nodes(rendered).find(n=>n.type==='button'&&text(n)==='复制为模拟草稿');
  assert.equal(copy.props.disabled,true);assert.equal(h.calls.filter(c=>c.body).length,0);
 }
});
