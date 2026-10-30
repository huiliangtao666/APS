import {seed} from '../server/planner.ts';
export function skillInput(){const d=structuredClone(seed);d.personnelGroups=[{'人员组编号':'G1','技能':'KNOWN OTHER','人员组名称':'QA组','可用起始分钟':'0','可用结束分钟':'1000','人员数量':'2','班次':'白班'}];d.skillSubstitutions=[{'关系编号':'REL','可提供技能':'MISSING','所需技能':'KNOWN','适用工序':'*','是否启用':'是'}];return d;}
