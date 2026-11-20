import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripEscapes } from '../../../../terminal/ansi.ts';
import { displayWidth } from '../../../../terminal/width.utils.ts';
import { renderAgentLine } from '../follow-agent.ts';

function render(record: object, columns = 60): string {
  return renderAgentLine({ line: JSON.stringify(record), columns });
}

const plain = (text: string): string => stripEscapes(text);

test('the first message is the task the sub-agent was given, and later user messages are not shown', () => {
  const task = plain(render({ seq: 0, entry: { role: 'user', content: 'Look into\nthe bug' } }));

  assert.equal(task, 'Task\nLook into\nthe bug\n\n');
  assert.equal(render({ seq: 3, entry: { role: 'user', content: '<instruction-context>' } }), '');
});

test('a long task is cut to a few rows', () => {
  const content = Array.from({ length: 20 }, (_, index) => `row ${index}`).join('\n');
  const rows = plain(render({ seq: 0, entry: { role: 'user', content } })).split('\n');

  assert.deepEqual(rows.slice(0, 2), ['Task', 'row 0']);
  assert.equal(rows.at(-3), '…');
  assert.ok(!rows.includes('row 19'));
});

test('what the sub-agent says is shown, then one row for each tool it calls', () => {
  const text = plain(
    render({
      entry: {
        role: 'assistant',
        content: 'Reading the docs.',
        toolCalls: [
          { name: 'web_fetch', input: { description: 'Mesa docs', url: 'https://x' } },
          { name: 'run_command', input: { command: 'npm test' } },
          { name: 'noop', input: {} },
        ],
      },
    }),
  );

  assert.equal(
    text,
    'Reading the docs.\n\n▸ web_fetch  Mesa docs\n▸ run_command  npm test\n▸ noop  \n',
  );
});

test('a tool answer is its first row, and a failure says so', () => {
  assert.equal(
    plain(render({ entry: { role: 'tool', content: '\n  first row\nsecond', isError: false } })),
    '  ↳ first row\n',
  );
  assert.equal(
    plain(render({ entry: { role: 'tool', content: 'boom', isError: true } })),
    '  ✗ boom\n',
  );
});

test('text from the model or a tool never carries an escape sequence to the terminal', () => {
  const evil = 'hi\u001b]0;title\u0007\u001b[2J there\u001b[31m';
  const said = render({ entry: { role: 'assistant', content: evil } });
  const answer = render({ entry: { role: 'tool', content: evil } });

  assert.ok(!said.includes('\u001b[2J') && !said.includes('\u001b]'));
  assert.ok(!answer.includes('\u001b[2J') && !answer.includes('\u001b]'));
  assert.match(plain(said), /hi there/);
});

test('a row is cut to the pane in columns, not characters', () => {
  const content = '漢字'.repeat(30);
  const [row = ''] = plain(render({ entry: { role: 'tool', content } }, 20)).split('\n');

  assert.ok(displayWidth(row) <= 20, `${displayWidth(row)} columns`);
  assert.ok(row.endsWith('…'));
});

test('a line that is not a record, or has nothing to show, is nothing', () => {
  assert.equal(renderAgentLine({ line: 'not json', columns: 40 }), '');
  assert.equal(renderAgentLine({ line: '{"seq":1}', columns: 40 }), '');
  assert.equal(render({ entry: { role: 'assistant', content: '' } }), '');
  assert.equal(render({ entry: { role: 'system', content: 'x' } }), '');
});
