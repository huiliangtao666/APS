import {r4Scenario} from './r4-fixture.mjs';
import {claim,enableJoint} from './joint-fixture.mjs';
// Explicit, replaceable software mock, derived from v0.3 UAT12/AC14 and
// r4Scenario('12'). PACK50, skill/group/tool identities and dates are mock
// supplements, not approved customer defaults. All resource rules stay enabled.
export function maxLagFixture(){
 const d=r4Scenario('12');
 d.tools=[{'工装编码':'MAXLAG-T','工装名称':'等待契约显式模拟工装','适用任务':'HEAT','可用数量':'1','每任务需求数量':'1','提前占用分钟':'0','后延占用分钟':'0','是否启用':'是','说明':'可替换软件mock，非现场默认','可用起始分钟':'0','可用结束分钟':'600'}];
 d.resourceClaims.push(claim('MAXLAG-HEAT','A','HEAT','MAXLAG-T'));
 enableJoint(d,'MOLD');
 d.personnelGroups=[{'人员组编号':'MAXLAG-G','人员组名称':'等待契约模拟技能组','人员数量':'1','技能':'HEAT','班次':'D','可用起始分钟':'0','可用结束分钟':'600'}];
 d.dependencies.push({'订单编号':'A','工序编号':'HEAT','资源类型':'人员技能','资源编号':'MAXLAG-G','需求数量':'1','所需技能':'HEAT','所需班次':'D','人员开始偏移':'0','人员结束偏移':'0','提前占用分钟':'0','后延占用分钟':'0'});
 d.rules.find(r=>r['规则编号']==='LABOR')['是否启用']='是';
 return d;
}
