import { realpathSync } from 'node:fs';
import path from 'node:path';

/** The program this repository's `sheavly-tmux` command is. */
export function cliPath(repo) {
  return path.join(repo, 'src', 'cli.ts');
}

/** Whether `sheavly-tmux` already runs this repository's program. */
export function isLinked({ run, repo }) {
  const found = run({ command: 'sh', args: ['-c', 'command -v sheavly-tmux'] });

  if (found.status !== 0) return false;

  try {
    return realpathSync(found.stdout.trim()) === realpathSync(cliPath(repo));
  } catch {
    return false;
  }
}

/** Makes `sheavly-tmux` a command. Undefined when it worked, else what npm said. */
export function linkCommand({ run, repo }) {
  const result = run({ command: 'npm', args: ['link'], cwd: repo });

  if (result.status === 0) return undefined;

  const said = `${result.stderr}${result.stdout}`.trim().split('\n').slice(-3).join(' ');

  return `npm link failed${said ? `: ${said}` : ''}`;
}

/** The fallback for a machine where a global npm link is not allowed. */
export function aliasLine(repo) {
  return `alias shv='node ${cliPath(repo)}'`;
}
