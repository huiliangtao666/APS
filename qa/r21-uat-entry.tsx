import React, {useEffect,useState} from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
function Candidate(){const [build,setBuild]=useState<any>(null);useEffect(()=>{fetch('/api/uat-build').then(r=>r.json()).then(setBuild);},[]);return <><aside role="note" style={{padding:20,background:'#fff3c4',color:'#382b00'}}><h1>B1 · UAT01 / UAT02 隔离候选</h1><p>当前使用模拟操作人，无需正式账号。六字段的模拟值均明确标记，可在“数据与 CSV”维护；不是客户事实或 QA UAT 签收。</p><p><a href="/fixtures/B1-UAT01-02-INPUTS.zip" download>下载 UAT01/02 原阶段输入与明确标记的模拟配置样例</a></p><details><summary>构建、环境与初始数据指纹</summary><pre>{JSON.stringify(build,null,2)}</pre></details></aside><App/></>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Candidate/></React.StrictMode>);
