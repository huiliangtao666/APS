import { definePraetorConfig } from '@praetor/lite-app-runtime/vite';
import react from '@vitejs/plugin-react';
import { build } from 'esbuild';

let workerRoot = '';
let workerOutDir = 'dist';

// The edge-routing contract — Vite `base`, `server.hmr`, and the
// `${base}api` proxy, all driven by the PRAETOR_APP_BASE / PRAETOR_EDGE_PORT /
// PRAETOR_EDGE_SCHEME env the host injects at container start — is owned by
// `@praetor/lite-app-runtime` (installed by init-app.sh). See
// `docs/lite-app-edge-routing.md` for the mechanism.
//
// This file holds only the per-app bits: which plugins to run, the exposed
// dev port, and the Express API port the dev proxy forwards to. You can ADD
// plugins / resolve.alias / extra `server.proxy` keys here, but you cannot
// replace the contract-owned `base` / `server.host` / `server.hmr` /
// `${base}api` proxy blocks — definePraetorConfig re-applies them last so an
// edit can't silently break edge routing for a deployed binding.
//
// All three env vars default to "standalone, no edge" (base `/`, Vite's own
// HMR detection), so a plain `npm run dev` outside a container still works.
export default definePraetorConfig({
  plugins: [react(), {
    name: 'aps-calculation-worker',
    apply: 'build',
    configResolved(config) {
      workerRoot = config.root;
      workerOutDir = config.build.outDir;
    },
    async closeBundle() {
      await build({
        absWorkingDir: workerRoot,
        entryPoints: ['server/calculation-worker.mjs'],
        outfile: `${workerOutDir}/calculation-worker.mjs`,
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
      });
    },
  }],
  // Express dev port. Vite proxies `${base}api/*` here; Express binds it.
  apiPort: 3001,
  // Exposed Vite dev port (host 0.0.0.0 + strictPort are contract-owned).
  server: { port: 3000 },
  preview: { host: '0.0.0.0', port: 3000 },
});
