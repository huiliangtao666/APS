import {useState} from 'react';
import type {QueryColumn} from './QueryReportsTypes';
export function useChartColumns(scope:string,view:string,columns:QueryColumn[]){
 const key='aps-equipment-chart:r1:'+scope+':'+view;
 const [visible,setVisible]=useState<string[]>(()=>{try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(saved))return columns.filter(c=>c.fixed||saved.includes(c.key)).map(c=>c.key);}catch{}return columns.map(c=>c.key);});
 function save(value:string[]){setVisible(value);try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
 return {visible,save};
}
export function chartDate(day:number,zero:string){return new Date(Date.parse(zero+'T00:00:00Z')+day*86400000).toISOString().slice(0,10);}
export function EquipmentGanttAxis({heading,from,to,focusDay,onDay,width,dayZero}:{heading:string;from:number;to:number;focusDay:number|null;onDay:(day:number)=>void;width:number;dayZero:string}){
 const count=focusDay===null?to-from:48;
 return <div className="equipment-axis"><b>{heading} / {focusDay===null?'日期':'半小时'}</b><div style={{width}}>{Array.from({length:count},(_,i)=><button key={i} style={{left:(i/count*100)+'%',width:(100/count)+'%'}} onClick={()=>focusDay===null&&onDay(from+i)} disabled={focusDay!==null} title={focusDay===null?'点击查看 '+chartDate(from+i,dayZero)+' 的半小时刻度':undefined}>{focusDay!==null?String(Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00'):chartDate(from+i,dayZero).slice(5).replace('-','.')}</button>)}</div></div>;
}
