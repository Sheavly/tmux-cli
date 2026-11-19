import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { createIo } from '../setup/io.mjs';
import { runSetup } from '../setup/main.mjs';
import {
  commandsOf,
  createRecorder,
  createScriptedIo,
  tempHome,
  writeBuild,
  writeHarness,
  writeProfile,
  writeRepo,
} from './setup.fake.mjs';

const URL = 'https://github.com/Sheavly/harness.git';
const BUILD = 'npm run build -w @sheavly/terminal';
const NOT_LINKED = 'sh -c command -v sheavly-tmux';

/**
 * A computer to run the setup on: a home, this repository with its dependencies in, and programs
 * that behave. `behave` changes what one of them does, by its command line.
 */
function world({ behave = () => undefined, profile = true } = {}) {
  const home = tempHome();
  const repo = path.join(home, 'sheavly-tmux');

  writeRepo(repo);

  // Most tests are about something else, so sheavly has been set up already.
  if (profile) writeProfile({ sheavlyHome: path.join(home, '.sheavly'), name: 'Work' });

  const recorder = createRecorder((call) => {
    const line = [call.command, ...(call.args ?? [])].join(' ');
    const changed = behave({ line, call, home });

    if (changed) return changed;

    if (line === 'tmux -V') return { stdout: 'tmux 3.4' };

    if (line.startsWith('git clone')) writeHarness({ dir: call.args[2] });

    if (line === 'npm ci') mkdirSync(path.join(call.cwd, 'node_modules'), { recursive: true });

    if (line === BUILD) writeBuild(call.cwd);

    if (line === NOT_LINKED) return { status: 1 };

    return undefined;
  });

  return {
    home,
    repo,
    defaultDir: path.join(home, 'harness'),
    configFile: path.join(home, '.config', 'sheavly-tmux', 'config.json'),
    calls: recorder.calls,
    setup: ({ argv = [], io = createScriptedIo() }) =>
      runSetup({
        argv,
        env: {},
        home,
        repo,
        platform: 'linux',
        run: recorder.run,
        has: () => true,
        io,
      }),
  };
}

const configOf = (file) => JSON.parse(readFileSync(file, 'utf8'));

test('on a fresh computer it clones the harness, installs and builds it, writes the config and links the command', async () => {
  const computer = world({ profile: false });
  const target = path.join(computer.home, 'projects', 'harness');
  const io = createScriptedIo({
    answers: [
      ['Do you have the sheavly harness', false],
      ['Where should it be cloned to', target],
      ['Run the harness setup now', false],
    ],
  });

  assert.equal(await computer.setup({ io }), 0, io.lines.join('\n'));

  assert.deepEqual(commandsOf(computer.calls), [
    'npm --version',
    'tmux -V',
    `git clone ${URL} ${target}`,
    'npm ci',
    BUILD,
    NOT_LINKED,
    'npm link',
  ]);
  assert.equal(computer.calls[3].cwd, target);
  assert.equal(computer.calls[4].cwd, target);
  assert.equal(computer.calls[6].cwd, computer.repo);
  // The harness is not where sheavly-tmux looks by default, so the config says where it is.
  assert.deepEqual(configOf(computer.configFile), { harnessDir: target });
  assert.ok(
    io.lines.includes(
      '!! No profile with a model and a key yet, and sheavly cannot answer until there is one.',
    ),
  );
  // Not run now, so the exact command to run later is printed.
  assert.ok(io.lines.includes(`..   cd ${target} && node apps/terminal/dist/chat.js --setup`));
  assert.match(io.lines.at(-1), /Done\. Start it with: sheavly-tmux/);
  assert.equal(io.lines.filter((line) => line.startsWith('xx ')).length, 0);
});

test('a harness the person already has is built but not installed again or touched, and needs no config at the default place', async () => {
  const computer = world();

  writeHarness({ dir: computer.defaultDir, installed: true, built: true });

  const io = createScriptedIo();

  assert.equal(await computer.setup({ io }), 0, io.lines.join('\n'));

  // Offered the place it is in; its build is always run, because "is it built" cannot tell a stale one.
  assert.deepEqual(commandsOf(computer.calls), [
    'npm --version',
    'tmux -V',
    BUILD,
    NOT_LINKED,
    'npm link',
  ]);
  assert.equal(existsSync(computer.configFile), false);
  assert.ok(io.lines.includes('ok nothing to write: the defaults fit'));
  assert.ok(io.asked.some((question) => question.startsWith('Run it from its build')));
});

test('someone with their own checkout can run it from source, which skips the build and is written to the config', async () => {
  const computer = world();

  writeHarness({ dir: computer.defaultDir, installed: true });

  const io = createScriptedIo({ answers: [['Run it from its build', false]] });

  assert.equal(await computer.setup({ io }), 0, io.lines.join('\n'));
  assert.ok(!commandsOf(computer.calls).includes(BUILD));
  assert.deepEqual(configOf(computer.configFile), { mode: 'dev' });
  assert.ok(io.lines.includes('ok the harness runs from source (mode: dev)'));
});

