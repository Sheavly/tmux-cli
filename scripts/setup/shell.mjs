import { spawnSync } from 'node:child_process';

/**
 * Runs a program and says how it went. With `inherit` it uses our terminal (an install, a build,
 * the harness's setup: things the person should see or answer); without, its output is captured.
 * The setup takes this as a parameter, so its tests hand it a recorder instead.
 */
export function runCommand({ command, args = [], cwd, env, inherit = false }) {
  const result = spawnSync(command, args, {
    cwd,
    env: env ?? process.env,
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
