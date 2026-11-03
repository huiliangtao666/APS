import test from 'node:test';
import assert from 'node:assert/strict';
import {parameterView} from '../server/parameter-contract.mjs';
const row=(id,role,value,from=0,to=44,scope='dataset',object='SUP')=>({'参数编号':id,'对象编号':object,'对象名称':object,'参数名称':'检验天数','参数值':value,'单位':'天','生效日':String(from),'失效日':String(to),_cp:'CP074',_sourceRole:role,_scope:scope});
const fixture=()=>({id:'VIEW-INDEX',version:2,parameterContract:'CR-PARAM-UI-20261101:r1',parameterTrials:[{id:'own',actor:'A'}],tables:{'供应商与供货条件':[{'供货关系编号':'SUP','检验天数':'9'},{'供货关系编号':'OTHER','检验天数':'7'}],'配置参数':[row('B','B','1'),row('P','P','2'),row('E','EDIT','3',5,15),row('FUTURE','P','4',44,50),row('TRIAL','EDIT','0',5,15,'trial:own'),row('OTHER','P','6',0,44,'dataset','OTHER')]}});
test('parameter view keeps effective winners, first-source values, aliases, scope and half-open boundaries',()=>{
 const d=fixture(),original=structuredClone(d);
 for(const [day,scope,value]of [[4,'dataset','2'],[5,'dataset','3'],[14,'dataset','3'],[15,'dataset','2'],[5,'trial:own','0']]){
  const view=parameterView(d,{day,scope,cp:'CP063',object:'SUP'},'A');assert.equal(view.total,scope==='dataset'?4:5);
  for(const r of view.records){assert.equal(r.businessValue,'1');assert.equal(r.parameterValue,'2');assert.equal(r.effectiveValue,value);assert.equal(r.baseValue,day>=5&&day<15?'3':'2');}
  assert.equal(view.records.filter(r=>r.status==='当前有效').length,1);assert.equal(view.records.find(r=>r['参数编号']==='FUTURE').status,'未来生效');
 }
 const edge=parameterView(d,{day:44,cp:'CP074',object:'SUP'},'A');assert.equal(edge.records[0].businessValue,undefined);assert.equal(edge.records[0].parameterValue,'4');assert.equal(edge.records[0].effectiveValue,'4');
 assert.deepEqual(d,original);
});
test('source projection retains first same-source record, candidate disposition, pagination and fresh identities after mutation',()=>{
 const d=fixture();d.tables['配置参数'].splice(2,0,row('P-FIRST-TIE','P','8'));
 d.parameterCandidates=[{...row('C','P','5'),_candidate:true}];
 const first=parameterView(d,{day:1,cp:'CP074',object:'SUP',limit:2},'A');assert.equal(first.total,6);assert.equal(first.records[0].parameterValue,'2');assert.equal(first.records[0].effectiveValue,'8');
 const all=[];for(let offset=0;offset<first.total;offset+=2)all.push(...parameterView(d,{day:1,cp:'CP074',object:'SUP',limit:2,offset},'A').records);
 assert.deepEqual(all.map(r=>r['参数编号']),['B','P','P-FIRST-TIE','E','FUTURE','C']);assert.equal(all.at(-1).status,'候选，未启用');
 d.tables['配置参数'][1]['对象编号']='OTHER';d.tables['配置参数'][2]['参数值']='10';
 const changed=parameterView(d,{day:1,cp:'CP074',object:'SUP'},'A');assert.equal(changed.total,5);assert.equal(changed.records[0].parameterValue,'10');assert.equal(changed.records[0].effectiveValue,'10');
});
