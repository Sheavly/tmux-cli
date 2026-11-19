import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { findDocProblems } from '../check-docs.mjs';

/** A repository with a package.json, the files named, and the docs given. */
async function repo(params) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'shv-docs-'));

  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { lint: 'eslint .', check: 'npm run lint' } }),
  );

  for (const [name, text] of Object.entries(params)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), text);
  }

  return root;
}

test('a doc that names things that exist has nothing wrong with it', async () => {
  const root = await repo({
    'README.md':
      'Run `npm run lint`, `npm test` and `npm run check -- --force`. See `src/cli.ts` and [the guide](docs/guide.md#top).',
    'src/cli.ts': '',
    'docs/guide.md': 'The guide, in `src/` and `lint/rules.js`.',
    'lint/rules.js': '',
  });

  assert.deepEqual(findDocProblems(root), []);
});

test('a path, a script or a link that is not there is said, with the doc it is in', async () => {
  const root = await repo({
    'README.md':
      'See `src/gone.ts`, run `npm run nothing`, and read [it](docs/missing.md) or [that](./also-missing.md#x).',
    'docs/guide.md': 'The `lint/old/` folder.',
  });

  assert.deepEqual(findDocProblems(root).toSorted(), [
    'README.md: links to ./also-missing.md#x, which does not exist',
    'README.md: links to docs/missing.md, which does not exist',
    'README.md: names src/gone.ts, which does not exist',
    'README.md: names the script "nothing", which package.json does not have',
    'docs/guide.md: names lint/old/, which does not exist',
  ]);
});

test('a skill is checked like a doc: what it names must be there', async () => {
  const root = await repo({
    '.agents/skills/work/SKILL.md':
      'Read `src/real.ts` and `.agents/skills/work/SKILL.md`, not `src/gone.ts` or `.agents/skills/none/SKILL.md`.',
    'src/real.ts': '',
  });

  assert.deepEqual(findDocProblems(root).toSorted(), [
    '.agents/skills/work/SKILL.md: names .agents/skills/none/SKILL.md, which does not exist',
    '.agents/skills/work/SKILL.md: names src/gone.ts, which does not exist',
  ]);
});

test('examples in code blocks, other text in backticks and outside links are left alone', async () => {
  const root = await repo({
    'README.md': [
      'Config is `~/.config/x/config.json`, a pattern is `src/**/*.ts`, a command is `git commit -m "x"`.',
      'Docs are at [the site](https://example.com/docs/x.md) and [below](#below).',
      '```sh',
      'cat src/not-there.ts && npm run not-a-script',
      '```',
    ].join('\n'),
  });

  assert.deepEqual(findDocProblems(root), []);
});
