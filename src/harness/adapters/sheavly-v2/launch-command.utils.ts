import { NPM_PROJECT_VARS, parseLaunchMode } from '../sheavly-v1/launch-command.utils.ts';

/** Where the build puts the `sheavly` command, in the harness folder. */
export const SHEAVLY_CLI = 'apps/sheavly/dist/cli.js';

/** What to run to build it, in the harness folder. */
const BUILD_COMMAND = 'npm run build -w sheavly';

/**
 * Said in the pane when the harness is not built, which would otherwise be a bare "Cannot find
 * module". It holds no single quote: it goes into a shell command inside single quotes.
 */
const NOT_BUILT = [
  `sheavly-tmux: the harness is not built (${SHEAVLY_CLI} is missing).`,
  `In the harness folder run: ${BUILD_COMMAND}`,
].join('\\n');

/**
 * The shell command that starts a chat on the running server, before `--resume` or `--profile`
 * is added: `sheavly chat`, which finds the server and never starts one, where the chat program
 * on its own would start a backend of its own for each chat and so not be on the server the
 * sidebar asks. The npm variables are removed for the same reason as in sheavly-v1: they would
 * name this repository instead of the harness.
 */
export function chatCommand(mode: string | undefined): string {
  if (parseLaunchMode(mode) === 'dev') {
    throw new Error(
      '"mode" "dev" is not supported by the sheavly-v2 adapter: the sheavly command has no source runner. Use "built" or set "command"',
    );
  }

  return `unset ${NPM_PROJECT_VARS.join(' ')}; test -f ${SHEAVLY_CLI} || { printf '${NOT_BUILT}\\n'; exit 1; }; node ${SHEAVLY_CLI} chat --trust`;
}
