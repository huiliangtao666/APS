export function isTrustedWrite(req) {
  const site = req.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) return false;
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
    if (parsed.host === req.get('host')) return true;
    return req.get('x-aps-request') === 'workbench' && Boolean(req.is('application/json'));
  } catch {
    return false;
  }
}
