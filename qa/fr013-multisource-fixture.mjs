import {configFixture,mapping} from './fr013-config-fixture.mjs';
import {originalResourceDefs} from '../src/lib/original-resources.mjs';
export function multiFixture(kind='tool'){
 const d=configFixture(kind),key=kind==='tool'?'originalTools':'originalPersonnel',id=kind==='tool'?'资源编号':'人员组编号';
 const first=d[key][0],second={...first,[id]:first[id]+'-SECOND'};
 if(kind==='tool')second['资源名称']='第二来源名称';
 d[key].push(second);d.resourceMappings.push(mapping(key,second,d[kind==='tool'?'tools':'personnelGroups'][0]));
 const group=d.resourceMappings.filter(m=>m['来源类别']===key&&m['运行编号']===d.resourceMappings[0]['运行编号']);
 const a=Object.fromEntries(originalResourceDefs.find(x=>x.key===key).fields.slice(1).map((field,i)=>[field,{'配置编号':group[i%2]['配置编号'],'配置版本':'1'}]));
 for(const m of group)Object.assign(m,{'合同版本':'FR013-resource-map-v2','映射模式':'EXPLICIT_SAME_ENTITY','字段权威JSON':JSON.stringify(a)});
 return d;
}
