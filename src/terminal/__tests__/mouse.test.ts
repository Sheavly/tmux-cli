import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInput } from '../../sidebar/keys.ts';
import { parseMouseReport, wheelRows } from '../mouse.utils.ts';

test('a left press is a click, counted from 0 at the top left of the pane', () => {
  assert.deepEqual(parseMouseReport('\u001b[<0;1;1M'), { kind: 'click', column: 0, row: 0 });
  assert.deepEqual(parseMouseReport('\u001b[<0;30;12M'), { kind: 'click', column: 29, row: 11 });
});

test('the wheel is up or down, and a notch is three rows', () => {
  const up = parseMouseReport('\u001b[<64;5;3M');
  const down = parseMouseReport('\u001b[<65;5;3M');

  assert.equal(up?.kind, 'wheelUp');
  assert.equal(down?.kind, 'wheelDown');
  assert.equal(wheelRows(up as never), -3);
  assert.equal(wheelRows(down as never), 3);
  assert.equal(wheelRows({ kind: 'click', column: 0, row: 0 }), 0);
});

test('a release, a move, another button, a sideways wheel and a click with a modifier are not used', () => {
  for (const report of [
    '\u001b[<0;5;3m',
    '\u001b[<32;5;3M',
    '\u001b[<2;5;3M',
    '\u001b[<1;5;3M',
    '\u001b[<66;5;3M',
    '\u001b[<4;5;3M',
    '\u001b[<8;5;3M',
    '\u001b[<16;5;3M',
  ]) {
    assert.equal(parseMouseReport(report), undefined, JSON.stringify(report));
  }
});

test('a program that reads dragging gets the left button held while it moves, and let go', () => {
  const reading = { drag: true };

  assert.deepEqual(parseMouseReport('\u001b[<32;5;3M', reading), {
    kind: 'drag',
    column: 4,
    row: 2,
  });
  assert.deepEqual(parseMouseReport('\u001b[<0;5;3m', reading), {
    kind: 'release',
    column: 4,
    row: 2,
  });
});

test('dragging with another button, a move with no button or a modifier held is not used', () => {
  for (const report of [
    '\u001b[<34;5;3M',
    '\u001b[<35;5;3M',
    '\u001b[<36;5;3M',
    '\u001b[<2;5;3m',
  ]) {
    assert.equal(parseMouseReport(report, { drag: true }), undefined, JSON.stringify(report));
  }
});

test('a read with keys and mouse reports in it comes out in the order it came', () => {
  assert.deepEqual(parseInput('j\u001b[<0;4;2M\u001b[<0;4;2m\u001b[Bq'), [
    { kind: 'key', key: 'j' },
    { kind: 'mouse', mouse: { kind: 'click', column: 3, row: 1 } },
    { kind: 'key', key: 'down' },
    { kind: 'key', key: 'q' },
  ]);
});

test('a column past 223 is read, which the older report form cannot say', () => {
  assert.deepEqual(parseInput('\u001b[<0;300;5M'), [
    { kind: 'mouse', mouse: { kind: 'click', column: 299, row: 4 } },
  ]);
});