test('a checkout at another place is used where it is, asked for until it is the harness', async () => {
  const computer = world();
  const mine = path.join(computer.home, 'code', 'sheavly');

  writeHarness({ dir: mine, installed: true, built: true });

  const answers = [
    ['Do you have the sheavly harness', true],
    ['Where is it?', path.join(computer.home, 'nothing-here')],
  ];
  const wrongThenRight = createScriptedIo({ answers });
  let tries = 0;
  const original = wrongThenRight.ask;

  wrongThenRight.ask = async (question) => {
    tries += 1;

    return tries === 1 ? original(question) : mine;
  };

  assert.equal(await computer.setup({ io: wrongThenRight }), 0, wrongThenRight.lines.join('\n'));
  assert.ok(
    wrongThenRight.lines.some((line) => /nothing-here is not the sheavly harness/.test(line)),
  );
  assert.deepEqual(configOf(computer.configFile), { harnessDir: mine });
  assert.ok(!commandsOf(computer.calls).some((line) => line.startsWith('git clone')));
});

test('a setting the config already has is asked about and not overwritten unless the person says so', async () => {
  const keep = world();
  const change = world();

  for (const computer of [keep, change]) {
    writeHarness({ dir: computer.defaultDir, installed: true, built: true });
    mkdirSync(path.dirname(computer.configFile), { recursive: true });
    writeFileSync(
      computer.configFile,
      JSON.stringify({ harnessDir: '/old/place', socket: 'mine' }),
    );
  }

  const kept = createScriptedIo();

  // Kept, so sheavly-tmux still looks at the old place, which is not a harness: the check says so.
  assert.equal(await keep.setup({ io: kept }), 1);
  assert.deepEqual(configOf(keep.configFile), { harnessDir: '/old/place', socket: 'mine' });
  assert.ok(kept.lines.some((line) => line.startsWith('!! kept "harnessDir": "/old/place"')));
  assert.ok(kept.lines.some((line) => line === 'xx /old/place is not the sheavly harness'));

  const changed = createScriptedIo({ answers: [['Change it to', true]] });

  assert.equal(await change.setup({ io: changed }), 0, changed.lines.join('\n'));
  assert.deepEqual(configOf(change.configFile), { harnessDir: change.defaultDir, socket: 'mine' });
});

test('without a terminal and without --yes it stops at the first question, having changed nothing', async () => {
  const computer = world();
  const output = new PassThrough();
  const chunks = [];

  output.on('data', (chunk) => chunks.push(String(chunk)));

  const io = createIo({ interactive: false, output });

  assert.equal(await computer.setup({ io }), 1);
  assert.match(chunks.join(''), /needs an answer: run this in a terminal, or pass the options/);
  assert.deepEqual(commandsOf(computer.calls), ['npm --version', 'tmux -V']);
  assert.equal(existsSync(computer.configFile), false);
});

test('--yes takes the defaults: no harness found means a clone to the default place', async () => {
  const computer = world();
  const io = createIo({ yes: true, interactive: false, output: new PassThrough() });

  assert.equal(await computer.setup({ argv: ['--yes'], io }), 0);
  assert.deepEqual(commandsOf(computer.calls), [
    'npm --version',
    'tmux -V',
    `git clone ${URL} ${computer.defaultDir}`,
    'npm ci',
    BUILD,
    NOT_LINKED,
    'npm link',
  ]);
  assert.equal(existsSync(computer.configFile), false);
});

test('the options say it all: --harness uses a checkout, --clone a folder, --no-link skips the command', async () => {
  const computer = world();
  const mine = path.join(computer.home, 'mine');

  writeHarness({ dir: mine, installed: true, built: true });

  const used = createScriptedIo();

  assert.equal(
    await computer.setup({ argv: ['--harness', mine, '--mode', 'built', '--no-link'], io: used }),
    0,
  );
  assert.deepEqual(commandsOf(computer.calls).slice(2), [BUILD]);
  assert.equal(used.asked.length, 0, 'nothing was left to ask');

  const other = world();
  const folder = path.join(other.home, 'new-harness');
  const cloned = createScriptedIo();

  assert.equal(
    await other.setup({
      argv: ['--clone', folder, '--harness-url', 'https://example.invalid/h.git', '--no-link'],
      io: cloned,
    }),
    0,
    cloned.lines.join('\n'),
  );
  assert.ok(commandsOf(other.calls).includes(`git clone https://example.invalid/h.git ${folder}`));
});

