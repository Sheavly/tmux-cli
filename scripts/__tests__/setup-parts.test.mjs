import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { parseSetupArgs } from '../setup/args.mjs';
import { planConfig, readConfigFile, wantedSettings } from '../setup/config-file.mjs';
import { cloneHarness, cloneTargetProblem, expandHome, isHarness } from '../setup/harness.mjs';
import { createIo } from '../setup/io.mjs';
import { aliasLine } from '../setup/link.mjs';
import { checkTools, tmuxInstallHint } from '../setup/preflight.mjs';
import { readyProfiles } from '../setup/profile.mjs';
import { runCommand } from '../setup/shell.mjs';
import { tempHome, writeHarness, writeProfile } from './setup.fake.mjs';

const hasGit = spawnSync('git', ['--version']).status === 0;

test('the options are read, and a mistake says what it was', () => {
  assert.deepEqual(parseSetupArgs([]), {
    help: false,
    yes: false,
    link: 'ask',
    harness: undefined,
    clone: undefined,
    url: undefined,
    mode: undefined,
  });
  assert.deepEqual(parseSetupArgs(['--harness', '~/h', '--mode', 'dev', '-y', '--no-link']), {
    help: false,
    yes: true,
    link: 'no',
    harness: '~/h',
    clone: undefined,
    url: undefined,
    mode: 'dev',
  });
  assert.equal(parseSetupArgs(['--clone', '/x', '--harness-url', 'u', '--link']).link, 'yes');
  assert.equal(parseSetupArgs(['-h']).help, true);

  assert.throws(() => parseSetupArgs(['--nope']), /Unknown option "--nope"/);
  assert.throws(() => parseSetupArgs(['--harness']), /--harness needs a value/);
  assert.throws(() => parseSetupArgs(['--harness', '--yes']), /--harness needs a value/);
  assert.throws(() => parseSetupArgs(['--harness', 'a', '--clone', 'b']), /pass one/);
  assert.throws(() => parseSetupArgs(['--mode', 'prod']), /"mode" must be "built" or "dev"/);
});

test('a question is answered by its fallback with --yes, and is an error with nobody to ask', async () => {
  const yes = createIo({ yes: true, interactive: false, output: new PassThrough() });

  assert.equal(await yes.confirm({ question: 'Go?', fallback: true }), true);
  assert.equal(await yes.ask({ question: 'Where?', fallback: '/x' }), '/x');

  const nobody = createIo({ yes: false, interactive: false, output: new PassThrough() });

  await assert.rejects(
    nobody.confirm({ question: 'Go?', fallback: true }),
    /"Go\?" needs an answer/,
  );
  await assert.rejects(nobody.ask({ question: 'Where?', fallback: '' }), /npm run setup -- --help/);
});

test('in a terminal the typed answer is used, Enter takes the fallback, and an unclear yes or no is asked again', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const io = createIo({ input, output, interactive: true });
  const typing = async (...lines) => {
    for (const line of lines) {
      await once(output, 'data');
      input.write(`${line}\n`);
    }
  };

  const path = io.ask({ question: 'Where?', fallback: '/default' });

  await typing('/typed');
  assert.equal(await path, '/typed');

  const fallback = io.ask({ question: 'Where?', fallback: '/default' });

  await typing('');
  assert.equal(await fallback, '/default');

  const confirmed = io.confirm({ question: 'Go?', fallback: false });

  await typing('maybe', 'YES');
  assert.equal(await confirmed, true);

  const declined = io.confirm({ question: 'Go?', fallback: true });

  await typing('n');
  assert.equal(await declined, false);
});

test('tmux is checked first, with how to install it, and a missing clipboard tool is a note and no more', () => {
  const missing = { status: null, stdout: '', stderr: '' };
  const ok = (stdout) => ({ status: 0, stdout, stderr: '' });
  const check = (over) =>
    checkTools({
      run: ({ command }) => (command === 'tmux' ? ok('tmux 3.4') : ok('10.0.0')),
      platform: 'linux',
      has: () => true,
      env: { DISPLAY: ':0' },
      ...over,
    });

  assert.deepEqual(check({}), { problems: [], notes: [] });
  assert.match(check({ platform: 'win32' }).problems[0], /Windows is not supported.*WSL/);

  const none = check({
    run: ({ command }) => (command === 'tmux' ? missing : ok('10')),
    has: (p) => p === 'dnf',
  });

  assert.match(none.problems[0], /tmux is not installed\. Install it with: sudo dnf install tmux/);

  const old = check({ run: ({ command }) => (command === 'tmux' ? ok('tmux 3.2a') : ok('10')) });

  assert.match(old.problems[0], /needs tmux 3\.3 or newer, and this is 3\.2/);

  const noNpm = check({ run: ({ command }) => (command === 'npm' ? missing : ok('tmux 3.4')) });

  assert.match(noNpm.problems[0], /npm is not installed/);

  const noClipboard = check({ env: {}, has: () => false });

  assert.equal(noClipboard.problems.length, 0);
  assert.match(noClipboard.notes[0], /No clipboard tool found/);
  assert.equal(tmuxInstallHint({ has: (p) => p === 'brew' }), 'Install it with: brew install tmux');
  assert.match(tmuxInstallHint({ has: () => false }), /with your package manager/);
});

