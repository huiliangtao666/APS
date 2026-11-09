import type {ReactNode} from 'react';

// Match business names, not operation numbers: different routes reuse OP001… .
const illustrations:{match:RegExp;kind:string;drawing:ReactNode}[]=[
 {match:/解冻|解凍|thaw/i,kind:'thaw',drawing:<><path d="M10 4v13m-5-8 10 6M5 15l10-6M7 6l3 3 3-3M7 17l3-3 3 3"/><path d="M23 8c0 5-6 8-6 13a6 6 0 0 0 12 0c0-5-6-8-6-13Z" fill="currentColor" fillOpacity=".12"/><path d="M20 22a3 3 0 0 0 3 3"/></>},
 {match:/切片|切丁|slice/i,kind:'slice',drawing:<><rect x="3" y="24" width="26" height="4" rx="1"/><path d="m7 16 8-8 10 10-5 5H7Z" fill="currentColor" fillOpacity=".12"/><path d="m10 13 10 10m-6-14 10 10M21 3l-4 4 9 9 3-3Z"/></>},
 {match:/分切|修整|切割|cut/i,kind:'cut',drawing:<><rect x="3" y="24" width="26" height="4" rx="1"/><path d="M5 19c0-5 10-6 13-1l-3 5H6Z" fill="currentColor" fillOpacity=".12"/><path d="m18 4 9 8-9 10-6-6 10-8m1-7 6 6-3 3-6-6Z"/></>},
 {match:/称量|稱量|配料|weigh/i,kind:'weigh',drawing:<><path d="M8 4h16l-2 9H10Z" fill="currentColor" fillOpacity=".12"/><path d="M16 13v4M7 17h18l3 11H4Z"/><circle cx="16" cy="23" r="3"/><path d="m16 23 2-2"/></>},
 {match:/绞肉|絞肉|grind/i,kind:'grind',drawing:<><path d="M4 4h12l-3 7H7ZM7 11h15v11H7Z" fill="currentColor" fillOpacity=".12"/><path d="M22 14h5v7h-5M5 26h19M10 22v4m9-4v4M7 16h11m-3-3 3 3-3 3m12 3v6m-3-5v5"/></>},
 {match:/注射|inject/i,kind:'inject',drawing:<><path d="M5 24c1-5 7-7 12-3l6 2 4 5H4Z" fill="currentColor" fillOpacity=".12"/><path d="m14 4 12 12m-14-7 9 9 6-6-9-9Zm-1 8-5 5m15-16 3-3m-5 0 8 8"/></>},
 {match:/斩拌|斬拌|搅拌|攪拌|混合|mix/i,kind:'mix',drawing:<><path d="M4 14h24l-3 13H7Z" fill="currentColor" fillOpacity=".12"/><path d="M16 4v15m-6 1c2 3 10 3 12-1M12 4h8M5 10l2-3m18 3-2-3M9 30h14"/></>},
 {match:/滚揉|滾揉|tumble/i,kind:'tumble',drawing:<><rect x="6" y="8" width="20" height="16" rx="7" fill="currentColor" fillOpacity=".12"/><path d="m10 24-3 5m15-5 3 5M12 12a5 5 0 0 1 9 3m-3-2 3 2 2-3M20 20a5 5 0 0 1-9-3m3 2-3-2-2 3"/></>},
 {match:/装罐|封罐|can(n?ing)?$/i,kind:'can',drawing:<><ellipse cx="16" cy="7" rx="9" ry="3"/><path d="M7 7v18c0 4 18 4 18 0V7M7 13h18M7 22h18"/><path d="M11 16h10v4H11Z" fill="currentColor" fillOpacity=".12"/></>},
 {match:/灌装|灌裝|stuff|fill/i,kind:'fill',drawing:<><path d="M3 4h15l-4 8H7ZM10 12v6h8"/><path d="m20 17 2-2 3 2 3 6-1 3-3 1-3-2-3-6Z" fill="currentColor" fillOpacity=".12"/><path d="m22 15-1-3m6 14 2 3M5 27h12"/></>},
 {match:/成型|成形|装模|裝模|mould|mold/i,kind:'mould',drawing:<><path d="M4 15h24l-3 13H7ZM9 5h14v6H9Z" fill="currentColor" fillOpacity=".12"/><path d="M16 2v3m0 6v9m-4-4 4 4 4-4M9 24h14"/></>},
 {match:/卤制|滷製|煮制|brais|boil/i,kind:'boil',drawing:<><path d="M6 13h20v10c0 6-20 6-20 0ZM3 13h26M3 17h3m20 0h3M9 10c-3-3 3-4 0-7m7 7c-3-3 3-4 0-7m7 7c-3-3 3-4 0-7"/><path d="M8 19h16v4c0 4-16 4-16 0Z" fill="currentColor" fillOpacity=".12"/></>},
 {match:/热加工|熱加工|蒸|烤|熏|杀菌|殺菌|heat|cook/i,kind:'heat',drawing:<><rect x="4" y="4" width="24" height="24" rx="3"/><path d="M4 10h24M8 7h1m4 0h1m4 0h1M10 24c-5-5 3-7 3-12 5 4 9 8 6 12m-5 0c-2-2 1-3 1-5 3 2 3 4 1 5" fill="currentColor" fillOpacity=".12"/></>},
 {match:/冷却|冷卻|冷冻|冷凍|cool|chill|freez/i,kind:'cool',drawing:<><path d="M16 3v26M5 9l22 14M5 23 27 9M12 6l4 4 4-4m-8 20 4-4 4 4M5 14l5-2V7m17 11-5 2v5M5 18l5 2v5m17-11-5-2V7"/></>},
 {match:/检验|檢驗|检测|檢測|质检|質檢|inspect|check/i,kind:'inspect',drawing:<><path d="M16 4 4 10l12 6 12-6-12-6ZM4 10v13l12 6 7-4M16 16v13m-6-22 12 6"/><circle cx="24" cy="20" r="5" fill="currentColor" fillOpacity=".12"/><path d="m22 20 2 2 3-4m0 6 3 4"/></>},
 {match:/包装|包裝|分装|分裝|封口|pack|seal/i,kind:'pack',drawing:<><path d="M8 3h16l-2 5 3 4v17H7V12l3-4-2-5ZM10 8h12M7 25h18"/><path d="M11 14h10v7H11Z" fill="currentColor" fillOpacity=".12"/><path d="m10 5 2 1 2-1 2 1 2-1 2 1 2-1"/></>},
 {match:/腌制|醃製|静置|靜置|暂存|暫存|暂储|marinat|hold|rest/i,kind:'hold',drawing:<><path d="M4 10h20l-2 15H6ZM3 7h22M11 4h6"/><circle cx="23" cy="22" r="7" fill="#eaf3f5"/><path d="M23 18v4l3 2"/></>}
];

export function ProcessOperationIcon({name}:{name:string}){
 const illustration=illustrations.find(icon=>icon.match.test(name));
 return <span className="process-operation-icon" aria-hidden="true" data-operation-icon={illustration?.kind||'operation'}>
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">
   {illustration?.drawing||<><path d="m16 3 12 7v13l-12 7L4 23V10ZM4 10l12 7 12-7M16 17v13"/><path d="m10 7 12 7"/></>}
  </svg>
 </span>;
}
