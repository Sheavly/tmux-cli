import assert from 'node:assert/strict';
import { test } from 'node:test';
import { movedCursor } from '../cursor.utils.ts';
import type { ViewRow } from '../diff.ts';
import { style, styledSlice } from '../row-render.ts';
import { selectedText, spanOnRow, type Selection } from '../selection.utils.ts';

const line = (number: number, text: string): ViewRow => ({
  kind: 'line',
  number,
  text,
  added: false,
});
const removed = (text: string): ViewRow => ({ kind: 'removed', text });
const select = (from: [number, number], to: [number, number]): Selection => ({
  anchor: { row: from[0], column: from[1] },
  head: { row: to[0], column: to[1] },
});

const ROWS = [line(1, 'alpha beta'), removed('gone line'), line(2, 'gamma\tdelta'), line(3, 'end')];

test('the cell under the head is selected, and a selection made backwards is the same one', () => {
  assert.deepEqual(spanOnRow({ selection: select([0, 2], [0, 5]), row: 0 }), [2, 6]);
  assert.deepEqual(spanOnRow({ selection: select([0, 5], [0, 2]), row: 0 }), [2, 6]);
});

test('a selection over rows takes the end of the first, the whole of the middle and the start of the last', () => {
  const selection = select([0, 6], [2, 1]);

  assert.deepEqual(spanOnRow({ selection, row: 0 }), [6, Infinity]);
  assert.deepEqual(spanOnRow({ selection, row: 1 }), [0, Infinity]);
  assert.deepEqual(spanOnRow({ selection, row: 2 }), [0, 2]);
  assert.equal(spanOnRow({ selection, row: 3 }), undefined);
});

test('what is copied is the text of the file: no removed lines, and a tab stays a tab', () => {
  assert.equal(selectedText({ rows: ROWS, selection: select([0, 6], [2, 6]) }), 'beta\ngamma\t');
  assert.equal(
    selectedText({ rows: ROWS, selection: select([0, 6], [2, 13]) }),
    'beta\ngamma\tdelta',
  );
});

test('a selection of removed lines only copies them', () => {
  assert.equal(selectedText({ rows: ROWS, selection: select([1, 5], [1, 8]) }), 'line');
});

test('columns are counted as the terminal shows them, so a wide character is two', () => {
  const rows = [line(1, '漢字ab')];

  assert.equal(selectedText({ rows, selection: select([0, 2], [0, 4]) }), '字a');
});

test('the cursor moves within the file and stays on a cell of its row', () => {
  const at = (row: number, column: number) => ({ row, column });
  const move = (
    cursor: { row: number; column: number },
    direction: 'left' | 'down' | 'up' | 'right',
  ) => movedCursor({ rows: ROWS, cursor, move: direction, page: 2 });

  assert.deepEqual(move(at(0, 0), 'left'), at(0, 0));
  assert.deepEqual(move(at(0, 9), 'right'), at(0, 9));
  assert.deepEqual(move(at(0, 9), 'down'), at(1, 8));
  assert.deepEqual(move(at(3, 2), 'down'), at(3, 2));
  assert.deepEqual(move(at(0, 0), 'up'), at(0, 0));
});

test('a word move goes to the start of the word before and the end of the word after', () => {
  const rows = [line(1, 'alpha beta'), line(2, 'next')];
  const move = (column: number, direction: 'wordPrevious' | 'wordNext', row = 0) =>
    movedCursor({ rows, cursor: { row, column }, move: direction, page: 2 });

  assert.deepEqual(move(8, 'wordPrevious'), { row: 0, column: 6 });
  assert.deepEqual(move(6, 'wordPrevious'), { row: 0, column: 0 });
  assert.deepEqual(move(0, 'wordNext'), { row: 0, column: 4 });
  assert.deepEqual(move(4, 'wordNext'), { row: 0, column: 9 });
  // Past the last word of a line the move goes on to the next line.
  assert.deepEqual(move(9, 'wordNext'), { row: 1, column: 0 });
  assert.deepEqual(move(0, 'wordPrevious', 1), { row: 0, column: 9 });
});

test('the selected columns of a line are in reverse, wherever the highlighter cut it', () => {
  const pieces = [
    { text: 'ab', bold: false, italic: false },
    { text: 'cd', bold: false, italic: false },
  ];
  const { reset, reverse } = style;

  assert.equal(
    styledSlice({ pieces, left: 0, room: 6, selected: [1, 3] }),
    `a${reset}${reverse}b${reset}${reverse}c${reset}d${reset}  `,
  );
});

test('a selection that goes on to the next line marks the cell where the line ends', () => {
  const pieces = [{ text: 'ab', bold: false, italic: false }];
  const { reset, reverse } = style;

  assert.equal(
    styledSlice({ pieces, left: 0, room: 4, selected: [0, Infinity] }),
    `${reverse}ab${reset}${reverse} ${reset} `,
  );
});
