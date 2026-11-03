import {useState,type CSSProperties} from 'react';
import type {QueryColumn} from './QueryReportsTypes';
import './EquipmentChartControls.css';
export type ChartField=QueryColumn&{width:number};
type Aliases=Record<string,string[]>;
export function normalizeChartColumns(columns:QueryColumn[],value:unknown,aliases:Aliases={}){
 if(!Array.isArray(value))return columns.map(c=>c.key);
 const keys=new Set(value.filter(v=>typeof v==='string').flatMap(key=>aliases[key]||[key]));
 return columns.filter(c=>c.fixed||keys.has(c.key)).map(c=>c.key);
}
export function chartFieldLayout(columns:ChartField[],visible:string[]){const fields=columns.filter(c=>c.fixed||visible.includes(c.key));return {fields,width:fields.reduce((n,c)=>n+c.width,0),template:fields.map(c=>c.width+'px').join(' ')};}
export function chartFieldText(value:unknown){return value===null||value===undefined||value===''?'—':String(value);}
export function ChartFieldCells({columns,visible,values={},height,header=false,onOpen,label}:{columns:ChartField[];visible:string[];values?:Record<string,unknown>;height?:number;header?:boolean;onOpen?:()=>void;label?:string}){
 return <>{chartFieldLayout(columns,visible).fields.map((c,i)=>{const text=header?c.label:chartFieldText(values[c.key]),props={'data-chart-field':c.key,'data-chart-header':header?'true':undefined,className:'chart-field-cell'+(i===0?' chart-field-id':''),title:text,style:{height} as CSSProperties};return !header&&i===0&&onOpen?<button {...props} key={c.key} type="button" aria-label={label} onClick={onOpen}>{text}</button>:<span {...props} key={c.key}>{text}</span>;})}</>;
}
export function ChartTableFields({columns,visible,values={},header=false}:{columns:ChartField[];visible:string[];values?:Record<string,unknown>;header?:boolean}){
 return <>{chartFieldLayout(columns,visible).fields.map((c,i)=>{const text=header?c.label:chartFieldText(values[c.key]),props={'data-chart-field':c.key,title:text,style:{width:c.width,minWidth:0,maxWidth:c.width}};return header?<th {...props} scope="col" key={c.key}>{text}</th>:i===0?<th {...props} scope="row" key={c.key}>{text}</th>:<td {...props} key={c.key}>{text}</td>;})}</>;
}
export function useChartColumns(scope:string,view:string,columns:QueryColumn[],aliases:Aliases={}){
 const key='aps-equipment-chart:r2:'+scope+':'+view,legacy='aps-equipment-chart:r1:'+scope+':'+view;
 const [visible,setVisible]=useState<string[]>(()=>{try{const saved=localStorage.getItem(key);return saved!==null?normalizeChartColumns(columns,JSON.parse(saved)):normalizeChartColumns(columns,JSON.parse(localStorage.getItem(legacy)||'null'),aliases);}catch{}return columns.map(c=>c.key);});
 function save(value:string[]){const next=normalizeChartColumns(columns,value);setVisible(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{}}
 return {visible,save};
}
export function chartDate(day:number,zero:string){return new Date(Date.parse(zero+'T00:00:00Z')+day*86400000).toISOString().slice(0,10);}
export function EquipmentGanttAxis({heading,fields,visible=[],from,to,focusDay,onDay,width,dayZero}:{heading?:string;fields?:ChartField[];visible?:string[];from:number;to:number;focusDay:number|null;onDay:(day:number)=>void;width:number;dayZero:string}){
 const count=focusDay===null?to-from:48;
 return <div className="equipment-axis">{fields?<ChartFieldCells columns={fields} visible={visible} header/>:<b>{heading} / {focusDay===null?'日期':'半小时'}</b>}<div style={{width}}>{Array.from({length:count},(_,i)=><button key={i} style={{left:(i/count*100)+'%',width:(100/count)+'%'}} onClick={()=>focusDay===null&&onDay(from+i)} disabled={focusDay!==null} title={focusDay===null?'点击查看 '+chartDate(from+i,dayZero)+' 的半小时刻度':undefined}>{focusDay!==null?String(Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00'):chartDate(from+i,dayZero).slice(5).replace('-','.')}</button>)}</div></div>;
}
