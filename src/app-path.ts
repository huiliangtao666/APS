import { apiPath } from '@praetor/lite-app-runtime';

// Fetch is handled by applyPraetorRuntime; navigation/download anchors need
// the same SDK base explicitly because they do not call window.fetch.
export function appPath(path: string): string {
  return apiPath(path);
}
