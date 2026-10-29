import test from 'node:test';import assert from 'node:assert/strict';import {editCsvDraft} from './csv-draft.mjs';
test('CSV correction preserves untouched CRLF, CR and mixed physical newlines despite textarea normalization',()=>{
 const original='name,value\r\n"first\rsecond\nthird",bad\r\n';const dom=original.replace(/\r\n?/g,'\n');assert.equal(editCsvDraft(original,dom),original);assert.equal(editCsvDraft(original,dom.replace('bad','12')),original.replace('bad','12'));assert.equal(editCsvDraft(original,dom.replace('bad','12\nnew')),original.replace('bad','12\r\nnew'));
});
