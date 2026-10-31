import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { R21ConfigurationPanel } from '../src/R21ConfigurationPanel';
createRoot(document.getElementById('root')!).render(<React.StrictMode><aside role="note" style={{ padding: 20, background: '#fff3c4', color: '#382b00' }}><h1>R2.1 隔离 UAT 演练 · 模拟操作人</h1><p>无需正式账号、邀请或成员设置。此入口使用隔离测试身份，不证明真实身份或 QA UAT 已通过。六项配置可保存/应用；完整原03导入仍等待共享校验集成，不能将演练切片视为完整导入通过。</p></aside><R21ConfigurationPanel /><App /></React.StrictMode>);
