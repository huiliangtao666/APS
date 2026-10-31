// Integrated replacement for the original d6fd003 isolated-module browser.
// Historical PARTIAL/BLOCKED evidence remains at d6fd003; current checks include
// the actual production App, atomic business store and ALL original03 devices.
process.env.EVIDENCE_DIR ||= process.env.R21_EVIDENCE_DIR;
await import('./b1-browser.mjs');
