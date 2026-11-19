import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTmuxVersion, tmuxVersionProblem } from '../tmux-version.utils.ts';

test('the version is read from what tmux -V prints, whatever the build calls itself', () => {
  assert.deepEqual(parseTmuxVersion('tmux 3.4'), { major: 3, minor: 4 });
  assert.deepEqual(parseTmuxVersion('tmux 3.3a\n'), { major: 3, minor: 3 });
  assert.deepEqual(parseTmuxVersion('tmux next-3.5'), { major: 3, minor: 5 });
  assert.deepEqual(parseTmuxVersion('tmux 3.10'), { major: 3, minor: 10 });
  assert.equal(parseTmuxVersion('tmux master'), undefined);
});

test('a tmux before 3.3 is refused with the version it is, and a newer one is not', () => {
  assert.match(tmuxVersionProblem('tmux 3.2a') ?? '', /needs tmux 3\.3 or newer, and this is 3\.2/);
  assert.match(tmuxVersionProblem('tmux 2.9') ?? '', /this is 2\.9/);
  assert.equal(tmuxVersionProblem('tmux 3.3'), undefined);
  assert.equal(tmuxVersionProblem('tmux 3.3a'), undefined);
  assert.equal(tmuxVersionProblem('tmux 3.7c'), undefined);
  assert.equal(tmuxVersionProblem('tmux 4.0'), undefined);
});

test('a build that names no version is let through: it is not ours to turn away', () => {
  assert.equal(tmuxVersionProblem('tmux master'), undefined);
});
