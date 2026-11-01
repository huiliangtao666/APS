// QA adapter only. The fixed /ui bundle stays byte-for-byte unchanged.
import fs from 'node:fs';
export const baselineId='SIM-LP01-PRE1-v1';
export const baselinePrefix='/__qa/baselines/'+baselineId;
export function baselineHtml(){
 const setup=String.raw`(()=>{
  const id='SIM-LP01-PRE1-v1',prefix='/__qa/baselines/'+id;
  if(location.pathname!==prefix+'/ui')throw Error('explicit baseline UI path required');
  document.documentElement.dataset.b15Simulation=id;
  const originalFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
   const request=new Request(input,init),url=new URL(request.url);
   if(url.origin!==location.origin)return originalFetch(request);
   if(url.pathname==='/api'||url.pathname.startsWith('/api/'))url.pathname=prefix+url.pathname;
   if(url.pathname===prefix+'/api'||url.pathname.startsWith(prefix+'/api/')){
    const headers=new Headers(request.headers);headers.set('X-B15-Simulation',id);
    return originalFetch(new Request(url.href,new Request(request,{headers})));
   }
   return originalFetch(request);
  };
 })();`;
 const banner='<aside aria-label="独立模拟域" style="padding:12px;background:#fff3c4">'+
  'SIM-LP01-PRE1-v1 · 独立事件前模拟；不是主历史回滚 · 固定48e产品界面 · '+
  '<a href="/">主域（只读）</a> / <a href="'+baselinePrefix+'/ui">独立域</a> · 角色：'+
  ['planner','query','supervisor'].map(r=>'<a href="'+baselinePrefix+'/role/'+r+'">'+r+'</a>').join(' / ')+
  ' · 域内操作保留原角色权限；QA AC20/32未复验</aside>';
 return fs.readFileSync('/ui/index.html','utf8')
  .replace('<head>','<head><script>'+setup+'</script>')
  .replace('<body>','<body>'+banner);
}
