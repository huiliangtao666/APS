import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const prefix=process.env.FR033_RUNTIME_PREFIX;
assert.match(prefix||'',/^\/tmp\/fr033-browser-runtime-/);
const lock='qa/fr033-browser-dependencies.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const archives=path.join(prefix,'archives');
const mode=process.argv[2];
if(mode==='lock'){
 const packages=fs.readdirSync(archives).filter(f=>f.endsWith('.deb')).map(file=>{
  const deb=path.join(archives,file);
  const [name,version,architecture]=execFileSync('dpkg-deb',['-f',deb,'Package','Version','Architecture'],{encoding:'utf8'}).trim().split('\n').map(s=>s.replace(/^\w+: /,''));
  const detail=execFileSync('apt-cache',['-o',`Dir::State::lists=${prefix}/lists`,'show',`${name}=${version}`],{encoding:'utf8'});
  const filename=detail.match(/^Filename: (.+)$/m)?.[1];
  const digest=detail.match(/^SHA256: (.+)$/m)?.[1];
  assert.ok(filename);assert.equal(sha(fs.readFileSync(deb)),digest);
  const security=filename.startsWith('pool/updates/');
  return {name,version,architecture,file,url:`https://deb.debian.org/${security?'debian-security':'debian'}/${filename}`,sha256:digest};
 });
 fs.writeFileSync(lock,JSON.stringify({schema:1,os:'debian12',arch:'arm64',authentication:'APT signed Debian InRelease indexes; SHA256 verified against package index',packages},null,2)+'\n');
 console.log('DEPENDENCY_MANIFEST_BASE64='+fs.readFileSync(lock).toString('base64'));
}else{
 const manifest=JSON.parse(fs.readFileSync(lock));
 assert.equal(manifest.os,'debian12');assert.equal(manifest.arch,'arm64');
 for(const p of manifest.packages){
  assert.match(p.file,/^[a-zA-Z0-9_.+%:~\-]+\.deb$/);assert.match(p.sha256,/^[a-f0-9]{64}$/);
  const file=path.join(archives,p.file);
  if(mode==='restore'){
   assert.match(p.url,/^https:\/\/deb\.debian\.org\/debian(?:-security)?\/pool\//);
   const response=await fetch(p.url);assert.ok(response.ok,`${p.url}: HTTP${response.status}`);
   const bytes=Buffer.from(await response.arrayBuffer());assert.equal(sha(bytes),p.sha256,p.name);fs.writeFileSync(file,bytes);
  }else if(mode==='extract'){
   assert.equal(sha(fs.readFileSync(file)),p.sha256,p.name);
   // Keep the container's libc/loader/toolchain baseline; never overlay them.
   if(!['libc6','libc-bin','libgcc-s1','libstdc++6','gcc-12-base'].includes(p.name))execFileSync('dpkg-deb',['-x',file,path.join(prefix,'root')]);
  }else throw new Error('Use lock, restore or extract');
 }
}
