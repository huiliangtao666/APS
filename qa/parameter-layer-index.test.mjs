import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceIntervals,parameterThreeWay} from '../server/parameter-layers.mjs';
import {semanticIdentity,sourceRole,scopeOf,layerIdentity} from '../server/parameter-contract.mjs';
const row=(id,role,from=0,to=44,scope='dataset',object='SUP')=>({'参数编号':id,'对象编号':object,'参数名称':'检验天数','参数值':'2','单位':'天','生效日':String(from),'失效日':String(to),_cp:'CP074',_sourceRole:role,_scope:scope});
test('indexed interval replacement preserves exact row order, source intervals and unrelated scopes',()=>{
 const b=row('B','B'),p=row('P','P'),trial=row('T','P',0,44,'trial:own'),edit=row('E','EDIT'),other=row('O','P',0,44,'dataset','OTHER'),n=row('N','P',10,20),n2=row('N2','P',12,15);
 const before=structuredClone([b,p,trial,edit,other]),result=replaceIntervals([b,p,trial,edit,other],[n,n2]);
 assert.deepEqual(result.map(p=>[p['参数编号'],p['生效日'],p['失效日'],p._sourceInterval??null]),[
 ['B','0','44',null],['P','0','10',['0','44']],['P','20','44',['0','44']],['T','0','44',null],['E','0','44',null],['O','0','44',null],['N','10','12',['10','20']],['N','15','20',['10','20']],['N2','12','15',null]]);
 assert.deepEqual([b,p,trial,edit,other],before);
});
test('indexed three-way matching retains B inheritance, exact P/EDIT scope and half-open boundaries',()=>{
 const values=[row('B','B'),row('P','P'),row('PT','P',0,44,'trial:own'),row('E','EDIT',5,15),row('EDGE','P',20,44),row('O','P',0,44,'dataset','OTHER')];
 const d={tables:{'配置参数':values,'供应商与供货条件':[{'供货关系编号':'SUP'}]}};
 const out=parameterThreeWay(d,[row('N','P',15,20),row('NT','P',10,12,'trial:own')]);
 const ids=x=>x.map(r=>r['参数编号']);
 assert.deepEqual(out.map(r=>[ids(r.business),ids(r.previousP),ids(r.online)]),[[['B'],['P'],[]],[['B'],['PT'],[]]]);
 assert.equal(out[0].nextP,'2');assert.equal(out[1].semantic,out[0].semantic);
 // A later call sees mutated identities; no cache may escape one operation.
 values[1]['对象编号']='OTHER';
 assert.deepEqual(ids(parameterThreeWay(d,[row('N','P',15,20)])[0].previousP),[]);
});
