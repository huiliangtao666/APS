import {build} from 'vite';import {fileURLToPath} from 'node:url';
await build({root:process.cwd(),base:'/',resolve:{alias:[{find:/^@praetor\/lite-app-runtime$/,replacement:fileURLToPath(new URL('./fr033-integration-runtime.mjs',import.meta.url))}]},build:{outDir:'/workspace/temp/b15-lossless/ui-dist',emptyOutDir:true}});
