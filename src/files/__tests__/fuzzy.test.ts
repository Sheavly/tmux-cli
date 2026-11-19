import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterBy, fuzzyScore, queryScore } from '../fuzzy.ts';

test('letters must appear in order, but not next to each other', () => {
  assert.notEqual(fuzzyScore('sbr', 'src/sidebar/sidebar.ts'), undefined);
  assert.equal(fuzzyScore('tsb', 'src/sidebar.ts'), undefined);
  assert.equal(fuzzyScore('zzz', 'src/sidebar.ts'), undefined);
});

test('case is ignored', () => {
  assert.notEqual(fuzzyScore('SIDE', 'src/sidebar.ts'), undefined);
  assert.notEqual(fuzzyScore('side', 'SRC/SIDEBAR.TS'), undefined);
});

test('a compact match beats a scattered one, and so does a match on a word start', () => {
  const compact = fuzzyScore('side', 'src/sidebar.ts') as number;
  const scattered = fuzzyScore('side', 'src/s_x_i_x_d_x_e.ts') as number;

  assert.ok(compact > scattered);

  const wordStart = fuzzyScore('bar', 'src/foo_bar.ts') as number;
  const middle = fuzzyScore('bar', 'src/foobar.ts') as number;

  assert.ok(wordStart > middle);
});

test('every word of the query has to match', () => {
  assert.notEqual(queryScore('side ts', 'src/sidebar.ts'), undefined);
  assert.equal(queryScore('side py', 'src/sidebar.ts'), undefined);
  assert.equal(queryScore('', 'anything'), 0);
});

test('filterBy ranks the best match first and keeps the order of equal ones', () => {
  const paths = ['src/cli.ts', 'src/sidebar/render.ts', 'src/sidebar/sidebar.ts', 'README.md'];

  assert.deepEqual(filterBy({ items: paths, query: 'sidebar', text: (path) => path }), [
    'src/sidebar/sidebar.ts',
    'src/sidebar/render.ts',
  ]);
  assert.deepEqual(filterBy({ items: paths, query: '  ', text: (path) => path }), paths);
  assert.deepEqual(filterBy({ items: paths, query: 'nothing', text: (path) => path }), []);
});
