
function minuteText(day){const m=Math.round(day*1440),d=new Date(zeroTime+m*60000);return d.toISOString().slice(0,16).replace('T',' ').replaceAll('-','.');}
function axisHTML(){
 if(s.timeScale!=='halfHour'||!['gantt','orders'].includes(s.view))return dayAxisHTML();
 const n=s.filters.to-s.filters.from+1;
 return `<div class="axis"><div class="axis-meta">${visibleMeta().map(c=>`<span>${esc(c.label)}</span>`).join('')}<span>半小时刻度</span></div><div class="minute-axis" style="--ticks:${n*48}">${Array.from({length:n*48},(_,i)=>{const day=s.filters.from+Math.floor(i/48),m=(i%48)*30;return `<span title="${dateText(day)} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}">${m===0?dateISO(day).slice(5)+' ':''}${String(Math.floor(m/60)).padStart(2,'0')}:${m%60?'30':'00'}</span>`;}).join('')}</div></div>`;
}
