import { parseLaunchMode } from '../../src/harness/adapters/sheavly-v1/launch-command.utils.ts';

export const USAGE = `npm run setup [-- options]

Sets up sheavly-tmux on this computer: checks tmux and Node, installs the dependencies, finds or
clones the sheavly harness and builds it, writes the config, and offers the sheavly-tmux command.
Without options it asks; it is safe to run again.

  --harness <path>      use the harness that is already at <path> (builds it if it needs to)
  --clone <folder>      clone the harness into <folder> and build it
  --harness-url <url>   where to clone it from (default: https://github.com/Sheavly/harness.git)
  --mode built|dev      run the harness from its build (default) or from source, with npm run dev
  --link / --no-link    make sheavly-tmux a command with npm link (default: ask)
  --yes, -y             take every default instead of asking (for scripts)
  --help, -h            this text`;

const SWITCHES = new Map([
  ['--help', ['help', true]],
  ['-h', ['help', true]],
  ['--yes', ['yes', true]],
  ['-y', ['yes', true]],
  ['--link', ['link', 'yes']],
  ['--no-link', ['link', 'no']],
]);
const VALUED = new Map([
  ['--harness', 'harness'],
  ['--clone', 'clone'],
  ['--harness-url', 'url'],
  ['--mode', 'mode'],
]);

/** What the command line asks for. A mistake is an error that says what was wrong. */
export function parseSetupArgs(argv) {
  const options = {
    help: false,
    yes: false,
    link: 'ask',
    harness: undefined,
    clone: undefined,
    url: undefined,
    mode: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const switched = SWITCHES.get(arg);
    const valued = VALUED.get(arg);

    if (switched) {
      options[switched[0]] = switched[1];
    } else if (valued) {
      const value = argv[index + 1];

      if (value === undefined || value.startsWith('-')) throw new Error(`${arg} needs a value`);

      options[valued] = value;
      index += 1;
    } else {
      throw new Error(`Unknown option "${arg}"`);
    }
  }

  if (options.harness !== undefined && options.clone !== undefined) {
    throw new Error('--harness and --clone are two ways to get the harness: pass one');
  }

  if (options.mode !== undefined) parseLaunchMode(options.mode);

  return options;
}
