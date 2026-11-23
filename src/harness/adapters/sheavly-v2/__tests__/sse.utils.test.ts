import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSseParser } from '../sse.utils.ts';

test('a frame is cut out of text that arrives in pieces of any size', () => {
  const parser = createSseParser();
  const text = 'event: entry\nid: 3\ndata: {"a":1}\n\nevent: entry\nid: 4\ndata: {"b":2}\n\n';
  const frames = (text.match(/[^]{1,3}/g) ?? []).flatMap((piece) => parser.push(piece));

  assert.deepEqual(frames, [
    { id: '3', data: '{"a":1}' },
    { id: '4', data: '{"b":2}' },
  ]);
});

test('a heartbeat comment is no frame, and \\r\\n ends a line as \\n does', () => {
  const parser = createSseParser();

  assert.deepEqual(parser.push(': heartbeat\r\n\r\nid: 1\r\ndata: x\r\n\r\n'), [
    { id: '1', data: 'x' },
  ]);
});

test('lines of data in one frame are joined, and one space after the colon is dropped', () => {
  assert.deepEqual(createSseParser().push('data: a\ndata:  b\n\n'), [
    { id: undefined, data: 'a\n b' },
  ]);
});

test('a frame with an id and no data is no frame, and its id does not leak into the next', () => {
  const parser = createSseParser();

  assert.deepEqual(parser.push('id: 41\n\ndata: x\n\n'), [{ id: undefined, data: 'x' }]);
});
