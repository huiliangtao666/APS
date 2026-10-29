import {jointEnabledFixture} from './r01r02-fixture.mjs';
export const work=(a,b,yes='是')=>({'日历编号':'FC01','工厂编号':'F01','起始分钟':String(a),'结束分钟':String(b),'是否工作':yes,'说明':'P06合成断言，非现场值'});
export const stop=(type,id,a,b,n='E1')=>({'例外编号':n,'资源类型':type,'资源编号':id,'起始分钟':String(a),'结束分钟':String(b),'原因':'P06显式合成停用'});
export function p06Fixture(){const d=jointEnabledFixture();d.resourceStops=[];d.calendars=[work(0,40),work(60,240)];return d;}
