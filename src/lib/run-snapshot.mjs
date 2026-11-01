export async function loadRunSnapshot(api) {
  const history = await api('/runs');
  const list = await api('/plans');
  return { history, list };
}
