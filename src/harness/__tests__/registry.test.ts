import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADAPTER_SETTING_KEYS, DEFAULT_ADAPTER, createAdapter } from '../index.ts';

test('the config accepts the keys the registered adapters declare', () => {
  assert.deepEqual([...ADAPTER_SETTING_KEYS].sort(), ['command', 'harnessDir', 'mode']);
});

test('every registered adapter refuses a setting it does not declare', () => {
  for (const name of [DEFAULT_ADAPTER, 'sheavly-v2']) {
    assert.throws(
      () => createAdapter({ name, settings: { nope: 'x' }, env: {}, home: '/tmp' }),
      /"nope" is not read by/,
    );
  }
});
