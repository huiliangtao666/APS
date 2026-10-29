import test from 'node:test';
import assert from 'node:assert/strict';
import {related} from './data-query.mjs';
import {skillMatch} from './resource-policies.mjs';
const relation={'关系编号':'REL1','可提供技能':'fill','所需技能':'pack','适用工序':'*','是否启用':'是'};
const data={skillSubstitutions:[relation],personnelGroups:[{'人员组编号':'GROUP1','技能':'fill'},{'人员组编号':'PACK1','技能':'pack'},{'人员组编号':'EMPTY','技能':''},{'人员组编号':'SUBSTRING','技能':'refill packing'},{'人员组编号':'MULTI','技能':'other,fill；pack'}],machines:[{'设备编号':'GROUP1','技能':'fill'}],tools:[{'工装编码':'GROUP1','技能':'fill'}],routes:[{'产品编号':'P1','工序编号':'OP1'},{'产品编号':'P2','工序编号':'OP2'}]};
test('REL1 locates declared skill groups by exact tokens, never unrelated resources or wildcard operations',()=>{
 const before=structuredClone(data),links=related(data,'skillSubstitutions',0);
 assert.deepEqual(links.map(l=>data[l.table][l.index]['人员组编号']),['GROUP1','PACK1','MULTI']);
 assert.equal(links[0].label,'声明可提供技能');assert.equal(links[1].label,'声明所需技能');assert.equal(links[2].label,'声明可提供技能 / 声明所需技能');
 assert.equal(related(data,'personnelGroups',0)[0].table,'skillSubstitutions');
 assert.deepEqual(related(data,'personnelGroups',2),[]);assert.deepEqual(related(data,'personnelGroups',3),[]);
 assert.deepEqual(related({...data,skillSubstitutions:[{...relation,'可提供技能':'','所需技能':' \t'}]},'skillSubstitutions',0),[]);
 assert.deepEqual(related({...data,skillSubstitutions:[{...relation,'可提供技能':'missing','所需技能':'absent'}]},'skillSubstitutions',0),[]);
 assert.deepEqual(data,before);
});
test('only existing explicit operation references navigate, including disabled declarations without changing matching direction',()=>{
 const scoped={...data,skillSubstitutions:[{...relation,'适用工序':'OP1','是否启用':'否'}]};
 assert.equal(related(scoped,'skillSubstitutions',0).filter(l=>l.table==='routes').length,1);
 assert.equal(related(scoped,'routes',0).filter(l=>l.table==='skillSubstitutions').length,1);
 assert.equal(related(scoped,'routes',1).filter(l=>l.table==='skillSubstitutions').length,0);
 assert.ok(skillMatch(data.personnelGroups[0],'pack','OP1',[relation]));
 assert.equal(skillMatch(data.personnelGroups[1],'fill','OP1',[relation]),null);
 assert.equal(skillMatch(data.personnelGroups[0],'pack','OP1',scoped.skillSubstitutions),null);
 assert.equal(related({...data,skillSubstitutions:[{...relation,'适用工序':'missing'}]},'skillSubstitutions',0).some(l=>l.table==='routes'),false);
});
