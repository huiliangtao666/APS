// Exact committed HTML bytes, with own Chromium DOM/captures in disposable runtime.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root=path.resolve('qa/evidence/fr033-issue19');
const hashes=JSON.parse(fs.readFileSync(path.join(root,'SHA256-MANIFEST.json')));
for(const [file,hash] of Object.entries(hashes))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,file);
const output=process.env.FR033_EVIDENCE_DIR||'/tmp/fr033-recovery-evidence';fs.mkdirSync(output,{recursive:true});
const app=express();app.use(express.static(path.join(root,'original')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
let browser;
try{
 browser=await chromium.launch({headless:true,chromiumSandbox:true});
 const records=[],errors=[],consoleRecords=[];
 const page=await browser.newPage({viewport:{width:1280,height:950},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(/BASELINE-AXIS|AXIS-RECORD|FR033-MEASUREMENT/.test(m.text()))consoleRecords.push(m.text());});
 for(const width of [640,1100])for(const version of ['before','after']){
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.locator('#version').selectOption(version);await page.locator('#viewport').selectOption(String(width));
  const frame=page.frameLocator('#case');await frame.locator('.fr033-axis').waitFor();
  for(const zoom of ['0.25','1','3','8']){
   await frame.getByLabel('缩放',{exact:true}).selectOption(zoom);
   await frame.locator('#measure').click();
   const geometry=await frame.locator('.fr033-axis').evaluate(e=>({axis:e.getBoundingClientRect().toJSON(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},labels:[...e.children].map(n=>({text:n.textContent,rect:n.getBoundingClientRect().toJSON()})),bars:[...document.querySelectorAll('.fr033-task')].map(n=>({label:n.getAttribute('aria-label'),rect:n.getBoundingClientRect().toJSON()}))}));
   assert.equal(geometry.viewport.width,width);assert.equal(geometry.axis.width,120*Number(zoom));
   await frame.locator('.fr033-scroll').scrollIntoViewIfNeeded();
   const name=`${version}-${width}-${zoom}`;
   await page.locator('#case').screenshot({path:`${output}/${name}.jpg`,type:'jpeg',quality:35});
   records.push({name,geometry,dom:await frame.locator('body').innerText()});
  }
  if(version==='after'){
   await frame.locator('#matrix').click();
   await frame.locator('#measurements').evaluate(async e=>{for(let i=0;i<100;i++){try{if(JSON.parse(e.textContent).length===12)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Matrix did not finish');});
   const matrix=JSON.parse(await frame.locator('#measurements').innerText());
   for(const r of matrix){assert.ok(r.dateLabels.minimumGap===null||r.dateLabels.minimumGap>=0);assert.equal(r.dateLabels.inkOverflow,false);assert.equal(r.dateLabels.axisOverflow,false);assert.equal(r.immutable,true);assert.deepEqual(r.errors,[]);}
   records.push({name:`matrix-${width}`,matrix});
   await frame.getByLabel('缩放',{exact:true}).selectOption('8');
   await frame.getByRole('button',{name:'SHORT',exact:true}).first().click();
   await frame.getByLabel('窗口结束分钟',{exact:true}).fill('1e12');await frame.getByRole('alert').waitFor();
   assert.equal(await frame.locator('.fr033-axis').evaluate(e=>e.getBoundingClientRect().width),960);
   await frame.getByLabel('窗口结束分钟',{exact:true}).fill('120');
   await frame.locator('#change-facts').click();assert.match(await frame.locator('#integrity').innerText(),/true.*999/);
   await frame.locator('#measure').click();
   const last=JSON.parse(await frame.locator('#measurements').innerText()).at(-1);assert.equal(last.immutable,true);assert.match(last.details,/4 kg/);
   records.push({name:`HISTORY01-ZOOM01-WINDOW02-${width}`,measurement:last});
  }
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(`${output}/component-report.json`,JSON.stringify({at:new Date().toISOString(),browser:browser.version(),os:process.platform,arch:process.arch,hashes,records,errors,consoleRecords},null,2));
 console.log('FR033_COMPONENT_BROWSER_PASS',JSON.stringify({recordCount:records.length,errors,output}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
