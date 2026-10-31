// Isolated engineering candidate only; never imported or published by the product.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {materialScenario,scenarioFiles} from '../b3-material-fixture.mjs';
const root='/workspace/apps/app',require=createRequire(root+'/package.json'),hash=b=>createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync('/source-manifest.json'));
for(const [f,h]of Object.entries(manifest.files))if(hash(fs.readFileSync(path.join(root,f)))!==h)throw Error('source drift '+f);
fs.mkdirSync('/fixtures',{recursive:true});const data=materialScenario('UAT-09');
fs.writeFileSync('/fixtures/PROFILE.json',JSON.stringify({kind:'REPLACEABLE_EXPLICIT_SIMULATION_NOT_CUSTOMER_FACTS',productSha:manifest.productSha,lineCount:1,source:'Existing B3-v1 normalized joint/tool/personnel/material mock, reused unchanged',limits:['Not original19 direct import or unknown B12 business decisions','No new role, P1, external dispatch, formal SSO, or QA verdict'],tables:data},null,2));
fs.writeFileSync('/fixtures/IMPORT-REQUEST.json',JSON.stringify({revision:0,files:scenarioFiles(data)},null,2));
const {build}=await import(root+'/node_modules/vite/dist/node/index.js'),react=(await import(require.resolve('@vitejs/plugin-react'))).default;
await build({configFile:false,root,base:'/',plugins:[react()],resolve:{alias:[{find:/^@praetor\/lite-app-runtime$/,replacement:root+'/qa/fr033-integration-runtime.mjs'}]},build:{outDir:'/r7-dist',emptyOutDir:true}});
const tree=dir=>Object.fromEntries(fs.readdirSync(dir,{recursive:true}).filter(f=>fs.statSync(path.join(dir,f)).isFile()).sort().map(f=>[f,hash(fs.readFileSync(path.join(dir,f)))]));
fs.writeFileSync('/r7-build-metadata.json',JSON.stringify({...manifest,files:undefined,sourceFilesVerified:Object.keys(manifest.files).length,sourceManifestSha256:hash(fs.readFileSync('/source-manifest.json')),buildFiles:tree('/r7-dist'),fixtureFiles:tree('/fixtures'),node:process.version,syntheticRuntimeAlias:'qa/fr033-integration-runtime.mjs',productSourceModified:false},null,2));
