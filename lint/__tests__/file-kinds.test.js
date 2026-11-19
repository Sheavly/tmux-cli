import assert from 'node:assert/strict';
import { test } from 'node:test';
import { globsOfKind, readFileName } from '../file-kinds.js';
import { fileKindProblem } from '../plugin.js';

test('a file is <name>.ts or <name>.<kind>.ts, and the kind is the last dotted part', () => {
  assert.deepEqual(readFileName('sidebar.ts'), { kind: null });
  assert.deepEqual(readFileName('sidebar-screen.ts'), { kind: null });
  assert.deepEqual(readFileName('adapter.types.ts'), { kind: 'types' });
  assert.deepEqual(readFileName('adapter.utils.ts'), { kind: 'utils' });
  assert.deepEqual(readFileName('render-turn.test.ts'), { kind: 'test' });
  assert.deepEqual(readFileName('run.utils.test.ts'), { kind: 'test' });
});

test('a name that is not kebab-case, or names a kind there is none of, is a problem', () => {
  assert.match(readFileName('Sidebar.ts').problem ?? '', /kebab-case/);
  assert.match(readFileName('side_bar.ts').problem ?? '', /kebab-case/);
  assert.match(readFileName('sidebar.tsx').problem ?? '', /kebab-case/);
  assert.match(readFileName('sidebar.helper.ts').problem ?? '', /"helper" is not a file kind/);
});

test('the globs of a kind are the files that end in it', () => {
  assert.deepEqual(globsOfKind('types'), ['**/*.types.ts']);
});

test('tests live in __tests__ and nothing else does, fakes in testing/ and nothing else', () => {
  assert.equal(fileKindProblem('src/keys/__tests__/key.test.ts'), undefined);
  assert.equal(fileKindProblem('src/testing/tmux.fake.ts'), undefined);
  assert.equal(fileKindProblem('src/keys/key.ts'), undefined);

  assert.match(fileKindProblem('src/keys/key.test.ts') ?? '', /is a test: it goes in a __tests__/);
  assert.match(fileKindProblem('src/keys/__tests__/helper.ts') ?? '', /holds <name>\.test\.ts/);
  assert.match(fileKindProblem('src/keys/tmux.fake.ts') ?? '', /is a fake: it goes in a testing/);
  assert.match(fileKindProblem('src/testing/tmux.ts') ?? '', /holds <name>\.fake\.ts/);
  assert.match(fileKindProblem('src/keys/Key.ts') ?? '', /kebab-case/);
});
