import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Product sources and the synthetic fixture are byte-for-byte copies; no mocks.
mkdirSync('rebuilt',{recursive:true});
for(const version of ['before','after']){
 const entry=version==='before'?'browser-acceptance':'axis-browser';
 await build({entryPoints:[`source/${version}/qa/${entry}.tsx`],bundle:true,minify:true,
  define:{'process.env.NODE_ENV':'"production"'},format:'esm',jsx:'automatic',outfile:`rebuilt/${version}.js`});
 const prefix=readFileSync(`original/${version}.html`,'utf8').split('<style>')[0];
 const html=prefix+'<style>'+readFileSync(`rebuilt/${version}.css`,'utf8')+(version==='before'?'</style><div id=root></div><script type=module>':'</style><div id="root"></div><script type="module">')+
  readFileSync(`rebuilt/${version}.js`,'utf8').replaceAll('</script','<\\/script')+'</script></html>'+
  (version==='before'?'<script>'+readFileSync('baseline-instrumentation.js','utf8')+'</script>':'');
 writeFileSync(`rebuilt/${version}.html`,html);
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const original=readFileSync(`original/${version}.html`,'utf8');
 if(hash(html)!==hash(original)){const i=[...html].findIndex((c,i)=>c!==original[i]);console.log(JSON.stringify({version,length:html.length,originalLength:original.length,firstMismatch:i,rebuilt:html.slice(i-60,i+180),original:original.slice(i-60,i+180)}));throw Error(version+' is not byte-identical to original captured harness');}
 console.log(version+' byte-identical to original '+hash(html));
}
copyFileSync('original/index.html','rebuilt/index.html');
