import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTypedPath } from '../typed-path.utils.ts';

const resolve = (typed: string) =>
  resolveTypedPath({ dir: '/home/me/code', typed, home: '/home/me' });

test('an absolute path is taken as it is', () => {
  assert.equal(resolve('/etc/nginx'), '/etc/nginx');
});

test('~ is the home folder, alone or at the start of a path', () => {
  assert.equal(resolve('~'), '/home/me');
  assert.equal(resolve('~/projects/x'), '/home/me/projects/x');
});

test('a path that is not absolute starts from the folder shown, and .. goes up', () => {
  assert.equal(resolve('app/src'), '/home/me/code/app/src');
  assert.equal(resolve('../other'), '/home/me/other');
  assert.equal(resolve('.'), '/home/me/code');
});

test('spaces around the path are not part of it, and a trailing slash is dropped', () => {
  assert.equal(resolve('  /var/log/  '), '/var/log');
});

test('a ~ in the middle or a ~name is an ordinary name, not the home folder', () => {
  assert.equal(resolve('a/~'), '/home/me/code/a/~');
  assert.equal(resolve('~other'), '/home/me/code/~other');
});
