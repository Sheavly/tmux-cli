import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUILD_COMMAND,
  BUILT_ENTRY,
} from '../../src/harness/adapters/sheavly-v1/launch-command.utils.ts';

/** Public, so cloning it needs no sign-in. */
export const DEFAULT_HARNESS_URL = 'https://github.com/Sheavly/harness.git';

/** `~` and `~/x` as the person's home folder; anything else as it is. */
export function expandHome({ value, home = os.homedir() }) {
  if (value === '~') return home;

  return value.startsWith('~/') ? path.join(home, value.slice(2)) : value;
}

/** Whether a folder is the sheavly harness: its root package and the terminal app are there. */
export function isHarness(dir) {
  try {
    const root = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));

    return (
      root.name === '@sheavly/harness' && existsSync(path.join(dir, 'apps/terminal/package.json'))
    );
  } catch {
    return false;
  }
}

export function isBuilt(dir) {
  return existsSync(path.join(dir, BUILT_ENTRY));
}

function isNonEmptyFolder(dir) {
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/** What stops a clone into `dir`, or nothing when the folder is free (or does not exist yet). */
export function cloneTargetProblem(dir) {
  if (!existsSync(dir)) return undefined;

  return isNonEmptyFolder(dir) ? `${dir} already exists and is not empty` : undefined;
}

function failure({ what, result }) {
  return `${what} failed (${result.error ? result.error.message : `exit ${result.status}`}).`;
}

/** Clones the harness. Undefined when it worked, else what to tell the person. */
export function cloneHarness({ run, url, dir }) {
  mkdirSync(path.dirname(dir), { recursive: true });

  const result = run({ command: 'git', args: ['clone', url, dir], inherit: true });

  if (result.status === 0) return undefined;

  return `${failure({ what: 'git clone', result })} If ${url} needs a sign-in, do that first (gh auth login) or pass --harness-url.`;
}

/**
 * The harness's dependencies, with its dev ones: our recap loads the harness's source with its tsx.
 * An install that is there is left alone, so a checkout the person is working in is not disturbed.
 */
export function installHarness({ run, dir }) {
  if (existsSync(path.join(dir, 'node_modules'))) return { skipped: true };

  const result = run({ command: 'npm', args: ['ci'], cwd: dir, inherit: true });

  return result.status === 0 ? {} : { problem: failure({ what: 'npm ci', result }) };
}

/** Builds the harness. It is incremental, so a build that is current takes no time. */
export function buildHarness({ run, dir }) {
  const [command, ...args] = BUILD_COMMAND;
  const result = run({ command, args, cwd: dir, inherit: true });

  if (result.status !== 0) return failure({ what: BUILD_COMMAND.join(' '), result });

  return isBuilt(dir) ? undefined : `The build ran but ${BUILT_ENTRY} is not there.`;
}
