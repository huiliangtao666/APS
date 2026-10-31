import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import BomLossConfig from '../src/BomLossConfig';
import {createBomLossConfig,freezeBomLossRun,parseBomLossConfig,serializeBomLossConfig} from '../src/lib/bom-loss-policy.mjs';
import type {BomLossConfigValue} from '../src/lib/bom-loss-policy.mjs';
// QA adapter only: localStorage exercises JSON bytes/reopen without claiming API persistence.
const recipe={recipeId:'DEMO-1000',version:'fixture-v1',source:'Issue38 approved example (replaceable fixture)',unit:'kg' as const,basisKg:'1000',materials:[['LEAN','650'],['FAT','150'],['WATER','150'],['PREMIX','50']].map(([materialId,quotaKg])=>({materialId,quotaKg,unit:'kg' as const}))};
function Harness(){
 const [value,setValue]=useState<BomLossConfigValue>(()=>{const saved=localStorage.getItem('bom-loss-config');return saved?parseBomLossConfig(saved):createBomLossConfig('QA explicit fixture; no application API','fixture-config-v1');});
 const [calls,setCalls]=useState(0),[snapshot,setSnapshot]=useState(localStorage.getItem('bom-loss-snapshot')||'');
 const save=(next:BomLossConfigValue)=>{const json=serializeBomLossConfig(next);localStorage.setItem('bom-loss-config',json);setValue(parseBomLossConfig(json));setCalls(n=>n+1);};
 return <main><style>{`pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:160px;overflow:auto}body{margin:8px}`}</style><p>独立组件自测夹具：演示本地 JSON 读回；未接入主应用 API / Worker。</p>
  <BomLossConfig value={value} recipe={recipe} onSave={save} initialTargetKg="240"/>
  <button onClick={()=>{const json=JSON.stringify(freezeBomLossRun(recipe,value,'240'));localStorage.setItem('bom-loss-snapshot',json);setSnapshot(json);}}>冻结已保存配置（自测）</button>
  <output aria-label="保存回调次数">{calls}</output><pre aria-label="已保存配置">{serializeBomLossConfig(value)}</pre><pre aria-label="冻结快照">{snapshot}</pre>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
