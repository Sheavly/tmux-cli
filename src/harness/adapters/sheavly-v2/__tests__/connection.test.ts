import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseConnection } from '../connection.ts';

const TOKEN = 't'.repeat(40);
const line = (extra: object = {}) =>
  JSON.stringify({ source: 'discovery', url: 'http://127.0.0.1:4000', token: TOKEN, ...extra });

test('the connection is the last JSON line, so a banner npm prints before it does not matter', () => {
  assert.deepEqual(parseConnection(`> sheavly\n\n${line()}\n`), {
    url: 'http://127.0.0.1:4000',
    token: TOKEN,
  });
});

test('a trailing slash of the url is dropped, so paths join cleanly', () => {
  assert.equal(parseConnection(line({ url: 'http://h:1/' })).url, 'http://h:1');
});

test('output that is not a connection is refused without repeating a value', () => {
  for (const output of ['', 'nope', line({ url: 'file:///x' }), line({ token: '' }), '[1]']) {
    assert.throws(
      () => parseConnection(output),
      (caughtError: Error) =>
        caughtError.message.includes('sheavly connection') && !caughtError.message.includes(TOKEN),
    );
  }
});
