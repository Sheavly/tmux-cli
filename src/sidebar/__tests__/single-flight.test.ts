import assert from 'node:assert/strict';
import { test } from 'node:test';
import { singleFlight } from '../single-flight.ts';

function gate(): { open: () => void; wait: () => Promise<void> } {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });

  return { open, wait: () => opened };
}

test('a call made while the task runs never starts a second run beside it', async () => {
  let active = 0;
  let peak = 0;
  let runs = 0;
  const first = gate();
  const flight = singleFlight(async () => {
    runs += 1;
    active += 1;
    peak = Math.max(peak, active);

    if (runs === 1) await first.wait();

    active -= 1;
  });
  const calls = [flight(), flight(), flight()];

  first.open();
  await Promise.all(calls);

  assert.equal(peak, 1);
  assert.equal(runs, 2, 'the calls made meanwhile share one run after the first');
});

test('a call after the task has finished starts a new run', async () => {
  let runs = 0;
  const flight = singleFlight(async () => {
    runs += 1;
  });

  await flight();
  await flight();

  assert.equal(runs, 2);
});

test('a task that fails does not stop the calls waiting for it', async () => {
  let runs = 0;
  const flight = singleFlight(async () => {
    runs += 1;

    if (runs === 1) throw new Error('first run failed');
  });
  const failing = flight();
  const waiting = flight();

  await assert.rejects(failing, /first run failed/);
  await waiting;

  assert.equal(runs, 2);
});
