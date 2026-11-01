import {build} from 'vite';import react from '@vitejs/plugin-react';import {fileURLToPath} from 'node:url';
if(!process.env.PACK_UI_DIST?.startsWith('/'))throw Error('Absolute isolated PACK_UI_DIST required');
await build({configFile:false,plugins:[react()],root:process.cwd(),base:'/',resolve:{alias:[{find:/^@praetor\/lite-app-runtime$/,replacement:fileURLToPath(new URL('./fr033-integration-runtime.mjs',import.meta.url))}]},build:{outDir:process.env.PACK_UI_DIST,emptyOutDir:true}});
