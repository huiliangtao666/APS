import { definePraetorConfig } from '@praetor/lite-app-runtime/vite';
import react from '@vitejs/plugin-react';

// The SDK owns base, /dev/, API rewrite, bind address and injected dev ports.
// Workers are built by the package build script; a frontend-only build must
// not silently rebuild the separately verified solver/import workers.
export default definePraetorConfig({
  plugins: [react()],
  apiPort: 4319,
  server: { port: 4318 },
  preview: { host: '0.0.0.0', port: 4318 },
});
