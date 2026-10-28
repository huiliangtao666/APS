/// <reference types="vite/client" />
// Provides the `import.meta.env` types (BASE_URL, MODE, DEV, PROD, …) that
// Vite injects. The praetor-bridge fetch shim and any `apiPath()` /
// `import.meta.env.BASE_URL` usage rely on these — without this reference
// `npm run build`'s `tsc --noEmit` fails with
// "Property 'env' does not exist on type 'ImportMeta'".
