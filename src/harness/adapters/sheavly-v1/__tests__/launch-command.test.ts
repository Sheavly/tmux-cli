import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSheavlyV1, resolveSheavlyV1Options } from '../index.ts';
import { defaultCommand, parseLaunchMode } from '../launch-command.utils.ts';

const ID = 'ade956dc-fa34-4071-b9e2-8d85365ac8e6';

test('the harness is run from its build unless the config asks for the source', () => {
  assert.equal(parseLaunchMode(undefined), 'built');
  assert.equal(parseLaunchMode('built'), 'built');
  assert.equal(parseLaunchMode('dev'), 'dev');
  assert.throws(() => parseLaunchMode('prod'), /"mode" must be "built" or "dev", not "prod"/);

  assert.match(defaultCommand('built'), /node apps\/terminal\/dist\/chat\.js --trust$/);
  assert.match(defaultCommand('dev'), /npm run --silent dev -w @sheavly\/terminal -- --trust$/);
});

test('mode picks the default command, and a command of its own wins over both modes', () => {
  const resolve = (settings: { mode?: string; command?: string }) =>
    resolveSheavlyV1Options({ settings, env: {}, home: '/h' }).command;

  assert.equal(resolve({}), defaultCommand('built'));
  assert.equal(resolve({ mode: 'dev' }), defaultCommand('dev'));
  assert.equal(resolve({ mode: 'dev', command: 'go' }), 'go');
  assert.equal(resolve({ command: 'go' }), 'go');
  assert.throws(() => resolve({ mode: 'source' }), /"mode" must be/);
});

/** Runs a launch command the way the session does: `sh -c`, in the harness folder. */
function run(params: { command: string; cwd: string; env: Record<string, string> }) {
  return spawnSync('sh', ['-c', params.command], {
    cwd: params.cwd,
    env: { ...process.env, ...params.env },
    encoding: 'utf8',
  });
}

test('a harness that is not built says how to build it, instead of failing on a missing module', async () => {
  const harness = await mkdtemp(path.join(os.tmpdir(), 'shv-harness-'));
  const adapter = createSheavlyV1({
    sheavlyHome: '/s',
    harnessDir: harness,
    command: defaultCommand('built'),
  });
  const spec = adapter.launch({ workspace: '/w', chatId: ID });
  const result = run({ command: spec.command, cwd: spec.cwd, env: spec.env });

  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    /the harness is not built \(apps\/terminal\/dist\/chat\.js is missing\)/,
  );
  assert.match(result.stdout, /npm run build -w @sheavly\/terminal/);
  assert.match(result.stdout, /"mode": "dev"/);
  assert.doesNotMatch(result.stderr, /Cannot find module/);
});

/** A harness folder with a built chat program (`script`, plain JavaScript), and the adapter for it. */
async function builtHarness(script: string) {
  const harness = await mkdtemp(path.join(os.tmpdir(), 'shv-harness-'));

  await mkdir(path.join(harness, 'apps', 'terminal', 'dist'), { recursive: true });
  await writeFile(path.join(harness, 'apps', 'terminal', 'dist', 'chat.js'), `${script}\n`);

  const adapter = createSheavlyV1({
    sheavlyHome: '/s',
    harnessDir: harness,
    command: defaultCommand('built'),
  });

  return { harness, adapter };
}

test('what npm leaves in the environment of the project it ran is not passed to the harness, which would look for its backend in the wrong repository', async () => {
  const { adapter } = await builtHarness(
    'console.log(JSON.stringify({ prefix: process.env.npm_config_local_prefix ?? null, init: process.env.INIT_CWD ?? null, kept: process.env.KEEP_ME ?? null }));',
  );
  const spec = adapter.launch({ workspace: '/w' });
  // As when sheavly-tmux was started with `npm start` and its tmux server inherited this.
  const result = run({
    command: spec.command,
    cwd: spec.cwd,
    env: {
      ...spec.env,
      npm_config_local_prefix: '/some/other/repo',
      INIT_CWD: '/some/other/repo',
      KEEP_ME: 'yes',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { prefix: null, init: null, kept: 'yes' });
});

test('a built harness is run with node, in its folder, with the chat folder and the id it is given', async () => {
  const { harness, adapter } = await builtHarness(
    'console.log(JSON.stringify({ argv: process.argv.slice(2), root: process.env.WORKSPACE_ROOT, cwd: process.cwd() }));',
  );
  const started = (target: Parameters<typeof adapter.launch>[0]) => {
    const spec = adapter.launch(target);
    const result = run({ command: spec.command, cwd: spec.cwd, env: spec.env });

    assert.equal(result.status, 0, result.stderr);

    return JSON.parse(result.stdout) as { argv: string[]; root: string; cwd: string };
  };

  const fresh = started({ workspace: '/w' });

  assert.deepEqual(fresh.argv, ['--trust']);
  assert.equal(fresh.root, '/w');
  assert.equal(await realpath(fresh.cwd), await realpath(harness));
  assert.deepEqual(started({ workspace: '/w', chatId: ID }).argv, ['--trust', '--resume', ID]);
});
