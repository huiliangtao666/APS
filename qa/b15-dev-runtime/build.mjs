import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {b15DevScenario} from '../b15-dev-fixture.mjs';
import {scenarioFiles} from '../b3-material-fixture.mjs';
import {parseInputCsvRecords} from '../../src/lib/input-csv.mjs';
const root='/workspace/apps/app',hash=x=>createHash('sha256').update(x).digest('hex'),require=createRequire(root+'/package.json');
const manifest=JSON.parse(fs.readFileSync('/source-manifest.json'));
for(const [file,h]of Object.entries(manifest.files))if(hash(fs.readFileSync(root+'/'+file))!==h)throw Error('source drift '+file);
for(const id of ['15','17','18','18-changed']){
 const data=b15DevScenario(id.split('-')[0],id.endsWith('-changed'));
 const dir='/fixtures/UAT-'+id;fs.mkdirSync(dir,{recursive:true});const files=scenarioFiles(data);
 for(const file of files)fs.writeFileSync(dir+'/'+file.name,file.text);
 const sourceMapping=files.map(f=>({file:f.name,sha256:hash(f.text),physicalRows:parseInputCsvRecords(f.text).slice(1).map(r=>r.line),kind:'explicit normalized software mock CSV; not untouched original19'}));
 const original='/fixtures/originals/UAT-'+id.split('-')[0];
 const originalManifest=Object.fromEntries(fs.readdirSync(original).filter(f=>fs.statSync(original+'/'+f).isFile()).map(f=>{const b=fs.readFileSync(original+'/'+f);return [f,{bytes:b.length,sha256:hash(b)}];}));
 const choices=['All profile CSVs are explicit replaceable software mocks; original19 files are separately preserved byte-for-byte.','UAT15 historical N06 shared resource ledger is explicitly supplied, with original facts, quantities, source, adoption/release; group/pool1 to2 does not rewrite the ledger.','UAT17 fixed kg five-operation R4 model; heat120, full290 and delivery wait60; no shortened program or inferred original speed mapping.','UAT18 normalized BOM650 to700 per1000kg, yield0.96/order240; FAT150 to100 maintains total1000; continuous calendar60-480, fixed40 and tool G60 at130.','No new customer defaults, unknown original09 mapping, formal SSO, or QA verdict.'];
 fs.writeFileSync(dir+'/PROFILE.json',JSON.stringify({kind:'REPLACEABLE_EXPLICIT_SIMULATION_NOT_CUSTOMER_FACTS',productSha:manifest.productSha,scenario:'UAT-'+id,choices,sourceMapping,originalManifest,tables:data},null,2));
 fs.writeFileSync(dir+'/IMPORT-REQUEST.json',JSON.stringify({files,inputStage:'supported',revision:0},null,2));
}
const {build}=await import(root+'/node_modules/vite/dist/node/index.js'),react=(await import(require.resolve('@vitejs/plugin-react'))).default;
await build({configFile:false,root,base:'/',plugins:[react()],resolve:{alias:[{find:/^@praetor\/lite-app-runtime$/,replacement:root+'/qa/fr033-integration-runtime.mjs'}]},build:{outDir:'/b15-dist',emptyOutDir:true}});
const tree=dir=>Object.fromEntries(fs.readdirSync(dir,{recursive:true}).filter(f=>fs.statSync(path.join(dir,f)).isFile()).sort().map(f=>[f,hash(fs.readFileSync(path.join(dir,f)))]));
fs.writeFileSync('/b15-build-metadata.json',JSON.stringify({...manifest,files:undefined,sourceFilesVerified:Object.keys(manifest.files).length,sourceManifestSha256:hash(fs.readFileSync('/source-manifest.json')),buildFiles:tree('/b15-dist'),fixtureFiles:tree('/fixtures'),node:process.version,syntheticRuntimeAlias:'qa/fr033-integration-runtime.mjs',productSourceModified:false},null,2));
