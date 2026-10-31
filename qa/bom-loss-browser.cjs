// Run inside an isolated container with React/esbuild and Playwright available.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=process.env.BOM_LOSS_SOURCE||process.cwd(),out=process.env.BOM_LOSS_OUT||'/evidence';
const {build}=require(path.join(root,'node_modules/esbuild'));
const {chromium}=require(process.env.BOM_LOSS_PLAYWRIGHT||'playwright');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 await build({entryPoints:[root+'/qa/bom-loss-browser-entry.tsx'],bundle:true,format:'iife',jsx:'automatic',outdir:out+'/browser-build',entryNames:'component',define:{'process.env.NODE_ENV':'"production"'}});
 const html='<!doctype html><html lang="zh"><meta charset="utf-8"><title>BOM loss component selftest</title><link rel="stylesheet" href="/component.css"><div id="root"></div><script src="/component.js"></script></html>';
 const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);}else if(['/component.js','/component.css'].includes(req.url)){res.setHeader('Content-Type',req.url.endsWith('js')?'application/javascript':'text/css');res.end(fs.readFileSync(out+'/browser-build'+req.url));}else{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote','--disable-software-rasterizer','--renderer-process-limit=1','--js-flags=--max-old-space-size=128']}),page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],checks=[];
 const pass=(id,expected)=>{checks.push({id,expected,status:'PASS'});console.log('PASS '+id);};
 const save=()=>page.getByRole('button',{name:'保存损耗配置',exact:true});
 const uniform=k=>page.getByLabel('统一'+k+'（%）',{exact:true});
 const override=(id,k)=>page.getByLabel(id+k+'覆盖',{exact:true});
 const field=(id,k)=>page.getByLabel(id+k+'（%）',{exact:true});
 const stored=()=>page.evaluate(()=>localStorage.getItem('bom-loss-config'));
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base);await page.getByTestId('yield').waitFor();assert.match(await page.getByTestId('yield').innerText(),/收率 100%/);pass('UI01-default','zero unified, inherited, yield100%');
  await uniform('生产损耗').fill('5');assert.match(await page.getByTestId('yield').innerText(),/收率 95%/);
  await override('LEAN','生产损耗').check();await field('LEAN','生产损耗').fill('0');await uniform('生产损耗').fill('7');assert.equal(await field('LEAN','生产损耗').inputValue(),'0');
  await save().click();await page.getByText('保存请求已完成',{exact:true}).waitFor();let c=JSON.parse(await stored());assert.equal(c.overrides[0].losses.production,'0');assert.equal(c.unified.production,'7');pass('UI02-explicit-zero','0 override survives uniform7 and callback JSON');
  await page.reload();assert.equal(await field('LEAN','生产损耗').inputValue(),'0');assert.equal(await uniform('生产损耗').inputValue(),'7');pass('UI03-reload','serialized config reopens without loss');
  await override('LEAN','生产损耗').uncheck();assert.equal(await field('LEAN','生产损耗').inputValue(),'7');await save().click();await page.getByText('保存请求已完成',{exact:true}).waitFor();assert.equal(JSON.parse(await stored()).overrides.length,0);pass('UI04-clear','clear removes override, inherits7');
  await uniform('生产损耗').fill('0');for(const [id,v]of [['LEAN','2'],['FAT','4'],['WATER','10'],['PREMIX','0']]){await override(id,'生产损耗').check();await field(id,'生产损耗').fill(v);}
  assert.match(await page.getByTestId('yield').innerText(),/保留产出 966 kg.*96.6%/);await save().click();await page.getByText('保存请求已完成',{exact:true}).waitFor();
  await page.screenshot({path:out+'/browser-example.png'});await page.getByRole('button',{name:'冻结已保存配置（自测）',exact:true}).click();const frozen=await page.getByLabel('冻结快照',{exact:true}).innerText();assert.equal(JSON.parse(frozen).result.totalOutput.numerator,'966');pass('UI05-example-freeze','966kg,96.6%,target240 exact snapshot');
  for(const kind of ['原料损耗','运输损耗']){await uniform(kind).fill('100');await override('LEAN',kind).check();await field('LEAN',kind).fill('0');await save().click();await page.getByText('保存请求已完成',{exact:true}).waitFor();assert.match(await page.getByTestId('yield').innerText(),/96.6%/);}
  pass('UI06-three-kinds-isolated','raw/transport can override and save without changing production output');
  const before=await stored(),calls=await page.getByLabel('保存回调次数',{exact:true}).innerText();
  for(const bad of ['-1','100.1','NaN','Infinity','']){await uniform('原料损耗').fill(bad);assert.equal(await save().isDisabled(),true);assert.ok(await page.getByRole('alert').count());assert.equal(await stored(),before);assert.equal(await page.getByLabel('保存回调次数',{exact:true}).innerText(),calls);}
  assert.equal(await uniform('原料损耗').inputValue(),'');pass('UI07-invalid','invalid values retained visibly; no callback, no storage mutation');
  await uniform('原料损耗').fill('100');await page.getByLabel('目标合格产出（kg）',{exact:true}).fill('-1');assert.equal(await save().isDisabled(),true);assert.equal(await stored(),before);await page.getByLabel('目标合格产出（kg）',{exact:true}).fill('240');pass('UI08-invalid-target','negative target rejected');
  for(const id of ['LEAN','FAT','WATER','PREMIX'])await override(id,'生产损耗').uncheck();await uniform('生产损耗').fill('100');assert.match(await page.getByTestId('yield').innerText(),/保留产出 0 kg.*收率 0%/);assert.equal(await save().isDisabled(),true);assert.match(await page.getByRole('alert').first().innerText(),/无可生产产出/);
  await page.getByLabel('目标合格产出（kg）',{exact:true}).fill('');await save().click();await page.getByText('保存请求已完成',{exact:true}).waitFor();assert.equal(JSON.parse(await stored()).unified.production,'100');pass('UI09-full-loss','O0 valid saved config; target inversion refused');
  assert.equal(await page.getByLabel('冻结快照',{exact:true}).innerText(),frozen);await page.reload();assert.equal(await page.getByLabel('冻结快照',{exact:true}).innerText(),frozen);pass('UI10-freeze-history','old snapshot exact bytes unchanged after edits/save/reload');
  await page.screenshot({path:out+'/browser-full-loss.png',fullPage:false});
  await page.getByRole('button',{name:'撤销修改',exact:true}).click();await uniform('生产损耗').fill('12.34');await page.getByRole('button',{name:'撤销修改',exact:true}).click();assert.equal(await uniform('生产损耗').inputValue(),'100');pass('UI11-cancel','restore controlled value');
  await page.setViewportSize({width:640,height:900});await page.screenshot({path:out+'/browser-640.png',fullPage:false});
  fs.writeFileSync(out+'/browser-saved-config.json',await stored());fs.writeFileSync(out+'/browser-frozen-snapshot.json',frozen);fs.writeFileSync(out+'/browser-final.html',await page.content());assert.deepEqual(errors,[]);
 }finally{
  fs.writeFileSync(out+'/browser-report.json',JSON.stringify({scope:'independent component; QA localStorage adapter; no application API/Worker',browser:browser.version(),checks,errors,sourceFiles:['src/BomLossConfig.tsx','src/BomLossConfig.css','src/lib/bom-loss-policy.mjs'].map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(root+'/'+p)).digest('hex')}))},null,2));await browser.close();await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
