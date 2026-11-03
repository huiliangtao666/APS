import { definePraetorConfig } from '@praetor/lite-app-runtime/vite';
import react from '@vitejs/plugin-react';
import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let runtimeRoot = '';
let runtimeOutDir = '';

// The SDK owns base, /dev/, API rewrite, bind address and injected dev ports.
// The platform publishes with `vite build` directly, so runtime sidecars must
// be emitted here as well as by the package build script.
export default definePraetorConfig({
  plugins: [react(), {
    name: 'aps-runtime-sidecars',
    apply: 'build',
    configResolved(config) {
      runtimeRoot = config.root;
      runtimeOutDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await Promise.all([
        ...['calculation-worker', 'workbook-import-worker'].map(name => build({
          absWorkingDir: runtimeRoot,
          entryPoints: [`server/${name}.mjs`],
          outfile: resolve(runtimeOutDir, `${name}.mjs`),
          bundle: true,
          platform: 'node',
          format: 'esm',
          packages: 'external',
        })),
        ...['workbook-schema.json', 'workbook-simulation.json'].map(name =>
          copyFile(resolve(runtimeRoot, 'server', name), resolve(runtimeOutDir, name))),
      ]);
    },
  }],
  apiPort: 4319,
  server: { port: 4318 },
  preview: { host: '0.0.0.0', port: 4318 },
});
