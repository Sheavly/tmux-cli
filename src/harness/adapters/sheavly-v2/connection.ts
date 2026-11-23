import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NPM_PROJECT_VARS } from '../sheavly-v1/launch-command.utils.ts';
import { SHEAVLY_CLI } from './launch-command.utils.ts';

const run = promisify(execFile);

const CONNECTION_TIMEOUT_MS = 10_000;

/** How to reach the user's running server. The token is a secret: it is never put in a message. */
export type Connection = { url: string; token: string };

/** Finds the running server. Called again when the server stopped and another one took over. */
export type ConnectionFinder = () => Promise<Connection>;

/**
 * Asks the harness's own `sheavly connection --json` where its server is, so this program never
 * reads the harness's home folder or its discovery file: the command refuses a stale file, an
 * impostor and a server of another protocol, and prints nothing then.
 */
export function connectionFromCommand(params: { harnessDir: string }): ConnectionFinder {
  return async () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !NPM_PROJECT_VARS.includes(name)),
    );

    try {
      const { stdout } = await run('node', [SHEAVLY_CLI, 'connection', '--json'], {
        cwd: params.harnessDir,
        env,
        timeout: CONNECTION_TIMEOUT_MS,
      });

      return parseConnection(stdout);
    } catch (caughtError) {
      throw new Error(describeFailure(caughtError), { cause: caughtError });
    }
  };
}

/**
 * The connection from the command's output. `npm run` may print a banner before the line, so the
 * last non-empty line is the JSON. A message names what is wrong, never a value.
 */
export function parseConnection(output: string): Connection {
  const line = output
    .split('\n')
    .map((candidate) => candidate.trim())
    .findLast((candidate) => candidate !== '');
  let value: unknown;

  try {
    value = JSON.parse(line ?? '');
  } catch {
    throw new Error('sheavly connection did not print JSON');
  }

  const { url, token } = (typeof value === 'object' && value !== null ? value : {}) as {
    url?: unknown;
    token?: unknown;
  };

  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    throw new Error('sheavly connection printed no http(s) url');
  }

  if (typeof token !== 'string' || token === '') {
    throw new Error('sheavly connection printed no token');
  }

  return { url: url.replace(/\/+$/, ''), token };
}

/** Why the command failed, in a line. The token is never in it: the command prints none on failure. */
function describeFailure(caughtError: unknown): string {
  const { code, stderr } = caughtError as { code?: unknown; stderr?: unknown };

  if (code === 'ENOENT') return 'Cannot run node to find the sheavly server';

  const reason = typeof stderr === 'string' ? stderr.trim().split('\n')[0] : '';

  return `No sheavly server found${reason ? `: ${reason}` : ''} (is \`sheavly serve\` running, and is the harness built?)`;
}
