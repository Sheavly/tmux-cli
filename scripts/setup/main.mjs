import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSheavlyV1Options } from '../../src/harness/adapters/sheavly-v1/index.ts';
import { parseLaunchMode } from '../../src/harness/adapters/sheavly-v1/launch-command.utils.ts';
import { isOnPath } from '../../src/terminal/executables.ts';
import { parseSetupArgs, USAGE } from './args.mjs';
import {
  configPath,
  planConfig,
  readConfigFile,
  wantedSettings,
  writeConfigFile,
} from './config-file.mjs';
import {
  buildHarness,
  cloneHarness,
  cloneTargetProblem,
  DEFAULT_HARNESS_URL,
  expandHome,
  installHarness,
  isHarness,
} from './harness.mjs';
import { createIo } from './io.mjs';
import { aliasLine, cliPath, isLinked, linkCommand } from './link.mjs';
import { checkTools } from './preflight.mjs';
import { readyProfiles, runHarnessSetup, setupCommandLine, sheavlyHomeOf } from './profile.mjs';
import { runCommand } from './shell.mjs';
import { verifySetup } from './verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STEPS = 7;
const PATH_ATTEMPTS = 3;

function begin({ io, number, title }) {
  io.step(`[${number}/${STEPS}] ${title}`);
}

/**
 * Sets sheavly-tmux up on this computer and returns the exit code. Everything it depends on is a
 * parameter (the program runner, the terminal, the folders), so a test can run it for real against
 * a temporary home and a recorder instead of npm.
 */
export async function runSetup(params) {
  const {
    argv,
    env = process.env,
    home = os.homedir(),
    platform = process.platform,
    repo = REPO,
    run = runCommand,
  } = params;
  const has = params.has ?? ((program) => isOnPath(program, env));
  let options;

  try {
    options = parseSetupArgs(argv);
  } catch (caughtError) {
    console.error(`${caughtError.message}\n\n${USAGE}`);

    return 2;
  }

  if (options.help) {
    console.log(USAGE);

    return 0;
  }

  const io = params.io ?? createIo({ yes: options.yes });

  try {
    await runSteps({ io, run, has, env, home, platform, repo, options });

    return 0;
  } catch (caughtError) {
    io.fail(caughtError.message);

    return 1;
  }
}

async function runSteps(ctx) {
  const { io, env, home } = ctx;

  begin({ io, number: 1, title: 'Checking this computer' });
  preflight(ctx);

  const file = configPath({ env, home });
  const existing = readConfigFile(file);

  begin({ io, number: 2, title: 'Installing sheavly-tmux’s dependencies' });
  installOwnDependencies(ctx);

  begin({ io, number: 3, title: 'The sheavly harness' });

  const { dir, mode } = await prepareHarness({ ctx, existing });

  begin({ io, number: 4, title: 'Writing the config' });
  await writeConfig({ ctx, file, existing, dir, mode });

  begin({ io, number: 5, title: 'Your profile (models and keys)' });
  await profileStep({ ctx, dir, mode });

  begin({ io, number: 6, title: 'The sheavly-tmux command' });
  await linkStep(ctx);

  begin({ io, number: 7, title: 'Checking the result' });
  await verifyStep({ ctx, dir });
}

function preflight({ io, run, platform, has, env }) {
  const { problems, notes } = checkTools({ run, platform, has, env });

  if (problems.length > 0) throw new Error(problems.join('\n    '));

  io.ok('tmux, Node and npm are there');

  for (const note of notes) io.warn(note);
}

function installOwnDependencies({ io, run, repo }) {
  if (existsSync(path.join(repo, 'node_modules', 'shiki'))) {
    io.ok('already installed');

    return;
  }

  const result = run({ command: 'npm', args: ['ci'], cwd: repo, inherit: true });

  if (result.status !== 0) throw new Error('npm ci failed in this repository (see above).');

  io.ok('installed');
}

function resolveDir({ value, home }) {
  return path.resolve(expandHome({ value, home }));
}

/** The harness folder sheavly-tmux looks in when nothing says otherwise. */
function defaultHarnessDir({ home }) {
  return resolveSheavlyV1Options({ settings: {}, env: {}, home }).harnessDir;
}

async function askLocalPath({ ctx, fallback }) {
  const { io, home } = ctx;

  for (let attempt = 0; attempt < PATH_ATTEMPTS; attempt += 1) {
    const answer = await io.ask({ question: 'Where is it?', fallback });
    const dir = resolveDir({ value: answer, home });

    if (isHarness(dir)) return dir;

    io.warn(`${dir} is not the sheavly harness (no package.json named @sheavly/harness there).`);
  }

  throw new Error('No harness folder given. Run npm run setup again, or pass --harness <path>.');
}

/** Where the harness is, and whether we have to clone it: asked unless the options say. */
async function chooseHarness(ctx) {
  const { io, options, home } = ctx;
  const defaultDir = defaultHarnessDir({ home });

  if (options.clone !== undefined) {
    return { dir: resolveDir({ value: options.clone, home }), clone: true };
  }

  if (options.harness !== undefined) {
    return { dir: resolveDir({ value: options.harness, home }), clone: false };
  }

  const found = isHarness(defaultDir);
  const local = await io.confirm({
    question: 'Do you have the sheavly harness on this computer?',
    fallback: found,
  });

  if (local) {
    return { dir: await askLocalPath({ ctx, fallback: found ? defaultDir : '' }), clone: false };
  }

  const answer = await io.ask({ question: 'Where should it be cloned to?', fallback: defaultDir });

  return { dir: resolveDir({ value: answer, home }), clone: true };
}

