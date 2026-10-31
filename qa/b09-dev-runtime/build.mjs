import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const root='/workspace/apps/app',require=createRequire(root+'/package.json'),hash=x=>createHash('sha256').update(x).digest('hex');
const {materialScenario,scenarioFiles}=await import(root+'/qa/b3-material-fixture.mjs');
const {parseInputCsvRecords}=await import(root+'/src/lib/input-csv.mjs');
const {defs}=await import(root+'/server/planner.ts');
const mapping=[];
for(const scene of ['UAT-09','UAT-10','UAT-11','AC10-25KG','EXPECTED-SUPPLY']){
 const original=scene==='UAT-10'?'UAT-10':scene==='UAT-11'?'UAT-11':'UAT-09';
 const data=materialScenario(scene==='EXPECTED-SUPPLY'?'UAT-05':original);
 const raw=fs.readFileSync('/fixtures/originals/'+original+'/09_物料BOM配置.csv','utf8'),records=parseInputCsvRecords(raw);
 data.originalBom=records.slice(1).filter(r=>r.cells.some(Boolean)).map(r=>Object.fromEntries(records[0].cells.map((f,i)=>[f,r.cells[i]??''])));
 if(scene==='AC10-25KG'){data.orders[0]['合格需求']='480';for(const r of data.inventory)if(r['物料编号']==='LEAN')r['账面数量']='0';Object.assign(data.inventory.find(r=>r['批次编号']==='B3-EARLY'),{'账面数量':'400','已占用数量':'100'});}
 const files=scenarioFiles(data).map(f=>f.name==='09_物料BOM配置.csv'?{...f,text:raw}:f);
 const dir='/fixtures/'+scene;fs.mkdirSync(dir,{recursive:true});for(const f of files)fs.writeFileSync(dir+'/'+f.name,f.text);
 const sourceMapping=files.map(f=>({file:f.name,sha256:hash(f.text),table:defs.find(d=>d.file===f.name)?.key,source:f.name==='09_物料BOM配置.csv'?'literal original09 bytes; NOT mapped to calculation':'explicit independent normalized simulation; not inferred original source values',physicalRows:parseInputCsvRecords(f.text).slice(1).map(r=>r.line)}));
 const profile={kind:'REPLACEABLE_EXPLICIT_SIMULATION_NOT_CUSTOMER_FACTS',revision:'B09-'+scene+'-r1',scenario:scene,productSha:process.env.UAT09_PRODUCT_SHA,
  formulas:'240 / 0.96 * 650 / 1000 = 162.5kg; early137.5-occupied37.5=100; late62.5 or62.4; exact deficit0 or0.1. AC10 variant480 /0.96*650/1000=325;400-100=300;deficit25.',
  choices:['Normalized products/materials/BOM/inventory/supply contract is an explicitly replaceable software simulation, not conversion of original09/13/14.','Original09 raw six columns remain literal, unmapped and independent of normalized BOM. Unknown units/yield/loss combinations WAIT_APPROVAL.','Tools2/staff2/windows[0,600),all enabled MACHINE/PRECEDENCE/CALENDAR/MOLD/LABOR/MATERIAL retained; no default MATERIAL off.','EXPECTED-SUPPLY exercises only affected material availability11:00 versus arrival10:00, not full UAT05 retest.','No DEC04/05/06 application implementation, global reservation, receipt confirmation, quality approval or physical deduction.'],sourceMapping,tables:data};
 fs.writeFileSync(dir+'/PROFILE.json',JSON.stringify(profile,null,2));fs.writeFileSync(dir+'/IMPORT-REQUEST.json',JSON.stringify({files,inputStage:'supported',revision:0},null,2));mapping.push({scene,sourceMapping});
}
fs.writeFileSync('/fixtures/SOURCE-RUNTIME-MAPPING.json',JSON.stringify(mapping,null,2));
const {build}=await import(root+'/node_modules/vite/dist/node/index.js'),react=(await import(require.resolve('@vitejs/plugin-react'))).default;
await build({configFile:false,root,base:'/',plugins:[react()],resolve:{alias:[{find:/^@praetor\/lite-app-runtime$/,replacement:root+'/qa/fr033-integration-runtime.mjs'}]},build:{outDir:'/b09-dist',emptyOutDir:true}});
const tree=dir=>Object.fromEntries(fs.readdirSync(dir,{recursive:true}).filter(f=>fs.statSync(path.join(dir,f)).isFile()).sort().map(f=>[f,hash(fs.readFileSync(path.join(dir,f)))]));
const manifest=JSON.parse(fs.readFileSync('/source-manifest.json'));for(const[f,h]of Object.entries(manifest.files))if(hash(fs.readFileSync(root+'/'+f))!==h)throw Error('source drift '+f);
fs.writeFileSync('/build-metadata.json',JSON.stringify({productSha:manifest.productSha,branch:manifest.branch,parent:manifest.parent,parents:manifest.parents,base:manifest.base,workBuild:manifest.workBuild,trackedFilesVerified:Object.keys(manifest.files).length,sourceManifestSha256:hash(fs.readFileSync('/source-manifest.json')),harnessFiles:tree('/harness'),buildFiles:tree('/b09-dist'),fixtureFiles:tree('/fixtures'),node:process.version,dependencies:Object.fromEntries(['express','react','react-dom','vite','typescript','esbuild'].map(n=>[n,require(n+'/package.json').version])),syntheticRuntimeAlias:'qa/fr033-integration-runtime.mjs',productSourceModified:false},null,2));
