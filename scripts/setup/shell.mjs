import { spawnSync } from 'node:child_process';
import { NPM_PROJECT_VARS } from '../../src/harness/adapters/sheavly-v1/launch-command.utils.ts';

const NPM_SCRIPT_VAR = /^npm_(?:package|lifecycle)_/;

/**
 * The environment without what npm sets for the project it runs a script in. `npm run setup` is
 * such a script, and the harness reads `npm_config_local_prefix` to find its backend: left in, it
 * names this repository, and the harness's setup dies with "The backend exited (1) before it
 * listened". Nothing we start wants them.
 */
export function cleanNpmEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) => !NPM_PROJECT_VARS.includes(name) && !NPM_SCRIPT_VAR.test(name),
    ),
  );
}

/**
 * Runs a program and says how it went. With `inherit` it uses our terminal (an install, a build,
 * the harness's setup: things the person should see or answer); without, its output is captured.
 * The setup takes this as a parameter, so its tests hand it a recorder instead.
 */
export function runCommand({ command, args = [], cwd, env, inherit = false }) {
  const result = spawnSync(command, args, {
    cwd,
    env: cleanNpmEnv(env ?? process.env),
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}
