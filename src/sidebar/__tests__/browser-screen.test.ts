import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserItems } from '../browser-screen.ts';
import type { Browser } from '../sidebar.types.ts';

const browser = (over: Partial<Browser>): Browser => ({
  kind: 'browse',
  dir: '/home/me',
  dirs: ['alpha', 'beta', 'project-x'],
  cursor: 0,
  scrollTop: 0,
  showHidden: false,
  query: '',
  filtering: false,
  typedPath: undefined,
  ...over,
});

test('with no filter the browser lists .. and every folder', () => {
  assert.deepEqual(browserItems(browser({})), ['..', 'alpha/', 'beta/', 'project-x/']);
});

test('a folder at the root has no .. to go up to', () => {
  assert.deepEqual(browserItems(browser({ dir: '/', dirs: ['usr'] })), ['usr/']);
});

test('a filter keeps the folders whose letters appear in order, best match first, and drops ..', () => {
  assert.deepEqual(browserItems(browser({ query: 'pjx' })), ['project-x/']);
  assert.deepEqual(browserItems(browser({ query: 'A' })), ['alpha/', 'beta/']);
  assert.deepEqual(browserItems(browser({ query: 'zzz' })), []);
});

test('a filter of only spaces filters nothing', () => {
  assert.deepEqual(browserItems(browser({ query: '  ' })), ['..', 'alpha/', 'beta/', 'project-x/']);
});
