import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInputCsv} from './input-csv.mjs';
test('FR015 strict CSV preserves quoted commas/newlines/escaped quotes, units and trailing blanks',()=>{
 assert.deepEqual(parseInputCsv('\ufeff编号,名称,单位,空值\r\nA,"模拟,测试\n第二行""引号",kg,\r\n'),[['编号','名称','单位','空值'],['A','模拟,测试\n第二行"引号','kg','']]);
});
test('FR015 malformed quotes fail with physical line instead of silently changing imported values',()=>{
 for(const csv of ['编号\n"未闭合','编号\nabc"def','编号\n"已结束"坏值'])assert.throws(()=>parseInputCsv(csv),/CSV 第2行/);
});
