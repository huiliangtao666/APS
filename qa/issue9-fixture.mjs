import {materialFixture} from './material-fixture.mjs';import {seed} from '../server/planner.ts';
export const at='2026-11-02T08:00:00+08:00';
export function stockData(){const d=materialFixture(seed);Object.assign(d.inventory[0],{'账面数量':'400','已占用数量':'100'});for(const state of ['待检','冻结','不合格','未配置模拟状态'])d.inventory.push({...d.inventory[0],'批次编号':'BLOCK-'+state,'质量状态':state,'账面数量':'9999','已占用数量':'0'});return d;}
