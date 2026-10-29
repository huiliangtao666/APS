import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {editCsvDraft} from '../src/lib/csv-draft.mjs';
const visible = s => s.replace(/\r\n?/g, '\n');
const read = name => fs.readFileSync(new URL('./raw01-independent/' + name, import.meta.url), 'utf8');

test('RAW01 exact independent original/expected bytes: two corrections around untouched fields', () => {
 const original = read('original-machines.csv'), expected = read('expected-corrected-machines.csv');
 assert.equal(expected, original.replace('START', 'CHANGED').replace('"bad"', '"1200"'));
 assert.notEqual(read('actual-corrected-machines.csv'), expected); // Test's original observed defect.
 assert.equal(editCsvDraft(original, visible(expected)), expected);
});

for (const [label, nl] of [['CR', '\r'], ['LF', '\n'], ['CRLF', '\r\n'], ['mixed', '\r\n']]) {
 const body = label === 'mixed' ? 'keep\r同一,""引号""\n🧪é\r\nlast' : ['keep', '同一,""引号""', '🧪é', 'last'].join(nl);
 const original = ['id,name,value', 'A,"START' + nl + body + '",2', 'B,"' + body + '",bad', 'C,"' + body + '",5', 'END,tail,7', ''].join(nl);
 test('RAW01 no-change / local / multi corrections, commas quotes Unicode and intermediate fields: ' + label, () => {
  assert.equal(editCsvDraft(original, visible(original)), original);
  for (const expected of [original.replace('bad', '1200'), original.replace('START', 'CHANGED').replace('bad', '1200'), original.replace('START', 'CHANGED').replace('bad', '1200').replace('tail', 'changed🧬')]) {
   assert.equal(editCsvDraft(original, visible(expected)), expected);
  }
 });
 test('RAW01 deletes / inserts / pasted multiline content retain unchanged raw spans: ' + label, () => {
  const cases = [original.replace('START', ''), original.replace('START' + nl, ''), original.replace('START', 'new\ntext'), original.replace('START', 'START🚀'), original.replace('START', '').replace('bad', '1200'), original.replace('START', 'pasted\n""with,quotes""\n文本').replace('bad', '1200'), '\n' + original, original.replace('END,tail,7' + nl, '')];
  for (const expected of cases) assert.equal(editCsvDraft(original, visible(expected)), expected);
  assert.equal(editCsvDraft(original, ''), '');
  assert.equal(editCsvDraft('', 'brand\nnew'), 'brand\nnew');
 });
}

test('RAW01 repeated identical visible chunks keep their separate raw CR/LF/CRLF mappings', () => {
 const original = 'START,"same\rsame\nsame\r\nsame",bad\r\nSTART,"same\nsame\r\nsame\rsame",bad\n';
 for (const expected of [original.replaceAll('START', 'CHANGED').replaceAll('bad', '1200'), original.replace('START', 'CHANGED').replace(/bad\n$/, '1200\n'), original.replace('START', '').replace(/bad\n$/, '1200\n')]) assert.equal(editCsvDraft(original, visible(expected)), expected);
});

test('RAW01 sequential edits and inserted LF do not impose a newline style', () => {
 const original = 'A,"START\rKEEP\nKEEP\r\nKEEP",bad\r\n';
 const first = original.replace('START', 'CHANGED');
 const second = first.replace('bad', '1200\nNEW');
 assert.equal(editCsvDraft(editCsvDraft(original, visible(first)), visible(second)), second);
 assert.equal(editCsvDraft(second, visible(second)), second);
 const third = second.replace('CHANGED', '好🧪').replace('NEW', 'last');
 assert.equal(editCsvDraft(second, visible(third)), third);
});

test('RAW01 deterministic edit matrix around uniquely anchored mixed raw blocks', () => {
 for (let i = 0; i < 300; i++) {
  const original = 'START_' + i + ',"中\rrepeat\nrepeat\r\n🧪,""quote""",bad_' + i + '\r\n';
  const expected = original.replace('START_', i % 2 ? 'CHANGED_' : '').replace('bad_', i % 3 ? '1200_' : 'new\nvalue_');
  assert.equal(editCsvDraft(original, visible(expected)), expected, 'case ' + i);
 }
});

test('RAW01 exhaustive short visible replacements always reconstruct the requested value', () => {
 const strings = [''];
 for (let length = 1; length <= 4; length++) {
  for (const prefix of strings.filter(s => s.length === length - 1)) for (const char of ['a', 'b', '\n']) strings.push(prefix + char);
 }
 for (const before of strings) for (const after of strings) {
  const original = before.replace(/\n/g, '\r\n');
  assert.equal(visible(editCsvDraft(original, after)), after);
 }
});