function clone({ ctx, dir }) {
  const { io, run, has, options } = ctx;
  const url = options.url ?? DEFAULT_HARNESS_URL;
  const problem = cloneTargetProblem(dir);

  if (problem) throw new Error(`${problem}. Pass --harness ${dir} to use it, or another folder.`);

  if (!has('git')) {
    throw new Error('git is needed to clone the harness (or pass --harness <path>).');
  }

  io.info(`Cloning ${url} into ${dir}`);

  const failed = cloneHarness({ run, url, dir });

  if (failed) throw new Error(failed);

  io.ok('cloned');
}

/** How the harness is run: asked of someone who has their own checkout, built for a fresh clone. */
async function chooseMode({ ctx, local, existing }) {
  const { io, options } = ctx;

  if (options.mode !== undefined) return parseLaunchMode(options.mode);

  if (!local) return 'built';

  const built = await io.confirm({
    question:
      'Run it from its build (recommended)? No runs it from source with npm run dev, for working on the harness itself.',
    fallback: existing.mode !== 'dev',
  });

  return built ? 'built' : 'dev';
}

/** Gets the harness there, installed, and built when it is to run from its build. */
async function prepareHarness({ ctx, existing }) {
  const { io, run } = ctx;
  const choice = await chooseHarness(ctx);
  const { dir } = choice;
  let local = !choice.clone;

  if (choice.clone && isHarness(dir)) {
    io.ok(`${dir} is already the harness: using it`);
    local = true;
  } else if (choice.clone) {
    clone({ ctx, dir });
  }

  if (!isHarness(dir)) throw new Error(`${dir} is not the sheavly harness.`);

  const mode = await chooseMode({ ctx, local, existing });
  const installed = installHarness({ run, dir });

  if (installed.problem) throw new Error(installed.problem);

  io.ok(installed.skipped ? 'its dependencies are installed' : 'installed its dependencies');

  if (mode === 'built') {
    io.info('Building it (quick when it is already built)');

    const failed = buildHarness({ run, dir });

    if (failed) throw new Error(failed);

    io.ok('built');
  } else {
    io.ok('runs from source (mode: dev), nothing to build');
  }

  return { dir, mode };
}

async function writeConfig({ ctx, file, existing, dir, mode }) {
  const { io, home } = ctx;
  const wanted = wantedSettings({
    harnessDir: dir,
    defaultDir: defaultHarnessDir({ home }),
    mode,
    existing,
  });
  const { added, conflicts } = planConfig({ existing, wanted });
  const next = { ...existing, ...added };

  for (const { key, from, to } of conflicts) {
    const overwrite = await io.confirm({
      question: `${file} has "${key}": "${from}". Change it to "${to}"?`,
      fallback: false,
    });

    if (overwrite) next[key] = to;
    else io.warn(`kept "${key}": "${from}" as it is`);
  }

  if (JSON.stringify(next) === JSON.stringify(existing)) {
    io.ok(
      Object.keys(existing).length > 0
        ? `${file} already says what it should`
        : 'nothing to write: the defaults fit',
    );

    return;
  }

  writeConfigFile({ file, config: next });
  io.ok(`wrote ${file}`);
}

async function profileStep({ ctx, dir, mode }) {
  const { io, run, env, home, repo, options } = ctx;
  const sheavlyHome = sheavlyHomeOf({ env, home });
  const ready = readyProfiles(sheavlyHome);

  if (ready.length > 0) {
    io.ok(`found: ${ready.join(', ')}`);

    return;
  }

  io.warn('No profile with a model and a key yet, and sheavly cannot answer until there is one.');

  const now =
    io.interactive &&
    !options.yes &&
    (await io.confirm({
      question:
        'Run the harness setup now? It opens its own wizard and then a chat, which you leave with /exit.',
      fallback: true,
    }));

  if (!now) {
    io.info('To set one up, run the harness wizard (it takes your keys, we never see them):');
    io.info(`  ${setupCommandLine({ dir, mode })}`);
    io.info('It also opens by itself the first time you start a chat in sheavly-tmux.');

    return;
  }

  runHarnessSetup({ run, dir, mode, env, workspace: repo });

  if (readyProfiles(sheavlyHome).length > 0) io.ok('profile set up');
  else io.warn(`Still no profile. Try the wizard on its own: ${setupCommandLine({ dir, mode })}`);
}

async function linkStep({ io, run, repo, options }) {
  if (options.link === 'no') {
    io.info('skipped (--no-link)');

    return;
  }

  if (isLinked({ run, repo })) {
    io.ok('sheavly-tmux is already a command');

    return;
  }

  const wanted =
    options.link === 'yes' ||
    (await io.confirm({
      question: 'Make sheavly-tmux a command you can run from anywhere (npm link)?',
      fallback: true,
    }));

  if (!wanted) {
    io.info(`Without it, run: node ${cliPath(repo)}   (or add: ${aliasLine(repo)})`);

    return;
  }

  const problem = linkCommand({ run, repo });

  if (!problem) {
    io.ok('sheavly-tmux is now a command');

    return;
  }

  io.warn(problem);
  io.info(`Run it as: node ${cliPath(repo)}   (or add: ${aliasLine(repo)})`);
}

async function verifyStep({ ctx, dir }) {
  const { io, env, home } = ctx;
  const results = await verifySetup({ env, home, chosenDir: dir });

  for (const { level, text } of results) io[level === 'ok' ? 'ok' : level](text);

  if (results.some(({ level }) => level === 'fail')) {
    throw new Error('The setup finished, but something above is not right.');
  }

  io.say('\nDone. Start it with: sheavly-tmux   (it asks about any key you left unbound)');
}
