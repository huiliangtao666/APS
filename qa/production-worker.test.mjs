import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { freezeRunInput } from '../server/run-input.mjs';
import { n06Fixture, selection } from './n06-fixture.mjs';

test('published calculation worker returns a real scheduling result', { timeout: 15000 }, async () => {
  const calculatedAt = '2026-10-30T00:00:00Z';
  const frozen = freezeRunInput(n06Fixture(), selection, calculatedAt);
  const worker = new Worker(new URL('../dist/calculation-worker.mjs', import.meta.url), {
    workerData: { executionData: frozen.executionData, conditions: frozen.conditions, revision: 0, calculatedAt },
  });
  try {
    const result = await new Promise((resolve, reject) => {
      worker.on('error', reject);
      worker.on('exit', code => reject(new Error(`worker exited before result: ${code}`)));
      worker.on('message', message => {
        if (message.kind === 'result') resolve(message.plan);
        else if (message.kind === 'failure') reject(new Error(message.code));
      });
    });
    assert.ok(result.tasks.length > 0);
    assert.ok(result.tasks.some(task => Number.isFinite(task.start) && Number.isFinite(task.end) && task.end > task.start && task.machine));
  } finally {
    await worker.terminate();
  }
});
