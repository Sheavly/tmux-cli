/**
 * How a chat is started: from the harness's build (`built`, the default, which is what runs once
 * sheavly is installed as a package) or from its source with tsx (`dev`, for working on the
 * harness itself, where a change shows without building).
 */
export type LaunchMode = 'built' | 'dev';

/** Where the build puts the chat program, in the harness folder. */
export const BUILT_ENTRY = 'apps/terminal/dist/chat.js';

/** The command that builds it, run in the harness folder (incremental: quick when up to date). */
export const BUILD_COMMAND = ['npm', 'run', 'build', '-w', '@sheavly/terminal'];

/** The same chat program from source, with tsx. */
const DEV_COMMAND = ['npm', 'run', '--silent', 'dev', '-w', '@sheavly/terminal', '--'];

/**
 * What npm sets for the project it runs a script in. The harness reads the first to find its
 * backend (`npm run --prefix $npm_config_local_prefix -w @sheavly/backend serve`), so when we were
 * started by npm (`npm run setup`, `npm start`) they name this repository, the backend is not found
 * there and the chat dies with "The backend exited (1) before it listened". The harness is started
 * without them, so it works out where it is from its own folder.
 */
export const NPM_PROJECT_VARS = ['npm_config_local_prefix', 'INIT_CWD'];

const WITHOUT_NPM_PROJECT = `unset ${NPM_PROJECT_VARS.join(' ')}; `;

/**
 * Said in the pane when the harness is not built, which would otherwise be a bare "Cannot find
 * module". It holds no single quote: it goes into a shell command inside single quotes.
 */
const NOT_BUILT = [
  `sheavly-tmux: the harness is not built (${BUILT_ENTRY} is missing).`,
  `In the harness folder run: ${BUILD_COMMAND.join(' ')}`,
  'or run it from source with "mode": "dev" in the sheavly-tmux config.',
].join('\\n');

/** The `mode` setting, checked: anything but the two modes is an error that says what they are. */
export function parseLaunchMode(value: string | undefined): LaunchMode {
  if (value === undefined || value === 'built') return 'built';

  if (value === 'dev') return 'dev';

  throw new Error(`"mode" must be "built" or "dev", not "${value}"`);
}

/** The shell command that starts the chat program, before `--resume` or `--profile` is added. */
export function defaultCommand(mode: LaunchMode): string {
  if (mode === 'dev') return `${WITHOUT_NPM_PROJECT}${DEV_COMMAND.join(' ')} --trust`;

  return `${WITHOUT_NPM_PROJECT}test -f ${BUILT_ENTRY} || { printf '${NOT_BUILT}\\n'; exit 1; }; node ${BUILT_ENTRY} --trust`;
}

/**
 * The program and arguments that open the harness's own setup (its profile, models and keys), which
 * runs in a terminal of its own. Without `--trust`: setup is not the place to trust a folder.
 */
export function setupArgv(mode: LaunchMode): string[] {
  if (mode === 'dev') return [...DEV_COMMAND, '--setup'];

  return ['node', BUILT_ENTRY, '--setup'];
}
