import {build} from 'esbuild';import fs from 'node:fs';
// Engineering-only low-memory bundle with explicit synthetic identity. This
// does not replace the mandatory standard tsc/Vite production build check.
fs.mkdirSync('/out/candidate-dist',{recursive:true});
await build({entryPoints:['src/main.tsx'],outdir:'/out/candidate-dist/assets',entryNames:'app',bundle:true,format:'esm',jsx:'automatic',alias:{'@praetor/lite-app-runtime':'./qa/fr033-integration-runtime.mjs'},define:{'import.meta.env.BASE_URL':'"/"','process.env.NODE_ENV':'"production"'},logLevel:'info'});
fs.writeFileSync('/out/candidate-dist/index.html','<!doctype html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BR13 isolated candidate</title><link rel="stylesheet" href="/assets/app.css"></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>');
