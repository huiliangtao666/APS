import {seed} from '../server/planner.ts';
import {executionFixture} from './execution-fixture.mjs';
export function u3Resource(){const d=structuredClone(seed);d.batchResources=[{'资源编号':'MIX01','资源类型':'批处理装载','容量':'1','单位':'kg','允许程序':'P'}];return d;}
export function u3Consumption(){const d=executionFixture(seed);d.executionMaterials=[{...d.executionMaterials[0],'累计已用数量':'60'},{...d.executionMaterials[0],'记录编号':'C2','事实编号':'MISSING','累计已用数量':'60'},{...d.executionMaterials[0],'记录编号':'UNRELATED','批次编号':'UNRELATED','累计已用数量':'9'}];return d;}