test('the config gets only what is not obvious, and a value of the person is never overwritten silently', () => {
  const defaults = { harnessDir: '/home/me/harness', defaultDir: '/home/me/harness' };

  assert.deepEqual(wantedSettings({ ...defaults, mode: 'built', existing: {} }), {});
  assert.deepEqual(wantedSettings({ ...defaults, mode: 'dev', existing: {} }), { mode: 'dev' });
  assert.deepEqual(
    wantedSettings({
      harnessDir: '/srv/h',
      defaultDir: '/home/me/harness',
      mode: 'built',
      existing: {},
    }),
    { harnessDir: '/srv/h' },
  );
  // A file that already has the setting keeps it up to date, even when it is the default now.
  assert.deepEqual(
    wantedSettings({ ...defaults, mode: 'built', existing: { harnessDir: '/old', mode: 'dev' } }),
    { harnessDir: '/home/me/harness', mode: 'built' },
  );

  assert.deepEqual(planConfig({ existing: { socket: 's' }, wanted: { mode: 'dev' } }), {
    added: { mode: 'dev' },
    conflicts: [],
  });
  assert.deepEqual(planConfig({ existing: { mode: 'dev' }, wanted: { mode: 'dev' } }), {
    added: {},
    conflicts: [],
  });
  assert.deepEqual(planConfig({ existing: { mode: 'dev' }, wanted: { mode: 'built' } }), {
    added: {},
    conflicts: [{ key: 'mode', from: 'dev', to: 'built' }],
  });
});

test('a config file that is missing is empty, and one that is wrong is an error naming it', () => {
  const home = tempHome();
  const file = path.join(home, 'config.json');

  assert.deepEqual(readConfigFile(file), {});

  writeFileSync(file, '{"mode":"dev"}');
  assert.deepEqual(readConfigFile(file), { mode: 'dev' });

  writeFileSync(file, '{nope');
  assert.throws(() => readConfigFile(file), /config\.json is not valid JSON/);
});

test('a folder is the harness when its package says so and the terminal app is there', () => {
  const home = tempHome();
  const harness = path.join(home, 'harness');

  assert.equal(isHarness(harness), false);

  writeHarness({ dir: harness });
  assert.equal(isHarness(harness), true);

  const other = path.join(home, 'other');

  mkdirSync(other);
  writeFileSync(path.join(other, 'package.json'), '{"name":"something-else"}');
  assert.equal(isHarness(other), false);

  assert.equal(expandHome({ value: '~', home: '/h' }), '/h');
  assert.equal(expandHome({ value: '~/x/y', home: '/h' }), '/h/x/y');
  assert.equal(expandHome({ value: '/abs', home: '/h' }), '/abs');
  assert.equal(expandHome({ value: '~other', home: '/h' }), '~other');
});

test('a clone goes into a folder that is free: missing or empty, never one with something in it', () => {
  const home = tempHome();
  const full = path.join(home, 'full');

  mkdirSync(path.join(home, 'empty'));
  mkdirSync(full);
  writeFileSync(path.join(full, 'a'), '');

  assert.equal(cloneTargetProblem(path.join(home, 'missing')), undefined);
  assert.equal(cloneTargetProblem(path.join(home, 'empty')), undefined);
  assert.match(cloneTargetProblem(full), /already exists and is not empty/);
});

test('only a profile with a model and its key counts, and it is found by its name', () => {
  const sheavlyHome = tempHome();

  assert.deepEqual(readyProfiles(path.join(sheavlyHome, 'nothing')), []);
  assert.deepEqual(readyProfiles(sheavlyHome), []);

  // A profile without a key, and one without a model, cannot answer.
  mkdirSync(path.join(sheavlyHome, 'profiles', 'nokey', 'models'), { recursive: true });
  writeFileSync(path.join(sheavlyHome, 'profiles', 'nokey', 'models', 'm.json'), '{}');
  mkdirSync(path.join(sheavlyHome, 'profiles', 'nomodel'), { recursive: true });
  writeFileSync(path.join(sheavlyHome, 'profiles', 'nomodel', 'credentials.json'), '{}');
  assert.deepEqual(readyProfiles(sheavlyHome), []);

  writeProfile({ sheavlyHome, id: 'p1', name: 'Work' });
  writeProfile({ sheavlyHome, id: 'p2', name: '' });
  assert.deepEqual(readyProfiles(sheavlyHome).toSorted(), ['Work', 'p2']);
});

test('the fallback for a machine without a global link is an alias to the program', () => {
  assert.equal(aliasLine('/r'), "alias shv='node /r/src/cli.ts'");
});

test(
  'cloning is a real git clone, and a repository that cannot be reached says what to try',
  { skip: !hasGit && 'git is not installed' },
  () => {
    const home = tempHome();
    const origin = path.join(home, 'origin');
    const git = (...args) =>
      spawnSync('git', args, {
        cwd: origin,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 't',
          GIT_AUTHOR_EMAIL: 't@example.invalid',
          GIT_COMMITTER_NAME: 't',
          GIT_COMMITTER_EMAIL: 't@example.invalid',
        },
      });

    writeHarness({ dir: origin });
    assert.equal(git('init', '-q').status, 0);
    assert.equal(git('add', '-A').status, 0);
    assert.equal(git('commit', '-q', '-m', 'harness').status, 0);

    const target = path.join(home, 'deep', 'er', 'harness');

    assert.equal(cloneHarness({ run: runCommand, url: origin, dir: target }), undefined);
    assert.equal(isHarness(target), true);

    const failed = cloneHarness({
      run: (call) => runCommand({ ...call, inherit: false }),
      url: path.join(home, 'nowhere'),
      dir: path.join(home, 'again'),
    });

    assert.match(failed, /git clone failed \(exit 128\)/);
    assert.match(failed, /gh auth login/);
  },
);

test('the runner says how a program went and what it wrote', () => {
  const ok = runCommand({ command: 'node', args: ['-e', 'console.log("hi")'] });

  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim(), 'hi');

  const missing = runCommand({ command: 'definitely-not-a-program-xyz' });

  assert.equal(missing.status, null);
  assert.equal(missing.error.code, 'ENOENT');
});
