import fs from 'node:fs';
import {chromium} from 'playwright';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
console.log('BROWSER_EXECUTABLE',chromium.executablePath());
console.log(execFileSync('ldd',[chromium.executablePath()],{encoding:'utf8'}));
console.log('BROWSER_SHA256',createHash('sha256').update(fs.readFileSync(chromium.executablePath())).digest('hex'));
for(const file of ['/proc/sys/kernel/unprivileged_userns_clone','/proc/sys/user/max_user_namespaces','/proc/self/status']){
 if(fs.existsSync(file))console.log(file,fs.readFileSync(file,'utf8').split('\n').filter(s=>file.endsWith('status')?/^(NoNewPrivs|Seccomp|CapEff|Uid|Gid):/.test(s):true).join('\n'));
}
const ns=spawnSync('unshare',['--user','--map-root-user','true'],{encoding:'utf8'});
console.log('USER_NAMESPACE_PROBE',JSON.stringify({status:ns.status,stderr:ns.stderr,stdout:ns.stdout,error:ns.error?.message}));
const browser=await chromium.launch({headless:true,chromiumSandbox:true});
try{
 const page=await browser.newPage();await page.goto('data:text/html,<title>FR033 sandbox launch</title><p>Sandbox enabled</p>');
 console.log('FR033_SANDBOX_LAUNCH_PASS',JSON.stringify({browser:browser.version(),uid:process.getuid(),arch:process.arch,node:process.version,title:await page.title(),manifestSHA256:createHash('sha256').update(fs.readFileSync(process.env.FR033_RUNTIME_MANIFEST)).digest('hex')}));
}finally{await browser.close();}
