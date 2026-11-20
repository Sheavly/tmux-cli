import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripEscapes } from '../../../../terminal/ansi.ts';
import { styleMarkdown } from '../markdown-text.ts';

test('styling a reply keeps its text, and only the inline markers give way to colour', () => {
  const text = '# Title\nsome `code` and **bold**\n```ts\nconst a = 1;\n```\n- item';

  assert.equal(
    stripEscapes(styleMarkdown(text)),
    '# Title\nsome code and bold\n```ts\nconst a = 1;\n```\n- item',
  );
});

test('headings, inline code, bold and fenced code each get their own colour', () => {
  const styled = styleMarkdown('# Title\n`x` **y**\n```\nz\n```').split('\n');

  assert.match(styled[0] ?? '', /^\u001b\[1;33m# Title/);
  assert.match(styled[1] ?? '', /\u001b\[36mx\u001b\[0m \u001b\[1my\u001b\[0m/);
  assert.match(styled[3] ?? '', /^\u001b\[36mz/);
});

test('a # inside a fence is code, not a heading', () => {
  const [, inside = ''] = styleMarkdown('```\n# comment\n```').split('\n');

  assert.match(inside, /^\u001b\[36m# comment/);
});
