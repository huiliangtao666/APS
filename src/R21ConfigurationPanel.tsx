import { useEffect, useState } from 'react';
type Entry = { value: string; source: { kind: string; reference: string; version: string } } | null;
type Config = { revision: number; values: Record<string, Record<string, Entry>> };
const fields: Record<string, string[]> = { '是否允许拆分': ['是', '否'], '需求类型': ['正式订单', '预测'], '订单状态': ['有效', '已取消'] };
export function R21ConfigurationPanel({canWrite=true,onApplied,inputRevision}:{canWrite?:boolean;onApplied?:()=>Promise<void>;inputRevision?:number}={}) {
  const [config, setConfig] = useState<Config | null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  async function api(p: string, body?: object) {
    const r = await fetch('/api/r21' + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const x = await r.json(); if (!r.ok) throw Error(`${x.error} ${JSON.stringify(x.issues || [])}`); return x;
  }
  async function load() { const [s, d] = await Promise.all([api('/config'), api('/devices')]); setConfig(s.config); setDevices(d.devices); setDirty(false); }
  useEffect(() => { load().catch(e => setMessage(e.message)); }, [inputRevision]);
  const change = (id: string, f: string, key: string, value: string) => {
    if (!config) return;
    const entry = config.values[id][f] || { value: '', source: { kind: 'simulation', reference: '', version: '' } };
    const next = key === 'value' ? (value ? { ...entry, value } : null) : { ...entry, source: { ...entry.source, [key]: value } };
    setConfig({ ...config, values: { ...config.values, [id]: { ...config.values[id], [f]: next } } }); setDirty(true); setMessage('尚未保存；应用前请保存配置。');
  };
  async function act(action: () => Promise<void>) { setBusy(true); try { await action(); } catch (e: any) { setMessage(e.message); } finally { setBusy(false); } }
  const complete = config && Object.values(config.values).every(row => Object.values(row).every(e => e && e.value && e.source.reference.trim() && e.source.version.trim()));
  return <section className="panel" aria-label="R2.1 六项配置">
    <h2>R2.1 · A/B 独立配置与来源</h2>
    <p>仅部分字段预填模拟数据。所有模拟值均可替换；用户提供的来源也不代表系统已验证客户事实。未填写的值显示待补充，保存配置后须明确应用到当前输入；原方案继续保留。</p>
    <p role="status">{message}</p>
    {config && <><p>配置版本：{config.revision}</p><div className="table-wrap"><table><thead><tr><th>订单 / 字段</th><th>值</th><th>来源性质</th><th>来源说明</th><th>来源版本</th></tr></thead><tbody>
      {['A', 'B'].flatMap(id => Object.entries(fields).map(([f, choices]) => { const e = config.values[id][f], label = `${id} ${f}`; return <tr key={label}><th>{label}</th>
        <td><select aria-label={label} disabled={!canWrite || busy} value={e?.value || ''} onChange={v => change(id, f, 'value', v.target.value)}><option value="">待补充</option>{choices.map(v => <option key={v}>{v}</option>)}</select></td>
        <td><strong>{e?.source.kind === 'simulation' ? '模拟 · 非客户事实' : e ? '用户提供 · 未验证' : '待补充'}</strong><select aria-label={`${label} 来源性质`} disabled={!canWrite || busy || !e} value={e?.source.kind || 'simulation'} onChange={v => change(id, f, 'kind', v.target.value)}><option value="simulation">模拟</option><option value="user-supplied">用户提供（未验证）</option></select></td>
        <td><input aria-label={`${label} 来源说明`} disabled={!canWrite || busy || !e} value={e?.source.reference || ''} maxLength={500} onChange={v => change(id, f, 'reference', v.target.value)} /></td>
        <td><input aria-label={`${label} 来源版本`} disabled={!canWrite || busy || !e} value={e?.source.version || ''} maxLength={500} onChange={v => change(id, f, 'version', v.target.value)} /></td></tr>; }))}
    </tbody></table></div>
      <button disabled={!canWrite || busy || !dirty} onClick={() => act(async () => { const s = await api('/config', { revision: config.revision, values: config.values, reason: '维护 R2.1 独立配置及来源' }); setConfig(s.config); setDirty(false); setMessage('配置已保存；尚未应用到当前输入。'); })}>保存六项配置</button>
      <button disabled={!canWrite || busy || dirty || !complete} onClick={() => act(async () => { const r = await fetch('/api/state', { cache: 'no-store' }); if (!r.ok) throw Error('input_unavailable'); const s = await r.json(); await api('/apply', { configRevision: config.revision, inputRevision: s.revision, reason: '显式应用 R2.1 配置；保留历史方案' }); await onApplied?.(); await load(); setMessage('已应用到当前输入；可以发起新计算。'); })}>应用到当前输入</button>
      <button disabled={busy} onClick={() => act(async () => { await load(); setMessage('已重新读取保存配置。'); })}>重新读取配置</button>
    </>}
    <details><summary>当前阶段设备使用状态与来源</summary><p>未使用设备标记按当前路线和设备依赖计算；此表不改写原 CSV。</p><table><thead><tr><th>设备</th><th>使用状态</th><th>来源</th></tr></thead><tbody>{devices.map((d, i) => <tr key={i}><td>{d.machineId}</td><td>{d.usage === 'unused' ? '本阶段未使用' : '已引用'}</td><td>{d.source ? `${d.source.file} · 物理行 ${d.source.line ?? '未提供'} · ${d.source.sha256 || '摘要未提供'}` : '当前输入；无原 CSV 来源'}</td></tr>)}</tbody></table></details>
  </section>;
}