test('a computer without tmux, or with an old one, is told so before anything is changed', async () => {
  const none = world({ behave: ({ line }) => (line === 'tmux -V' ? { status: null } : undefined) });
  const noTmux = createScriptedIo();

  assert.equal(await none.setup({ io: noTmux }), 1);
  assert.ok(
    noTmux.lines.some(
      (line) =>
        /tmux is not installed\. Install it with: sudo dnf install tmux/.test(line) ||
        /tmux is not installed/.test(line),
    ),
  );
  assert.deepEqual(commandsOf(none.calls), ['npm --version', 'tmux -V']);

  const old = world({
    behave: ({ line }) => (line === 'tmux -V' ? { stdout: 'tmux 3.2a' } : undefined),
  });
  const tooOld = createScriptedIo();

  assert.equal(await old.setup({ io: tooOld }), 1);
  assert.ok(tooOld.lines.some((line) => /needs tmux 3\.3 or newer, and this is 3\.2/.test(line)));
  assert.equal(commandsOf(old.calls).length, 2);
});

test('a build that fails stops the setup there, says which command, and writes no config', async () => {
  const computer = world({ behave: ({ line }) => (line === BUILD ? { status: 2 } : undefined) });
  const target = path.join(computer.home, 'h');
  const io = createScriptedIo({
    answers: [
      ['Do you have the sheavly harness', false],
      ['Where should it be cloned to', target],
    ],
  });

  assert.equal(await computer.setup({ io }), 1);
  assert.ok(io.lines.includes(`xx ${BUILD} failed (exit 2).`));
  assert.equal(existsSync(computer.configFile), false);
  assert.ok(!commandsOf(computer.calls).includes('npm link'));
});

test('a folder that has something in it is not cloned into, and the way out is named', async () => {
  const computer = world();
  const taken = path.join(computer.home, 'taken');
  const io = createScriptedIo();

  mkdirSync(taken);
  writeFileSync(path.join(taken, 'file'), '');

  assert.equal(await computer.setup({ argv: ['--clone', taken], io }), 1);
  assert.ok(io.lines.some((line) => /already exists and is not empty\. Pass --harness/.test(line)));
  assert.ok(!commandsOf(computer.calls).some((line) => line.startsWith('git clone')));
});

test('a profile that exists is found and left alone; without one the harness wizard is offered, and it holds the keys, not us', async () => {
  const has = world();

  writeHarness({ dir: has.defaultDir, installed: true, built: true });

  const found = createScriptedIo();

  assert.equal(await has.setup({ io: found }), 0, found.lines.join('\n'));
  assert.ok(found.lines.includes('ok found: Work'));
  assert.ok(!found.asked.some((question) => question.startsWith('Run the harness setup')));

  const lacks = world({
    profile: false,
    behave: ({ call, home }) => {
      if (call.args?.includes('--setup')) {
        writeProfile({ sheavlyHome: path.join(home, '.sheavly') });
      }

      return undefined;
    },
  });

  writeHarness({ dir: lacks.defaultDir, installed: true, built: true });

  const wizard = createScriptedIo({ answers: [['Run the harness setup now', true]] });

  assert.equal(await lacks.setup({ io: wizard }), 0, wizard.lines.join('\n'));

  const [setup] = lacks.calls.filter(({ args = [] }) => args.includes('--setup'));

  assert.deepEqual(
    [setup.command, ...setup.args],
    ['node', 'apps/terminal/dist/chat.js', '--setup'],
  );
  assert.equal(setup.cwd, lacks.defaultDir);
  assert.equal(setup.inherit, true);
  // The harness refuses the home folder as a workspace, so the wizard works from this repository.
  assert.equal(setup.env.WORKSPACE_ROOT, lacks.repo);
  assert.ok(wizard.lines.includes('ok profile set up'));
});

test('the command is linked unless it already is, and a link that is not allowed leaves an alias to use', async () => {
  const linked = world({
    behave: ({ line, home }) =>
      line === NOT_LINKED
        ? { stdout: path.join(home, 'sheavly-tmux', 'src', 'cli.ts') }
        : undefined,
  });

  writeHarness({ dir: linked.defaultDir, installed: true, built: true });

  const already = createScriptedIo();

  assert.equal(await linked.setup({ io: already }), 0);
  assert.ok(already.lines.includes('ok sheavly-tmux is already a command'));
  assert.ok(!commandsOf(linked.calls).includes('npm link'));

  const denied = world({
    behave: ({ line }) =>
      line === 'npm link' ? { status: 1, stderr: 'EACCES: permission denied' } : undefined,
  });

  writeHarness({ dir: denied.defaultDir, installed: true, built: true });

  const refused = createScriptedIo();

  assert.equal(await denied.setup({ io: refused }), 0);
  assert.ok(
    refused.lines.some((line) => line.includes('npm link failed: EACCES: permission denied')),
  );
  assert.ok(
    refused.lines.some((line) =>
      line.includes(`alias shv='node ${path.join(denied.repo, 'src', 'cli.ts')}'`),
    ),
  );
});

test('--help and a mistake in the options do not touch anything', async () => {
  const computer = world();

  assert.equal(await computer.setup({ argv: ['--help'] }), 0);
  assert.equal(await computer.setup({ argv: ['--bogus'] }), 2);
  assert.equal(computer.calls.length, 0);
});
