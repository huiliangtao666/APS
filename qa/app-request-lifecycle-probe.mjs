// Bounded browser regression fixture: actual App/React effects, with trace-only copies.
// Run after the standard build: node qa/app-request-lifecycle-probe.mjs <old-App.tsx>
import fs from 'node:fs';
import {build} from 'esbuild';
const original=fs.readFileSync(process.argv[2],'utf8');
const fixed=fs.readFileSync('src/App.tsx','utf8');
const scratch=['src/.qa-lifecycle-old.tsx','src/.qa-lifecycle-fixed.tsx','src/.qa-lifecycle-entry.tsx'];
function instrument(source){
  return source.replace('const generation=requestGeneration.current;\n    const r=await fetch',
    "const generation=requestGeneration.current;(window as any).__trace.push({event:'request',path,generation});\n    const r=await fetch")
    .replace("if(generation!==requestGeneration.current)throw new Error('页面已更新，请刷新');return result;",
    "(window as any).__trace.push({event:generation===requestGeneration.current?'accepted':'rejected',path,generation,current:requestGeneration.current});if(generation!==requestGeneration.current)throw new Error('页面已更新，请刷新');return result;")
    .replace("api('/session').then(setSession)","((window as any).__trace.push({event:'parent-effect',generation:requestGeneration.current}),api('/session')).then(setSession)")
    .replace('return ()=>{requestGeneration.current++;};},[]);',"return ()=>{requestGeneration.current++;(window as any).__trace.push({event:'cleanup',generation:requestGeneration.current});};},[]);");
}
try{
  fs.writeFileSync(scratch[0],instrument(original));fs.writeFileSync(scratch[1],instrument(fixed));
  fs.writeFileSync(scratch[2],`import React from 'react';import {createRoot} from 'react-dom/client';import Old from './.qa-lifecycle-old';import Fixed from './.qa-lifecycle-fixed';let root:any;const w=window as any;w.__trace=[];w.__mount=(old=false,strict=false)=>{root=createRoot(document.getElementById('root')!);const node=React.createElement(old?Old:Fixed);root.render(strict?React.createElement(React.StrictMode,null,node):node);};w.__unmount=()=>root.unmount();`);
  await build({entryPoints:[scratch[2]],bundle:true,format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},outfile:'dist/__qa_lifecycle.js',loader:{'.css':'css'}});
  fs.writeFileSync('dist/__qa_lifecycle.html','<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="__qa_lifecycle.css"><div id="root"></div><script type="module" src="__qa_lifecycle.js"></script>');
}finally{for(const p of scratch)fs.rmSync(p,{force:true});}
