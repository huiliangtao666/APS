import type {CSSProperties,ReactNode} from 'react';

export function ProductIcon({name}:{name:string}){
 let art:ReactNode,kind='product',color='#d59167';
 if(/罐头|罐頭|午餐肉|canned/i.test(name)){
  kind='canned';color='#579995';art=<><path d="M22 18h44v39c0 10-44 10-44 0Z" fill="#e1f0ec"/><ellipse cx="44" cy="18" rx="22" ry="7" fill="#f1f7f5"/><ellipse cx="44" cy="18" rx="17" ry="4"/><path d="M22 29c10 5 34 5 44 0v20c-11 6-33 6-44 0Z" fill="var(--product-ink)" stroke="none"/><rect x="30" y="33" width="28" height="13" rx="5" fill="#f8d5bf"/><path d="M35 36h18m-16 5h14" stroke="#b7846b"/><ellipse cx="44" cy="17" rx="5" ry="1.5"/></>;
 }else if(/猪蹄|豬蹄|蹄髈|肘子/i.test(name)){
  kind='knuckle';color='#ad744d';art=<><ellipse cx="44" cy="57" rx="32" ry="7" fill="#edf3ed" stroke="#c3d7d1"/><path d="m25 43 9-10 19 12-6 11c-13 3-24-3-22-13Z" fill="#b97d52"/><path d="m33 33 8-11 18 4 10 17-15 9Z" fill="#d69a66"/><path d="m41 22-2-7c-6 0-5-7 0-7 3-5 9-1 6 4l5 11" fill="#fff4dc"/><path d="m42 35 14 9m-16-3 9 6" stroke="#9d603e"/><path d="m17 53 8-2m36 6 9-3" stroke="#639878"/></>;
 }else if(/牛肉|牛腱|beef/i.test(name)){
  kind='beef';color='#9f6451';art=<><ellipse cx="44" cy="56" rx="33" ry="8" fill="#eef4ef" stroke="#bfd6cc"/>{[0,1,2,3].map(i=><g key={i} transform={`translate(${i*9} ${-i*3})`}><path d="M20 34c-4-11 14-18 23-8l7 17c-3 9-23 10-28 1Z" fill={i%2?'#b87d5e':'#cb9170'}/><path d="m26 32 9 12m-4-16 11 14" stroke="#edc4a0"/></g>)}<path d="m16 53 9 4m-4-8 4 8-8 1m44-3 11-3m-5-2-1 8" stroke="#62956b"/></>;
 }else if(/火腿|ham/i.test(name)){
  kind='ham';color='#c57986';art=<><path d="M30 15c9-9 33-5 33 6v27c0 13-37 13-37 0V23Z" fill="#e3a2aa"/><ellipse cx="44" cy="25" rx="18" ry="14" fill="#efbdc1"/><path d="M19 38c7-10 30-10 34 2l-3 18c-7 9-32 4-34-5Z" fill="#f4cbd0"/><path d="M15 44c7-10 30-10 34 2l-3 16c-8 7-31 1-33-6Z" fill="#f8d9db"/><path d="m24 47 2 1m10 2 2-1m-15 9 3 1m14-3 1 2m4-38 2 2m8 3 2-1" stroke="#d599a0"/></>;
 }else if(/肠|腸|sausage/i.test(name)){
  kind=/早餐/.test(name)?'breakfast':/烤/.test(name)?'grilled':'sausage';
  color=/鸡|雞/.test(name)?'#d3a067':/玉米/.test(name)?'#d6a048':/蒜/.test(name)?'#be878b':/辣/.test(name)?'#c66d57':'#c48470';
  art=<><rect x="10" y="12" width="68" height="50" rx="13" fill="#f0f5ef" stroke="#c7dad2"/>{(kind==='breakfast'?[0,1,2]:[0,1]).map((i)=><g key={i} transform={`translate(${kind==='breakfast'?i*17:i*25} 0)`}><path d="m25 18-4-6m4 6 4-5m-4 42-4 5m4-5 4 4"/><rect x="17" y="18" width="16" height="37" rx="8" fill="var(--product-ink)"/><path d="M21 26v17" stroke="#fff0d2" strokeWidth="2.5"/>{kind==='grilled'&&<path d="m25 26 5 4m-5 5 5 4m-5 5 5 4" stroke="#935a40"/>}</g>)}{/玉米/.test(name)&&<g fill="#f0c746" stroke="#bb9136"><ellipse cx="65" cy="48" rx="5" ry="9"/><path d="M65 41v14m-4-9h8m-8 5h8"/></g>}{/辣/.test(name)&&<><path d="M66 42c5 11 2 15-7 16 5-5 3-9 2-12Z" fill="#ce6650"/><path d="m64 43 2-5" stroke="#659a76"/></>}{/蒜/.test(name)&&<><path d="M63 43c0 5-8 7-6 12 3 6 16 3 15-3-1-4-6-4-5-9Z" fill="#f5e5d7"/><path d="M64 47c-3 4-3 8-1 11m2-11 3 10"/></>}</>;
 }else{
  art=<><path d="M23 12h42l-3 7 5 8v36H21V27l5-8Z" fill="#e5f0e9" stroke="#80a59a"/><rect x="28" y="29" width="32" height="23" rx="5" fill="#f8e2bd"/><path d="M29 19h30m-32 39h34M38 37h13m-13 6h13" stroke="#8aaa9c"/></>;
 }
 return <svg className="bom-product-icon" viewBox="0 0 88 72" fill="none" stroke="var(--product-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-product-icon={kind} style={{'--product-ink':color} as CSSProperties}>{art}</svg>;
}
