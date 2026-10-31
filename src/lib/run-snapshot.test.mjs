import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRunSnapshot } from './run-snapshot.mjs';

test('completed run is read before its plan so fast calculation cannot lose the result', async () => {
  const calls = [];
  let completed = false;
  const snapshot = await loadRunSnapshot(async path => {
    calls.push(path);
    if (path === '/runs') {
      await Promise.resolve();
      completed = true;
      return [{ id: 'run', status: 'completed', planId: 'plan' }];
    }
    return completed ? [{ id: 'plan', tasks: [{ id: 'task' }] }] : [];
  });
  assert.deepEqual(calls, ['/runs', '/plans']);
  assert.equal(snapshot.list[0].id, snapshot.history[0].planId);
});

test('failed run remains visible even when there is no plan', async () => {
  const snapshot = await loadRunSnapshot(async path => path === '/runs' ? [{ status: 'failed', failure: { message: 'thread failed' } }] : []);
  assert.equal(snapshot.history[0].failure.message, 'thread failed');
  assert.deepEqual(snapshot.list, []);
});
